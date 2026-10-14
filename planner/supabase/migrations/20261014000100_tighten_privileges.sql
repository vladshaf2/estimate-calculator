-- Supabase grants every privilege on new public tables to authenticated by default.
-- Keep only what the app needs (TRUNCATE in particular would bypass RLS).
revoke truncate, references, trigger on public.members, public.workspaces, public.projects, public.statuses, public.work_types, public.tasks from authenticated;
revoke insert, delete, update on public.members from authenticated;
grant update (name_en, name_ru, color, lang) on public.members to authenticated;

-- Evaluate the JWT email once per statement, not per row.
alter policy members_update_own on public.members
  using ((select private.is_member()) and email = (select lower(coalesce(auth.jwt() ->> 'email', ''))))
  with check ((select private.is_member()) and email = (select lower(coalesce(auth.jwt() ->> 'email', ''))));
