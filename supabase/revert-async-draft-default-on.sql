-- ============================================================================
-- REVERT for add-async-draft-default-on.sql — undoes the async DEFAULT.
-- Run this ONLY if you decide you don't like the auto-advance / background
-- drafting flow and want to go back to the old "tap Analyze" confirm-card path.
--
-- This restores the beta to off-by-default: new inspectors get async OFF, and
-- everyone currently on is switched back off. (It does NOT delete any already
-- drafted/queued items — it only changes the default behavior going forward.)
--
-- The code side reverts separately: `git reset --hard pre-autoadvance-flow`
-- (or revert commit 297bf812) removes single-shot auto-advance + the toggle.
--
-- Fastest emergency off (no SQL, affects everyone instantly):
--   update public.feature_flags set enabled = false where key = 'async_draft_global';
-- ============================================================================

alter table public.profiles
  alter column async_draft_enabled set default false;

update public.profiles
  set async_draft_enabled = false
  where async_draft_enabled is distinct from false;
