-- ============================================================================
-- Live Camera — make async "draft in the background" the DEFAULT.
-- Follow-up to add-async-draft.sql. Safe to run multiple times (idempotent).
--
-- The beta shipped off-by-default, so every existing `false` means "this
-- inspector never opted in" — NOT a deliberate opt-out. So it's safe to flip
-- everyone on and make the column default to true for new inspectors.
--
-- Intact safety rails after this runs:
--   • Per-inspector toggle (Settings) can still turn it OFF individually.
--   • Global kill switch (feature_flags.async_draft_global) still overrides —
--     flip it OFF to disable async for everyone instantly (resolution is AND).
-- ============================================================================

-- New inspectors get async ON by default.
alter table public.profiles
  alter column async_draft_enabled set default true;

-- Flip everyone who never explicitly chose (all of them, given off-by-default).
update public.profiles
  set async_draft_enabled = true
  where async_draft_enabled is distinct from true;
