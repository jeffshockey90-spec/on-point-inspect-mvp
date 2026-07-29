-- Free-form notes/custom info block per report section (built for custom
-- sections, but works for any section_name). Shown above the findings list
-- for that section in the report builder, share page, and print/PDF view.
-- Run in the Supabase SQL Editor.

create table if not exists public.report_section_notes (
  id uuid primary key default gen_random_uuid(),
  inspection_id bigint not null references public.inspections(id) on delete cascade,
  section_name text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, section_name)
);

create index if not exists report_section_notes_inspection_id_idx
  on public.report_section_notes (inspection_id);

alter table public.report_section_notes enable row level security;

drop policy if exists "Inspectors manage own report section notes" on public.report_section_notes;
create policy "Inspectors manage own report section notes"
on public.report_section_notes
for all
to authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id = report_section_notes.inspection_id
    and inspections.inspector_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.inspections
    where inspections.id = report_section_notes.inspection_id
    and inspections.inspector_id = auth.uid()
  )
);

drop policy if exists "Report section notes on published inspections are publicly readable" on public.report_section_notes;
create policy "Report section notes on published inspections are publicly readable"
on public.report_section_notes
for select
to anon, authenticated
using (
  exists (
    select 1 from public.inspections
    where inspections.id = report_section_notes.inspection_id
    and inspections.published = true
  )
);
