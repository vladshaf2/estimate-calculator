-- 1) Push notification when a revision is added on the production board.
-- 2) Client share links for a production board: the public page is served by the Edge Function
--    "prod-share" (it signs file URLs), so prod_shares itself is members-only.

alter table public.prod_revisions add column client_name text check (length(client_name) <= 100);

create table public.prod_shares (
  token text primary key default encode(extensions.gen_random_bytes(16), 'hex'),
  project_id uuid not null references public.projects (id) on delete cascade,
  allow_comments boolean not null default true,
  revoked boolean not null default false,
  views integer not null default 0,
  last_viewed_at timestamptz,
  created_by text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at timestamptz not null default now()
);
create index prod_shares_project_id_idx on public.prod_shares (project_id);
alter table public.prod_shares enable row level security;
create policy prod_shares_select on public.prod_shares for select to authenticated using ((select private.is_member()));
create policy prod_shares_insert on public.prod_shares for insert to authenticated with check ((select private.is_member()));
create policy prod_shares_update on public.prod_shares for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));
revoke insert, select, update, delete, truncate, references, trigger on public.prod_shares from anon;
revoke insert, update, delete, truncate, references, trigger on public.prod_shares from authenticated;
grant select on public.prod_shares to authenticated;
grant insert (project_id, allow_comments) on public.prod_shares to authenticated;
grant update (allow_comments, revoked) on public.prod_shares to authenticated;
alter publication supabase_realtime add table public.prod_shares;

-- "1.2" / "1.1 + 1.2" label of a block (or merged row) as the board shows it.
create function private.prod_block_label(p_block uuid) returns text
language sql stable security definer set search_path = '' as $$
  with b as (select * from public.prod_blocks where id = p_block),
  sc as (select s.* from public.prod_scenes s join b on s.id = b.scene_id),
  sno as (
    select count(*) + 1 as n from public.prod_scenes s, sc
    where s.project_id = sc.project_id and s.deleted_at is null and (s.position, s.created_at) < (sc.position, sc.created_at)
  ),
  live as (
    select x.id, row_number() over (order by x.position, x.created_at) as n
    from public.prod_blocks x, b where x.scene_id = b.scene_id and x.deleted_at is null
  )
  select string_agg((select n from sno) || '.' || live.n, ' + ' order by live.n)
  from live join public.prod_blocks m on m.id = live.id, b
  where m.id = b.id or (b.group_id = b.id and m.group_id = b.id);
$$;

create function private.prod_revision_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  b public.prod_blocks;
  p public.projects;
  actor public.members;
  label text;
  base text;
  path text;
  rid uuid;
  d text;
  client boolean := new.client_name is not null;
begin
  select bl.* into b from public.prod_versions v join public.prod_blocks bl on bl.id = v.block_id where v.id = new.version_id;
  if not found then return new; end if;
  select * into p from public.projects where id = new.project_id;
  select * into actor from public.members where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  label := coalesce(private.prod_block_label(b.id), '');
  select value into base from private.push_config where key = 'app_url';
  path := '#/prod/' || p.id || '/' || b.scene_id;
  for rid in
    select id from public.members
    where case when b.assignee_id is not null and b.assignee_id is distinct from actor.id then id = b.assignee_id
               else id is distinct from actor.id end
  loop
    d := 'revision:' || new.id || ':' || rid;
    perform private.enqueue(rid, 'revision', d,
      case when client then '💬 Client revision · ' else '✏️ New revision · ' end || label,
      case when client then '💬 Правка от клиента · ' else '✏️ Новая правка · ' end || label,
      p.name || ' — ' || coalesce(new.client_name || ': ', '') || left(new.text, 200),
      p.name || ' — ' || coalesce(new.client_name || ': ', '') || left(new.text, 200),
      null);
    update private.notification_outbox set url = coalesce(base, '') || path where dedup = d;
  end loop;
  perform private.kick_push();
  return new;
end $$;
create trigger prod_revisions_notify after insert on public.prod_revisions
  for each row execute function private.prod_revision_notify();

revoke execute on function private.prod_block_label(uuid) from public, anon, authenticated;
revoke execute on function private.prod_revision_notify() from public, anon;
grant execute on function private.prod_revision_notify() to authenticated;
