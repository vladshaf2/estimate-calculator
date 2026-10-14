-- Chiefs Planner — core schema.
-- One team (Vlad + Igor). Access rule everywhere: the signed-in user's email must be in public.members.

create schema if not exists private;

-- ---------------------------------------------------------------- members
create table public.members (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name_en text not null,
  name_ru text not null,
  color text not null default '#e9b54a',
  lang text not null default 'ru' check (lang in ('ru', 'en')),
  created_at timestamptz not null default now()
);

-- Membership check used by every policy. SECURITY DEFINER so it can read members without
-- recursing into members' own RLS; lives in the non-exposed "private" schema.
-- The email claim comes from Supabase Auth (verified by the login code), not from user metadata.
create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;
revoke execute on function private.is_member() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_member() to authenticated;

-- ---------------------------------------------------------------- lookup tables
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  name_en text not null,
  name_ru text not null,
  color text not null default '#8d8d96',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  client text not null default '',
  color text not null default '#e9b54a',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index projects_workspace_id_idx on public.projects (workspace_id);

create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  name_en text not null,
  name_ru text not null,
  color text not null default '#8d8d96',
  position integer not null default 0,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.work_types (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  name_en text not null,
  name_ru text not null,
  color text not null default '#8d8d96',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 500),
  notes text not null default '',
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  status_id uuid references public.statuses (id) on delete set null,
  work_type_ids uuid[] not null default '{}',
  assignee_id uuid references public.members (id) on delete set null,
  priority smallint not null default 0 check (priority between 0 and 3),
  due_at timestamptz,
  due_all_day boolean not null default true,
  remind_at timestamptz,
  platform text check (platform in ('instagram', 'tiktok', 'youtube')),
  publish_at timestamptz,
  hook text not null default '',
  caption text not null default '',
  links jsonb not null default '[]' check (jsonb_typeof(links) = 'array'),
  checklist jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array'),
  sort_order double precision not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index tasks_workspace_id_idx on public.tasks (workspace_id);
create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_status_id_idx on public.tasks (status_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);
create index tasks_created_by_idx on public.tasks (created_by);
create index tasks_due_at_idx on public.tasks (due_at) where due_at is not null;
create index tasks_publish_at_idx on public.tasks (publish_at) where publish_at is not null;

-- updated_at + completed_at bookkeeping
create or replace function private.tasks_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
    if exists (select 1 from public.statuses s where s.id = new.status_id and s.is_done) then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;
grant execute on function private.tasks_touch() to authenticated;
create trigger tasks_touch before insert or update on public.tasks
  for each row execute function private.tasks_touch();

-- ---------------------------------------------------------------- RLS
alter table public.members enable row level security;
alter table public.workspaces enable row level security;
alter table public.projects enable row level security;
alter table public.statuses enable row level security;
alter table public.work_types enable row level security;
alter table public.tasks enable row level security;

create policy members_select on public.members for select to authenticated
  using ((select private.is_member()));
create policy members_update_own on public.members for update to authenticated
  using ((select private.is_member()) and email = lower(coalesce((select auth.jwt() ->> 'email'), '')))
  with check ((select private.is_member()) and email = lower(coalesce((select auth.jwt() ->> 'email'), '')));

do $$
declare t text;
begin
  foreach t in array array['workspaces', 'projects', 'statuses', 'work_types', 'tasks'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using ((select private.is_member()))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check ((select private.is_member()))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using ((select private.is_member())) with check ((select private.is_member()))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using ((select private.is_member()))', t);
  end loop;
end $$;

-- Data API access: signed-in users only (rows are still filtered by RLS); nothing for anon.
revoke all on public.members, public.workspaces, public.projects, public.statuses, public.work_types, public.tasks from anon;
grant select, update (name_en, name_ru, color, lang) on public.members to authenticated;
grant select, insert, update, delete on public.workspaces, public.projects, public.statuses, public.work_types, public.tasks to authenticated;

-- Realtime (postgres_changes respects RLS)
alter publication supabase_realtime add table public.members, public.workspaces, public.projects, public.statuses, public.work_types, public.tasks;

-- ---------------------------------------------------------------- seed data
insert into public.members (email, name_en, name_ru, color, lang) values
  ('vladshaf2@gmail.com', 'Vlad', 'Влад', '#e9b54a', 'ru'),
  ('chiefs.prod.ai@gmail.com', 'Igor', 'Игорь', '#60a5fa', 'ru');

insert into public.workspaces (key, name_en, name_ru, color, position) values
  ('clients', 'Clients', 'Клиенты', '#e9b54a', 0),
  ('content', 'Chiefs Content', 'Контент Chiefs', '#d92030', 1);

insert into public.statuses (key, name_en, name_ru, color, position, is_done) values
  ('idea', 'Idea', 'Идея', '#8d8d96', 0, false),
  ('discussion', 'Discussion', 'В обсуждении', '#a78bfa', 1, false),
  ('in_progress', 'In progress', 'В работе', '#60a5fa', 2, false),
  ('needs_fix', 'Needs fix', 'Поправить', '#f97316', 3, false),
  ('client_review', 'Client review', 'На согласовании', '#e9b54a', 4, false),
  ('done', 'Done', 'Готово', '#58c493', 5, true),
  ('published', 'Published', 'Опубликовано', '#2dd4bf', 6, true);

insert into public.work_types (key, name_en, name_ru, color, position) values
  ('video', 'Video', 'Видео', '#ef4444', 0),
  ('photo', 'Photo', 'Фото', '#f59e0b', 1),
  ('edit', 'Edit', 'Эдит', '#ec4899', 2),
  ('video_editing', 'Video editing', 'Монтаж', '#8b5cf6', 3),
  ('previz', 'Previz', 'Превиз', '#06b6d4', 4),
  ('sound', 'Sound', 'Звук', '#22c55e', 5),
  ('reel', 'Reel', 'Рилс', '#f43f5e', 6),
  ('post', 'Post', 'Пост', '#3b82f6', 7),
  ('story', 'Story', 'Сторис', '#eab308', 8);
