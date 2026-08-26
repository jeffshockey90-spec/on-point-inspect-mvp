-- Enable Supabase realtime for the findings table so a report that's already
-- OPEN on one device auto-updates the moment a finding is added/edited/removed
-- on another device. RLS still applies — an inspector only receives changes to
-- findings they can already read. Capture/save code is unchanged; this only
-- affects the read/view side.
--
-- Safe to run: idempotent (only adds the table if it isn't already published).
-- Run once in the Supabase SQL editor.

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
end $$;
