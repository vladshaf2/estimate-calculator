-- Merged blocks: blocks generated with one prompt share the lead block's status, versions and revisions.
-- group_id = id of the lead block (the lead points to itself); null = not merged.
alter table public.prod_blocks add column group_id uuid references public.prod_blocks (id) on delete set null;
create index prod_blocks_group_id_idx on public.prod_blocks (group_id);
