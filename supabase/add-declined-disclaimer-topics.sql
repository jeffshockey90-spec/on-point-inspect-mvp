-- ============================================================================
-- Persist "declined" AI disclaimer suggestions per inspection in the DB instead
-- of per-device localStorage (which iOS drops on relaunch, so declined
-- suggestions kept reappearing). Single-source-of-truth: follows the inspector
-- across devices. Safe to run multiple times.
-- ============================================================================

alter table public.inspections
  add column if not exists declined_disclaimer_topics jsonb not null default '[]'::jsonb;
