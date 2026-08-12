-- Live report sync: let the browser receive realtime change events for a
-- report's findings and report-level fields, so a device that is only viewing
-- a report auto-updates when it's edited on another device (ReportLiveSync).
--
-- The app already uses Supabase Realtime (inspection_view_events); this just
-- adds two more tables to the same publication. Safe to run: idempotent
-- (only adds a table if it isn't already published). Run once in the SQL editor.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'findings'
  ) then
    alter publication supabase_realtime add table public.findings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inspections'
  ) then
    alter publication supabase_realtime add table public.inspections;
  end if;
end $$;

-- Realtime delivers changes only for rows the subscriber can SELECT under RLS.
-- Inspectors already read their own findings/inspections in the report editor,
-- so no new policy is needed. (If these tables ever have RLS enabled without a
-- matching SELECT policy for inspectors, realtime rows would stop arriving.)
