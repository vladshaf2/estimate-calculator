-- Supabase stops auto-granting API access to new public tables (from 2026-10-30).
-- These tables relied on that default; spell the grants out so a fresh project, a preview
-- branch or `supabase db reset` ends up with the same access as production. No-op on production.
grant select on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.estimates to authenticated;
grant select, insert, update on public.calc_settings to authenticated;
grant select on public.estimate_shares to authenticated;
