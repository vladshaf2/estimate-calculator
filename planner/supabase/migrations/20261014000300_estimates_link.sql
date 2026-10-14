-- Calculator ↔ planner.
-- 1) Estimates and calculator settings live in the database for team members (the calculator keeps
--    localStorage as an offline cache). 2) A client share link (token) shows a frozen copy of the client
--    document; the client can accept it, which creates a project with tasks in the planner and notifies the team.

-- ------------------------------------------------------------- estimates
create table public.estimates (
  id text primary key check (length(id) between 1 and 64),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  name text not null default '',
  client text not null default '',
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text not null default lower(coalesce(auth.jwt() ->> 'email', ''))
);
create index estimates_updated_at_idx on public.estimates (updated_at);

-- One row with the shared calculator settings (models, rates, studio details…).
create table public.calc_settings (
  id text primary key default 'team' check (id = 'team'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by text not null default lower(coalesce(auth.jwt() ->> 'email', ''))
);

create function private.touch_row() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := lower(coalesce(auth.jwt() ->> 'email', new.updated_by));
  return new;
end $$;
create trigger estimates_touch before update on public.estimates for each row execute function private.touch_row();
create trigger calc_settings_touch before update on public.calc_settings for each row execute function private.touch_row();

alter table public.estimates enable row level security;
alter table public.calc_settings enable row level security;
create policy estimates_member on public.estimates for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy calc_settings_member on public.calc_settings for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));

-- ------------------------------------------------------------- client share links
create table public.estimate_shares (
  token text primary key default encode(extensions.gen_random_bytes(16), 'hex'),
  estimate_id text not null,
  version integer not null default 1,
  -- Frozen client document: {name, client, lang, total, currency, html: {en, ru}, packages: [{name_en, name_ru, price}],
  -- recommended, plan: {stages: [{name_en, name_ru, from, to}], services: [{name_en, name_ru, hours, work_type}], deadline}, url}
  doc jsonb not null check (jsonb_typeof(doc) = 'object'),
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  updated_at timestamptz not null default now(),
  views integer not null default 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  accepted_at timestamptz,
  accepted_name text,
  accepted_email text,
  accepted_package integer,
  accepted_country text,
  project_id uuid references public.projects (id) on delete set null,
  unique (estimate_id, version)
);
create index estimate_shares_project_id_idx on public.estimate_shares (project_id);

-- An accepted version is frozen: its document can't change (a new version gets a new link).
create function private.shares_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.accepted_at is not null and new.doc is distinct from old.doc then
    raise exception 'accepted estimate versions are locked';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger estimate_shares_guard before update on public.estimate_shares for each row execute function private.shares_guard();

alter table public.estimate_shares enable row level security;
create policy estimate_shares_select on public.estimate_shares for select to authenticated using ((select private.is_member()));
create policy estimate_shares_insert on public.estimate_shares for insert to authenticated with check ((select private.is_member()));
create policy estimate_shares_update on public.estimate_shares for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));

-- Supabase grants everything on new public tables; narrow it down.
revoke insert, select, update, delete, truncate, references, trigger on public.estimates, public.calc_settings, public.estimate_shares from anon;
revoke truncate, references, trigger on public.estimates, public.calc_settings, public.estimate_shares from authenticated;
revoke insert, update, delete on public.estimate_shares from authenticated;
revoke delete on public.calc_settings from authenticated;
grant insert (estimate_id, version, doc) on public.estimate_shares to authenticated;
grant update (doc, revoked) on public.estimate_shares to authenticated;

alter publication supabase_realtime add table public.estimates, public.estimate_shares;

