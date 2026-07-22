-- Add a free-text "location" field to findings, e.g. "Northeast corner",
-- "Master bathroom", "Basement - southwest wall" - where in the property
-- the finding is, as distinct from `section` (which system of the house
-- it belongs to, e.g. "Plumbing" or "Electrical").
--
-- Additive, nullable column - safe to run any time, no backfill needed.
-- Run in the Supabase SQL Editor.

alter table public.findings add column if not exists location text;
