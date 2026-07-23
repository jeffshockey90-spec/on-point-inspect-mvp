-- Per-inspection overrides to the fixed 12-section report layout:
--   - a row with is_custom = true is an extra section the inspector added
--     (e.g. "Pool", "Guest House") - it doesn't exist in the built-in list
--   - a row with is_custom = false records that one of the built-in
--     sections was deleted for this specific inspection
-- In both cases, deleted_at set = hidden; deleted_at null = active. Nothing
-- is ever hard-deleted here so a section (and the findings still tagged
-- with that section name) can always be restored.
--
-- Named report_section_overrides (not report_sections) because a
-- pre-existing, unrelated report_sections table already exists in this
-- database (id/created_at/section_number/section_name, no inspection_id).
--
-- Run in the Supabase SQL Editor.

create table if not exists public.report_section_overrides (
  id uuid primary key default gen_random_uuid(),
  inspection_id bigint not null references public.inspections(id) on delete cascade,
  section_name text not null,
  is_custom boolean not null default true,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (inspection_id, section_name)
);

create index if not exists report_section_overrides_inspection_id_idx
  on public.report_section_overrides (inspection_id);

alter table public.report_section_overrides enable row level security;

drop policy if exists "Inspectors manage own report section overrides" on public.report_section_overrides;
create policy "Inspectors manage own report section overrides"
on public.report_section_overrides
for all
to authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id = report_section_overrides.inspection_id
    and inspections.inspector_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.inspections
    where inspections.id = report_section_overrides.inspection_id
    and inspections.inspector_id = auth.uid()
  )
);

drop policy if exists "Report section overrides on published inspections are publicly readable" on public.report_section_overrides;
create policy "Report section overrides on published inspections are publicly readable"
on public.report_section_overrides
for select
to anon, authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id = report_section_overrides.inspection_id
    and inspections.published = true
  )
);
