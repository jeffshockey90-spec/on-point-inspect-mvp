-- Report Templates — per-company, named section sets. A template auto-applies
-- when its linked service type is booked, and can be switched on a report in the
-- builder. The report SNAPSHOTS the template's section list onto the inspection
-- (inspections.template_sections) so editing a template later never rewrites old
-- reports. Any inspector on the company can build/edit templates.
--
-- Safe to run: idempotent. Run once in the Supabase SQL editor.

create table if not exists public.report_templates (
  id           uuid primary key default gen_random_uuid(),
  company_id   bigint not null references public.companies (id) on delete cascade,
  name         text not null,
  sections     jsonb not null default '[]'::jsonb,   -- ordered array of section names
  service_key  text,                                 -- service_mode this template auto-applies to (nullable)
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists report_templates_company_idx on public.report_templates (company_id);
create index if not exists report_templates_service_idx on public.report_templates (company_id, service_key);

-- Read/written via the service-role client (bypasses RLS); the API gates access
-- to the caller's company. Enable RLS with no permissive policies.
alter table public.report_templates enable row level security;

-- The report's applied template: a snapshot of its section list + the source id.
alter table public.inspections
  add column if not exists template_sections jsonb;
alter table public.inspections
  add column if not exists report_template_id uuid;
