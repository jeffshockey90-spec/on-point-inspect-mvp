-- =====================================================================
-- Re-inspection workflow. A re-inspection is a new (child) inspection that
-- references the original and carries its findings over, so the inspector can
-- re-evaluate each item (corrected / not corrected / not evaluated) instead of
-- starting from scratch.
--
--   inspections.parent_inspection_id -> the original inspection this re-checks
--   findings.reinspection_status      -> per-item verdict on a re-inspection
-- =====================================================================
alter table public.inspections
  add column if not exists parent_inspection_id bigint;

create index if not exists inspections_parent_idx
  on public.inspections (parent_inspection_id);

alter table public.findings
  add column if not exists reinspection_status text;
  -- values: 'corrected' | 'not_corrected' | 'not_evaluated' | null (pending)
