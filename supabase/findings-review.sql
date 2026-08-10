-- Field Review queue support for offline-captured findings.
--
-- When an inspector captures a finding offline (quick note + photos) and later
-- syncs, the AI polishes the write-up but the inspector still wants to verify
-- and APPROVE each one before it counts as final. These two flags drive that
-- "Field Review" queue in the report editor:
--
--   needs_review      - true while the freshly-synced finding is waiting for the
--                        inspector to verify the section/severity and approve it.
--                        Cleared (set false) on approve.
--   offline_captured  - true if the finding originated from the offline field
--                        capture -> sync pipeline (as opposed to being typed in
--                        the report editor). Lets the UI label/scope the queue.
--
-- Both are additive, NOT NULL with a safe default of false, so existing rows are
-- unaffected and pre-migration code that never sets them keeps working.
-- The composite index keeps the "how many findings on this inspection still need
-- review" lookup fast.
--
-- Idempotent - safe to run more than once. Run in the Supabase SQL Editor.

alter table public.findings
  add column if not exists needs_review boolean not null default false;

alter table public.findings
  add column if not exists offline_captured boolean not null default false;

create index if not exists idx_findings_needs_review
  on public.findings (inspection_id, needs_review);
