-- Lets a realtor add their own profile (headshot/logo + name + brokerage) in the
-- Realtor Portal. Portal realtors are identified only by email (no stable
-- account record), so this is keyed by lowercased email. Read/written only via
-- the service-role API route /api/realtor-profile, so RLS stays closed.
create table if not exists public.realtor_profiles (
  email      text primary key,
  name       text,
  brokerage  text,
  photo_url  text,
  updated_at timestamptz not null default now()
);

alter table public.realtor_profiles enable row level security;