-- ------------------------------------------------------------- public (anon) API for the share page
create function public.get_shared_estimate(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.estimate_shares;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;
  if private.is_member() then
    select * into s from public.estimate_shares where token = p_token and not revoked;
  else
    update public.estimate_shares
      set views = views + 1, first_viewed_at = coalesce(first_viewed_at, now()), last_viewed_at = now()
      where token = p_token and not revoked
      returning * into s;
  end if;
  if s.token is null then return null; end if;
  return jsonb_build_object('doc', s.doc - 'plan', 'version', s.version,
    'accepted', case when s.accepted_at is null then null
      else jsonb_build_object('at', s.accepted_at, 'name', s.accepted_name, 'package', s.accepted_package) end);
end $$;

-- Creates the planner project and tasks for an accepted share. Returns the project id.
create function private.project_from_share(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.estimate_shares;
  ws uuid; pid uuid; st uuid; wt uuid;
  lang text;
  item jsonb;
  i int := 0;
  nm text;
  pkg text;
  deadline timestamptz;
begin
  select * into s from public.estimate_shares where token = p_token;
  select coalesce((select m.lang from public.members m where lower(m.email) = s.created_by), 'ru') into lang;
  select id into ws from public.workspaces order by (key = 'clients') desc nulls last, position limit 1;
  select id into st from public.statuses where not is_done order by (key = 'idea') desc nulls last, position limit 1;
  if s.doc->'plan'->>'deadline' ~ '^\d{4}-\d{2}-\d{2}$' then
    deadline := ((s.doc->'plan'->>'deadline')::date + time '00:00') at time zone 'Europe/Prague';
  end if;
  pkg := case when s.accepted_package is null then null
    else s.doc->'packages'->s.accepted_package->>(case when lang = 'en' then 'name_en' else 'name_ru' end) end;

  insert into public.projects (workspace_id, name, client, color)
  values (ws, left(coalesce(nullif(trim(s.doc->>'name'), ''), 'Estimate') || coalesce(' · ' || pkg, ''), 200), left(coalesce(s.doc->>'client', ''), 200), '#e9b54a')
  returning id into pid;

  -- Kick-off task with the link to the accepted estimate.
  insert into public.tasks (title, notes, workspace_id, project_id, status_id, priority, due_at, due_all_day, links, sort_order)
  values (
    case when lang = 'en' then 'Kick-off: ' else 'Старт проекта: ' end || left(coalesce(nullif(trim(s.doc->>'client'), ''), coalesce(s.doc->>'name', '')), 400),
    case when lang = 'en' then 'Accepted by ' else 'Принято: ' end || coalesce(s.accepted_name, '') || coalesce(' <' || s.accepted_email || '>', '')
      || coalesce(' · ' || pkg, '') || coalesce(' · ' || (s.doc->>'total'), ''),
    ws, pid, st, 2, date_trunc('day', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague', true,
    case when s.doc->>'url' ~ '^https://' then jsonb_build_array(jsonb_build_object('label', case when lang = 'en' then 'Estimate' else 'Смета' end, 'url', s.doc->>'url')) else '[]'::jsonb end,
    i);

  for item in select * from jsonb_array_elements(coalesce(s.doc->'plan'->'stages', '[]'::jsonb)) loop
    i := i + 1;
    nm := nullif(trim(item->>(case when lang = 'en' then 'name_en' else 'name_ru' end)), '');
    continue when nm is null;
    insert into public.tasks (title, workspace_id, project_id, status_id, due_at, due_all_day, sort_order)
    values (left(nm, 500), ws, pid, st,
      case when item->>'to' ~ '^\d{4}-\d{2}-\d{2}$' then ((item->>'to')::date + time '00:00') at time zone 'Europe/Prague' else deadline end,
      true, i);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(s.doc->'plan'->'services', '[]'::jsonb)) loop
    i := i + 1;
    nm := nullif(trim(item->>(case when lang = 'en' then 'name_en' else 'name_ru' end)), '');
    continue when nm is null;
    wt := null;
    if item->>'work_type' is not null then select id into wt from public.work_types where key = item->>'work_type'; end if;
    insert into public.tasks (title, workspace_id, project_id, status_id, work_type_ids, due_at, due_all_day, sort_order)
    values (left(nm || case when (item->>'hours')::numeric > 0 then ' · ' || trim_scale((item->>'hours')::numeric) || case when lang = 'en' then ' h' else ' ч' end else '' end, 500),
      ws, pid, st, case when wt is null then '{}'::uuid[] else array[wt] end, deadline, true, i);
  end loop;
  return pid;
end $$;

create function public.accept_shared_estimate(p_token text, p_name text, p_email text default null, p_package integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.estimate_shares;
  pid uuid;
  m record;
  country text;
  pkg_en text; pkg_ru text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'not found'; end if;
  p_name := trim(coalesce(p_name, ''));
  p_email := nullif(trim(coalesce(p_email, '')), '');
  if length(p_name) < 2 or length(p_name) > 200 then raise exception 'name required'; end if;
  if p_email is not null and (length(p_email) > 200 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'bad email'; end if;

  select * into s from public.estimate_shares where token = p_token and not revoked for update;
  if not found then raise exception 'not found'; end if;
  if s.accepted_at is not null then
    return jsonb_build_object('at', s.accepted_at, 'name', s.accepted_name, 'package', s.accepted_package);
  end if;
  if jsonb_array_length(coalesce(s.doc->'packages', '[]'::jsonb)) > 0 then
    if p_package is null or p_package < 0 or p_package >= jsonb_array_length(s.doc->'packages') then raise exception 'choose a package'; end if;
  else
    p_package := null;
  end if;

  begin
    country := nullif(left(current_setting('request.headers', true)::jsonb ->> 'cf-ipcountry', 2), '');
  exception when others then country := null;
  end;

  update public.estimate_shares
    set accepted_at = now(), accepted_name = p_name, accepted_email = p_email, accepted_package = p_package, accepted_country = country
    where token = p_token;
  pid := private.project_from_share(p_token);
  update public.estimate_shares set project_id = pid where token = p_token;

  pkg_en := case when p_package is null then '' else ' · ' || coalesce(s.doc->'packages'->p_package->>'name_en', '') end;
  pkg_ru := case when p_package is null then '' else ' · ' || coalesce(s.doc->'packages'->p_package->>'name_ru', '') end;
  for m in select id from public.members loop
    perform private.enqueue(m.id, 'accepted', 'accepted:' || p_token || ':' || m.id,
      '✅ Estimate accepted', '✅ Смета принята',
      p_name || ' — ' || coalesce(nullif(s.doc->>'name', ''), 'Estimate') || pkg_en || coalesce(' · ' || (s.doc->>'total'), ''),
      p_name || ' — ' || coalesce(nullif(s.doc->>'name', ''), 'Смета') || pkg_ru || coalesce(' · ' || (s.doc->>'total'), ''),
      null);
  end loop;
  perform private.kick_push();
  return jsonb_build_object('at', now(), 'name', p_name, 'package', p_package);
end $$;

revoke execute on function private.project_from_share(text) from public, anon, authenticated;
revoke execute on function private.touch_row() from public, anon;
revoke execute on function private.shares_guard() from public, anon;
grant execute on function private.touch_row(), private.shares_guard() to authenticated;
revoke execute on function public.get_shared_estimate(text) from public;
revoke execute on function public.accept_shared_estimate(text, text, text, integer) from public;
grant execute on function public.get_shared_estimate(text), public.accept_shared_estimate(text, text, text, integer) to anon, authenticated;
