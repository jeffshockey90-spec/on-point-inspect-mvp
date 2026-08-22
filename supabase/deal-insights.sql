-- "Common Ground" (deal insights): defect prevalence that keeps learning.
--
-- findings.defect_type = the canonical defect key (from lib/dealCatalog.ts) a
-- finding was classified into. defect_prevalence = the rolled-up "% of homes
-- with this issue", national and per-state, recomputed nightly so the numbers
-- adjust as more findings are logged.

alter table public.findings
  add column if not exists defect_type text;
create index if not exists findings_defect_type_idx
  on public.findings (defect_type);

create table if not exists public.defect_prevalence (
  defect_type text not null,
  scope       text not null,          -- 'national' | 'state'
  scope_value text not null,          -- 'US' | 'MD' | ...
  homes_with  integer not null default 0,   -- inspections that had this defect
  homes_total integer not null default 0,   -- inspections in scope (the denominator)
  pct         numeric,                        -- homes_with / homes_total (0..1)
  updated_at  timestamptz not null default now(),
  primary key (defect_type, scope, scope_value)
);
create index if not exists defect_prevalence_type_idx
  on public.defect_prevalence (defect_type);

-- Read only via the service-role report/portal renderers; lock direct access.
alter table public.defect_prevalence enable row level security;

-- Per-company controls: whether to show the Common Ground panel on client
-- reports at all, and whether to show the dollar cost range to the client.
alter table public.companies
  add column if not exists show_common_ground boolean default true,
  add column if not exists show_common_ground_costs boolean default false;
