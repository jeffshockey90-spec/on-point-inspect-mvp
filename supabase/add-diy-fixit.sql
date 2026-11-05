-- DIY fix-it kits in the homeowner maintenance hub.
--
-- When ON, the homeowner hub (/my-home/[token]) shows a "Things you can tackle
-- yourself" section for a CURATED set of genuinely DIY-safe findings (caulk,
-- weatherstripping, a running toilet, a clogged aerator, air filters, loose
-- hardware, grout, minor drywall) — with the materials, tools, rough time, and
-- a ballpark hardware-store supply cost. The matcher in lib/diyFixIt.ts hard-
-- vetoes anything electrical, gas, structural, roof/height, HVAC-internal,
-- sewer/supply-line, or hazmat, and anything flagged Safety/Major Concern.
--
-- Off by default — the hub shows nothing until an inspector opts in from
-- Settings -> Company Profile. Read by app/my-home/[token]/page.tsx and set
-- from app/settings/page.tsx (show_diy_fixit).
--
-- Run in the Supabase SQL Editor.

alter table companies
  add column if not exists show_diy_fixit boolean not null default false;
