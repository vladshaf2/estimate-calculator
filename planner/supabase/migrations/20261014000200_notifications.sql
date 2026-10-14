-- Push notifications: reminders, due dates, posts in 30 min, new assignments.
-- pg_cron runs every minute: private.enqueue_due() fills the outbox, private.kick_push() wakes the
-- "push-dispatch" Edge Function, which sends Web Push messages and marks rows as sent.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------------- preferences
alter table public.members
  add column notify jsonb not null default '{"remind": true, "due": true, "post": true, "assigned": true, "accepted": true}',
  add column quiet_from smallint check (quiet_from between 0 and 23),
  add column quiet_to smallint check (quiet_to between 0 and 23);
grant update (name_en, name_ru, color, lang, notify, quiet_from, quiet_to) on public.members to authenticated;

-- ------------------------------------------------------------- devices
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index push_subscriptions_email_idx on public.push_subscriptions (email);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for select to authenticated
  using (private.is_member() and email = (select lower(coalesce(auth.jwt() ->> 'email', ''))));
-- Supabase grants everything on new public tables; devices are written only through push_subscribe().
revoke insert, select, update, delete, truncate, references, trigger on public.push_subscriptions from anon;
revoke insert, update, delete, truncate, references, trigger on public.push_subscriptions from authenticated;

-- ------------------------------------------------------------- private state
create table private.push_config (key text primary key, value text not null);
create table private.notification_outbox (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null,
  dedup text not null unique,
  title text not null,
  body text not null default '',
  url text not null default '',
  send_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  error text
);
create index notification_outbox_pending_idx on private.notification_outbox (send_after) where sent_at is null;
create index notification_outbox_member_idx on private.notification_outbox (member_id);
-- private.* is not exposed by the API and has no grants for anon/authenticated.

insert into private.push_config (key, value) values
  ('dispatch_secret', encode(extensions.gen_random_bytes(24), 'hex')),
  ('app_url', 'https://vladshaf2.github.io/estimate-calculator/planner/'),
  ('fn_url', 'https://wvyvyodquijdxqdidcft.supabase.co/functions/v1/push-dispatch');

