-- The finding editor (and field tool) have a "Location" field (e.g. "Master
-- bathroom", "NE corner"), but the findings table was missing the column — so
-- saving a finding failed with a schema error ("Failed to save"). Add it.
--
-- Safe to run: idempotent (IF NOT EXISTS). Run once in the Supabase SQL editor.
-- The app already saves without location as a fallback, but running this lets
-- the Location field actually persist.

alter table public.findings
  add column if not exists location text;
