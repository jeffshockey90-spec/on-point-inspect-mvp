-- Mold sample plan captured at booking: how many samples and where.
--
-- Each entry is { "type": "outdoor_windward" | "outdoor_leeward" | "indoor_air"
-- | "surface", "location": "<free text>" }. This is additive and for planning /
-- reference only — the mold report + lab workflow continues to read the existing
-- mold_air_samples / mold_surface_samples COUNT columns, which are still written
-- on the inspection insert. Nothing reads mold_sample_plan in the report flow, so
-- creating inspections works identically whether or not this migration has run
-- (the app writes the plan as a best-effort post-insert update).
--
-- Idempotent: safe to run multiple times.

alter table public.inspections
  add column if not exists mold_sample_plan jsonb;
