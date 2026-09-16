-- =====================================================================
-- Limited Repair Re-Inspection — keep the ORIGINAL report immutable.
--
-- The original inspection report is historical documentation. The
-- re-inspection workflow may read it freely and must never write to it.
-- lib/reinspection.ts enforces that in the application; this file is the
-- backstop for anything that bypasses it — a stray query, a future route, a
-- hand-run UPDATE in the SQL editor.
--
-- Run in the Supabase SQL Editor, after supabase/reinspection.sql.
-- =====================================================================

-- Which original finding a re-inspection finding was copied from. A reference
-- for reading history only; nothing writes through it. ON DELETE SET NULL, so
-- removing an original never cascades into deleting re-inspection history, and
-- a re-inspection finding is never silently destroyed by activity on the
-- original.
-- Column type is derived from findings.id rather than hardcoded: findings.id is
-- bigint in the live database while supabase/schema.sql still describes it as
-- uuid, and a mismatch makes the foreign key below fail outright (42804).
do $$
declare
  id_type text;
  existing_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into id_type
    from pg_attribute a
   where a.attrelid = 'public.findings'::regclass
     and a.attname = 'id'
     and a.attnum > 0 and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod)
    into existing_type
    from pg_attribute a
   where a.attrelid = 'public.findings'::regclass
     and a.attname = 'source_finding_id'
     and a.attnum > 0 and not a.attisdropped;

  if existing_type is null then
    execute format('alter table public.findings add column source_finding_id %s', id_type);

  elsif existing_type is distinct from id_type then
    -- Left behind by an earlier run of this script that hardcoded the wrong
    -- type. Replacing it is only safe while nothing has been written through
    -- it; if it holds data, stop rather than destroy a reference.
    if exists (select 1 from public.findings where source_finding_id is not null) then
      raise exception
        'source_finding_id is % but findings.id is %, and the column already holds data - migrate it by hand',
        existing_type, id_type
        using errcode = 'check_violation';
    end if;

    execute 'alter table public.findings drop column source_finding_id';
    execute format('alter table public.findings add column source_finding_id %s', id_type);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'findings_source_finding_id_fkey'
  ) then
    alter table public.findings
      add constraint findings_source_finding_id_fkey
      foreign key (source_finding_id) references public.findings(id) on delete set null;
  end if;
end $$;

create index if not exists findings_source_finding_id_idx
  on public.findings (source_finding_id);

-- ---------------------------------------------------------------------
-- A re-inspection verdict may only ever land on a re-inspection finding.
--
-- This is the failure the application guard exists to prevent, written down
-- where it cannot be skipped: the PATCH endpoint used to check only that the
-- caller OWNED the inspection the finding belonged to, so passing the id of an
-- ORIGINAL finding stamped reinspection_status straight onto the historical
-- record. Owning a report is not permission to rewrite it.
-- ---------------------------------------------------------------------
create or replace function public.enforce_reinspection_status_scope()
returns trigger
language plpgsql
as $$
declare
  is_reinspection boolean;
begin
  if new.reinspection_status is null
     or new.reinspection_status is not distinct from old.reinspection_status then
    return new;
  end if;

  select (i.parent_inspection_id is not null)
    into is_reinspection
    from public.inspections i
   where i.id = new.inspection_id;

  if coalesce(is_reinspection, false) = false then
    raise exception
      'reinspection_status may only be set on a re-inspection finding; finding % belongs to original inspection %',
      new.id, new.inspection_id
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists findings_reinspection_status_scope on public.findings;

create trigger findings_reinspection_status_scope
  before insert or update of reinspection_status on public.findings
  for each row
  execute function public.enforce_reinspection_status_scope();

-- ---------------------------------------------------------------------
-- An inspection may not become someone's child after the fact.
--
-- Re-parenting an existing ORIGINAL inspection would retroactively turn a
-- historical report into a re-inspection — unlocking the verdict trigger above
-- and reframing the document for the client. parent_inspection_id is therefore
-- write-once: set at creation, never changed afterwards.
-- ---------------------------------------------------------------------
create or replace function public.enforce_parent_inspection_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.parent_inspection_id is distinct from new.parent_inspection_id then
    raise exception
      'parent_inspection_id is write-once (inspection %); create a new re-inspection instead of re-parenting an existing report',
      new.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists inspections_parent_immutable on public.inspections;

create trigger inspections_parent_immutable
  before update of parent_inspection_id on public.inspections
  for each row
  execute function public.enforce_parent_inspection_immutable();