-- ------------------------------------------------------------- enqueue
-- Adds one message for one member, in their language, respecting their per-kind switches and
-- quiet hours (Prague time; messages wait until the quiet period ends).
create function private.enqueue(p_member uuid, p_kind text, p_dedup text, p_title_en text, p_title_ru text,
  p_body_en text, p_body_ru text, p_task uuid, p_at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.members;
  v_after timestamptz := p_at;
  h int;
  base text;
begin
  select * into m from public.members where id = p_member;
  if not found or coalesce((m.notify ->> p_kind)::boolean, true) = false then return; end if;
  if m.quiet_from is not null and m.quiet_to is not null and m.quiet_from <> m.quiet_to then
    h := extract(hour from p_at at time zone 'Europe/Prague');
    if (m.quiet_from < m.quiet_to and h >= m.quiet_from and h < m.quiet_to)
       or (m.quiet_from > m.quiet_to and (h >= m.quiet_from or h < m.quiet_to)) then
      v_after := (date_trunc('day', p_at at time zone 'Europe/Prague') + make_interval(hours => m.quiet_to)) at time zone 'Europe/Prague';
      if v_after <= p_at then v_after := v_after + interval '1 day'; end if;
    end if;
  end if;
  select value into base from private.push_config where key = 'app_url';
  insert into private.notification_outbox (member_id, kind, dedup, title, body, url, send_after)
  values (p_member, p_kind, p_dedup,
    case when m.lang = 'en' then p_title_en else p_title_ru end,
    case when m.lang = 'en' then p_body_en else p_body_ru end,
    coalesce(base, '') || case when p_task is null then '' else '#/list/smart:all/' || p_task end,
    v_after)
  on conflict (dedup) do nothing;
end $$;

-- Who hears about a task: its assignee, or everyone when nobody is assigned.
create function private.task_recipients(p_assignee uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.members where p_assignee is null or id = p_assignee;
$$;

-- Everything that became due in the last 15 minutes (the window covers a missed cron tick).
create function private.enqueue_due() returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  rid uuid;
  prg text;
  ala text;
begin
  for r in
    with live as (
      select t.* from public.tasks t left join public.statuses s on s.id = t.status_id
      where not coalesce(s.is_done, false)
    ), ev as (
      select id, title, assignee_id, 'remind' as kind, remind_at as fire_at, null::timestamptz as pub, false as all_day from live where remind_at is not null
      union all
      select id, title, assignee_id, 'due',
        case when due_all_day then ((due_at at time zone 'Europe/Prague')::date + time '09:00') at time zone 'Europe/Prague' else due_at end,
        null, due_all_day from live where due_at is not null
      union all
      select id, title, assignee_id, 'post', publish_at - interval '30 minutes', publish_at, false from live where publish_at is not null
    )
    select * from ev where fire_at > now() - interval '15 minutes' and fire_at <= now()
  loop
    for rid in select private.task_recipients(r.assignee_id) loop
      if r.kind = 'remind' then
        perform private.enqueue(rid, 'remind', 'remind:' || r.id || ':' || extract(epoch from r.fire_at)::bigint || ':' || rid,
          '⏰ Reminder', '⏰ Напоминание', r.title, r.title, r.id, r.fire_at);
      elsif r.kind = 'due' then
        perform private.enqueue(rid, 'due', 'due:' || r.id || ':' || extract(epoch from r.fire_at)::bigint || ':' || rid,
          case when r.all_day then '📅 Due today' else '📅 Due now' end,
          case when r.all_day then '📅 Срок сегодня' else '📅 Срок — сейчас' end, r.title, r.title, r.id, r.fire_at);
      else
        prg := to_char(r.pub at time zone 'Europe/Prague', 'HH24:MI');
        ala := to_char(r.pub at time zone 'Asia/Almaty', 'HH24:MI');
        perform private.enqueue(rid, 'post', 'post:' || r.id || ':' || extract(epoch from r.pub)::bigint || ':' || rid,
          '📣 Post in 30 min', '📣 Публикация через 30 минут',
          r.title || ' · Prague ' || prg || ' · Almaty ' || ala, r.title || ' · Прага ' || prg || ' · Алматы ' || ala, r.id, r.fire_at);
      end if;
    end loop;
  end loop;
end $$;

-- Wakes the Edge Function only when something is waiting.
create function private.kick_push() returns void language plpgsql security definer set search_path = '' as $$
declare u text; s text;
begin
  if not exists (select 1 from private.notification_outbox where sent_at is null and send_after <= now() and attempts < 5) then return; end if;
  select value into u from private.push_config where key = 'fn_url';
  select value into s from private.push_config where key = 'dispatch_secret';
  perform net.http_post(url := u, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', s), timeout_milliseconds := 15000);
end $$;

-- New assignee (set by someone else) → tell them right away.
create function private.tasks_notify_assign() returns trigger language plpgsql security definer set search_path = '' as $$
declare actor public.members;
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    select * into actor from public.members where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
    if actor.id is distinct from new.assignee_id then
      perform private.enqueue(new.assignee_id, 'assigned', 'assigned:' || new.id || ':' || new.assignee_id || ':' || extract(epoch from now())::bigint,
        '👤 New task for you', '👤 Новая задача для вас',
        new.title || coalesce(' — ' || actor.name_en, ''), new.title || coalesce(' — ' || actor.name_ru, ''), new.id);
      perform private.kick_push();
    end if;
  end if;
  return new;
end $$;
create trigger tasks_notify_assign after insert or update of assignee_id on public.tasks
  for each row execute function private.tasks_notify_assign();


-- ------------------------------------------------------------- API for the app
create function public.push_public_key() returns text language sql stable security definer set search_path = '' as $$
  select value from private.push_config where key = 'vapid_public' and private.is_member();
$$;

-- Old rows for a device are replaced; endpoints a browser dropped are removed by push-dispatch (HTTP 404/410).
create function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member() then raise exception 'not a member'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 2000 then raise exception 'bad endpoint'; end if;
  insert into public.push_subscriptions (email, endpoint, p256dh, auth, user_agent)
  values (lower(auth.jwt() ->> 'email'), p_endpoint, p_p256dh, p_auth, left(coalesce(p_ua, ''), 300))
  on conflict (endpoint) do update set email = excluded.email, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, created_at = now();
end $$;

create function public.push_test() returns void language plpgsql security definer set search_path = '' as $$
declare m public.members;
begin
  select * into m from public.members where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  if not found then raise exception 'not a member'; end if;
  insert into private.notification_outbox (member_id, kind, dedup, title, body, url)
  values (m.id, 'test', 'test:' || m.id || ':' || extract(epoch from clock_timestamp()),
    case when m.lang = 'en' then '🔔 Notifications work' else '🔔 Уведомления работают' end,
    case when m.lang = 'en' then 'Chiefs Planner will remind you about tasks and posts.' else 'Chiefs Planner напомнит о задачах и публикациях.' end,
    coalesce((select value from private.push_config where key = 'app_url'), ''));
  perform private.kick_push();
end $$;

revoke execute on function private.enqueue(uuid, text, text, text, text, text, text, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function private.task_recipients(uuid) from public, anon, authenticated;
revoke execute on function private.enqueue_due() from public, anon, authenticated;
revoke execute on function private.kick_push() from public, anon, authenticated;
revoke execute on function private.tasks_notify_assign() from public, anon;
grant execute on function private.tasks_notify_assign() to authenticated;
revoke execute on function public.push_public_key() from public, anon;
revoke execute on function public.push_test() from public, anon;
revoke execute on function public.push_subscribe(text, text, text, text) from public, anon;
grant execute on function public.push_public_key(), public.push_test(), public.push_subscribe(text, text, text, text) to authenticated;

-- ------------------------------------------------------------- schedule
select cron.schedule('planner-push', '* * * * *', $$select private.enqueue_due(); select private.kick_push();$$);
