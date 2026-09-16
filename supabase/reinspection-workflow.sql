-- =====================================================================
-- Limited Repair Re-Inspection — inspector notes, AI drafting, before/after.
--
-- Adds the re-inspection-only narrative columns and widens the immutability
-- trigger from supabase/reinspection-immutability.sql to cover them, so the
-- new fields are protected the same way the verdict already is.
--
-- Run in the Supabase SQL Editor, after supabase/reinspection-immutability.sql.
-- =====================================================================

-- The inspector's note about what they found on re-inspection, and the drafted
-- narrative for it. These columns exist ONLY to hold re-inspection text. The
-- original's observation/implication/recommendation are never written by this
-- workflow, so there is no field here that could overwrite the original
-- narrative even by mistake.
alter table public.findings
  add column if not exists reinspection_note text,
  add column if not exists reinspection_summary text;

comment on column public.findings.reinspection_note is
  'Inspector note recorded during a re-inspection. Never set on an original finding.';
comment on column public.findings.reinspection_summary is
  'Re-inspection narrative (often AI-drafted). Never set on an original finding.';

-- ---------------------------------------------------------------------
-- Widened from the status-only version: a re-inspection VERDICT, NOTE or
-- SUMMARY may only ever land on a re-inspection finding.
--
-- AI drafting writes reinspection_summary, so without this the AI path would
-- have had a weaker guarantee than the checklist it sits next to.
-- ---------------------------------------------------------------------
create or replace function public.enforce_reinspection_status_scope()
returns trigger
language plpgsql
as $$
declare
  is_reinspection boolean;
  touched text;
begin
  if new.reinspection_status is not null
     and new.reinspection_status is distinct from old.reinspection_status then
    touched := 'reinspection_status';
  elsif new.reinspection_note is not null
     and new.reinspection_note is distinct from old.reinspection_note then
    touched := 'reinspection_note';
  elsif new.reinspection_summary is not null
     and new.reinspection_summary is distinct from old.reinspection_summary then
    touched := 'reinspection_summary';
  else
    return new;
  end if;

  select (i.parent_inspection_id is not null)
    into is_reinspection
    from public.inspections i
   where i.id = new.inspection_id;

  if coalesce(is_reinspection, false) = false then
    raise exception
      '% may only be set on a re-inspection finding; finding % belongs to original inspection %',
      touched, new.id, new.inspection_id
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists findings_reinspection_status_scope on public.findings;

create trigger findings_reinspection_status_scope
  before insert or update of reinspection_status, reinspection_note, reinspection_summary
  on public.findings
  for each row
  execute function public.enforce_reinspection_status_scope();
