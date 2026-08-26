-- Per-user "workflow state" mirror — the small report-review workflow marks
-- that used to live only in localStorage (AI section-review completion +
-- fingerprints, Command Center reviewed-findings set, per-finding quick status)
-- so they follow the inspector across devices. localStorage stays the instant
-- source; this is a background mirror synced on load / on page-hide.
--
-- Safe to run: idempotent. Run once in the Supabase SQL editor.

alter table public.profiles
  add column if not exists workflow_state jsonb;
