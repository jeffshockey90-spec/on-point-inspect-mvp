-- Per-state license / certification numbers for agreements, e.g.
-- {"MD": "Maryland License #...", "WV": "WV Certification #...", "PA": "InterNACHI #..."}.
-- Each state's agreement shows its own number ({{INSPECTOR_LICENSE}} /
-- {{INSPECTOR_LICENSE_NUMBER}}); states without one fall back to License Info.
-- Idempotent; run once in Supabase SQL.

alter table public.companies
  add column if not exists state_licenses jsonb not null default '{}'::jsonb;
