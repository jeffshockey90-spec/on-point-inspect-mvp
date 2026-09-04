-- Tracks ACTIVE report-editing time (the write-up phase: editing findings +
-- going through section checklists in the report builder). Accumulated in
-- seconds from a foreground/visible-only heartbeat, so it excludes overnight
-- gaps and the physical inspection — it's the "finished the report in X minutes"
-- number for analytics/marketing. Idempotent; run once in Supabase SQL.

alter table public.inspections
  add column if not exists report_edit_seconds integer not null default 0;

-- Atomic increment so overlapping heartbeat flushes don't clobber each other.
create or replace function public.increment_report_edit_seconds(
  p_inspection_id bigint,
  p_seconds integer
) returns void
language sql
as $$
  update public.inspections
     set report_edit_seconds = coalesce(report_edit_seconds, 0) + greatest(0, least(p_seconds, 600))
   where id = p_inspection_id;
$$;
