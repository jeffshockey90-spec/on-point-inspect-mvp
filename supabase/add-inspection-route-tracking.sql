-- Supports showing a driving-distance/map card on the report builder page
-- and auto-filling the property's lat/lng so it can be geocoded once at
-- creation instead of every page load.
--
-- office_* on companies is the inspector's starting point (set once in
-- Settings); distance_miles/drive_minutes on inspections is the cached
-- driving distance from that office to this specific property, computed
-- once when the inspection is created.
--
-- property_latitude/property_longitude already exist on inspections (used
-- by the existing GPS mileage/geofencing system) - this migration only adds
-- what's missing.
-- Run in the Supabase SQL Editor.

alter table public.companies add column if not exists office_address text;
alter table public.companies add column if not exists office_latitude numeric;
alter table public.companies add column if not exists office_longitude numeric;

alter table public.inspections add column if not exists distance_miles numeric;
alter table public.inspections add column if not exists drive_minutes integer;
