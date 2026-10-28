-- Production board: per planner project, scenes → blocks (script lines) → versions (V1, V2…) with
-- generations (photos, videos, links) and revisions. Files live in the private Storage bucket "prod".
-- Team members only (RLS: private.is_member()); grants are explicit (no auto-grants since 2026-10-30).

alter table public.projects add column production boolean not null default false;

create function private.touch_updated() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.prod_scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  position double precision not null default 0,
  title text not null default '' check (length(title) <= 300),
  description text not null default '' check (length(description) <= 5000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prod_scenes_project_id_idx on public.prod_scenes (project_id);

create table public.prod_blocks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  scene_id uuid not null references public.prod_scenes (id) on delete cascade,
  position double precision not null default 0,
  text text not null default '' check (length(text) <= 20000),
  status text not null default 'todo' check (status in ('todo', 'progress', 'review', 'done')),
  ai_note text not null default '' check (length(ai_note) <= 10000),
  assignee_id uuid references public.members (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prod_blocks_project_id_idx on public.prod_blocks (project_id);
create index prod_blocks_scene_id_idx on public.prod_blocks (scene_id);
create index prod_blocks_assignee_id_idx on public.prod_blocks (assignee_id);

create table public.prod_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  block_id uuid not null references public.prod_blocks (id) on delete cascade,
  number integer not null default 1 check (number between 1 and 999),
  note text not null default '' check (length(note) <= 5000),
  created_by text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prod_versions_project_id_idx on public.prod_versions (project_id);
create index prod_versions_block_id_idx on public.prod_versions (block_id);

-- kind: image / video (uploaded: path + thumb_path) or link (url, e.g. Google Drive, Higgsfield).
create table public.prod_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version_id uuid not null references public.prod_versions (id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'link')),
  path text check (length(path) <= 500),
  thumb_path text check (length(thumb_path) <= 500),
  url text check (length(url) <= 2000),
  name text not null default '' check (length(name) <= 300),
  mime text not null default '' check (length(mime) <= 100),
  size bigint,
  position double precision not null default 0,
  deleted_at timestamptz,
  created_by text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (path is not null or url is not null)
);
create index prod_media_project_id_idx on public.prod_media (project_id);
create index prod_media_version_id_idx on public.prod_media (version_id);

create table public.prod_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version_id uuid not null references public.prod_versions (id) on delete cascade,
  text text not null default '' check (length(text) <= 5000),
  image_path text check (length(image_path) <= 500),
  done boolean not null default false,
  author_id uuid references public.members (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prod_revisions_project_id_idx on public.prod_revisions (project_id);
create index prod_revisions_version_id_idx on public.prod_revisions (version_id);
create index prod_revisions_author_id_idx on public.prod_revisions (author_id);
create index prod_revisions_task_id_idx on public.prod_revisions (task_id);

create trigger prod_scenes_touch before update on public.prod_scenes for each row execute function private.touch_updated();
create trigger prod_blocks_touch before update on public.prod_blocks for each row execute function private.touch_updated();
create trigger prod_versions_touch before update on public.prod_versions for each row execute function private.touch_updated();
create trigger prod_media_touch before update on public.prod_media for each row execute function private.touch_updated();
create trigger prod_revisions_touch before update on public.prod_revisions for each row execute function private.touch_updated();

alter table public.prod_scenes enable row level security;
alter table public.prod_blocks enable row level security;
alter table public.prod_versions enable row level security;
alter table public.prod_media enable row level security;
alter table public.prod_revisions enable row level security;
create policy prod_scenes_member on public.prod_scenes for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy prod_blocks_member on public.prod_blocks for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy prod_versions_member on public.prod_versions for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy prod_media_member on public.prod_media for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy prod_revisions_member on public.prod_revisions for all to authenticated using ((select private.is_member())) with check ((select private.is_member()));

revoke insert, select, update, delete, truncate, references, trigger on public.prod_scenes, public.prod_blocks, public.prod_versions, public.prod_media, public.prod_revisions from anon;
revoke truncate, references, trigger on public.prod_scenes, public.prod_blocks, public.prod_versions, public.prod_media, public.prod_revisions from authenticated;
grant select, insert, update, delete on public.prod_scenes, public.prod_blocks, public.prod_versions, public.prod_media, public.prod_revisions to authenticated;
revoke execute on function private.touch_updated() from public, anon;
grant execute on function private.touch_updated() to authenticated;

alter publication supabase_realtime add table public.prod_scenes, public.prod_blocks, public.prod_versions, public.prod_media, public.prod_revisions;

-- ------------------------------------------------------------- files
-- Private bucket; the app shows files through short-lived signed URLs. 50 MB is the free-plan maximum per file.
insert into storage.buckets (id, name, public, file_size_limit)
values ('prod', 'prod', false, 52428800)
on conflict (id) do nothing;

create policy prod_files_select on storage.objects for select to authenticated using (bucket_id = 'prod' and (select private.is_member()));
create policy prod_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'prod' and (select private.is_member()));
create policy prod_files_update on storage.objects for update to authenticated using (bucket_id = 'prod' and (select private.is_member())) with check (bucket_id = 'prod' and (select private.is_member()));
create policy prod_files_delete on storage.objects for delete to authenticated using (bucket_id = 'prod' and (select private.is_member()));
