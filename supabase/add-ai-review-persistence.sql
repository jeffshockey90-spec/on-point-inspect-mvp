-- AI Report Review persistence
--
-- Stores the "Second Set of Eyes" AI review ON the inspection so the inspector
-- can reopen the Command Center panel later — even after closing the app or on
-- another device — and keep knocking off items WITHOUT paying to re-run.
--
-- Single source of truth: the review + which items are checked off live in the
-- DB, not device-only localStorage (which iOS/WebView drops on cold start).
--
-- Safe + idempotent. The app degrades gracefully (local cache only) until this
-- runs, so nothing breaks if it's applied later.

alter table public.inspections
  add column if not exists ai_review       jsonb,
  add column if not exists ai_review_at     timestamptz,
  add column if not exists ai_review_done   jsonb not null default '[]'::jsonb;

comment on column public.inspections.ai_review is
  'Latest AI Report Review result (score, issues, recommendation) shown in the Command Center panel.';
comment on column public.inspections.ai_review_at is
  'When the AI Report Review was last run.';
comment on column public.inspections.ai_review_done is
  'Array of review-item keys the inspector has checked off (list::text).';
