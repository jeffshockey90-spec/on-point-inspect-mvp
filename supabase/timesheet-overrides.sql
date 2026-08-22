-- =====================================================================
-- Manual timesheet corrections. GPS arrival/departure auto-captures on-site
-- hours, but departure detection isn't always reliable (session left open, no
-- departure logged). This lets the inspector or company owner set the correct
-- hours for an inspection so payroll is trustworthy regardless of GPS.
--
-- One row per inspection. `hours` null + a note can be used to just annotate.
-- Writes go through the service-role /api/timesheets/override route, which
-- checks the caller owns (or is the company owner over) that inspection.
-- =====================================================================
create or replace function public.is_platform_owner()
returns boolean language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '')
         in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com');
$$;

create table if not exists public.timesheet_overrides (
  inspection_id bigint primary key,
  user_id       uuid not null,       -- the inspection's inspector (whose hours these are)
  hours         numeric(6, 2),       -- corrected on-site hours; null = no hours, note only
  note          text,
  updated_by    uuid,                -- who made the correction
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.timesheet_overrides enable row level security;

do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'timesheet_overrides'
  loop execute format('drop policy if exists %I on public.timesheet_overrides', p.policyname); end loop;
end $$;

-- Direct reads: the owning inspector or the platform owner. The timesheets page
-- reads via service-role (scoped to the team), so team owners see team rows there.
create policy timesheet_overrides_read on public.timesheet_overrides
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_owner());
