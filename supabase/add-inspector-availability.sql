-- Per-inspector public booking availability: which days/times clients and
-- realtors can request, blocked dates, and a kill switch for public booking
-- entirely. One row per inspector user.
-- Run in the Supabase SQL Editor.

create table if not exists public.inspector_availability (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  booking_enabled boolean not null default true,
  available_days text[] not null default array['MO','TU','WE','TH','FR'],
  default_times text[] not null default array['10:00','14:00','16:30'],
  blocked_dates text[] not null default array[]::text[],
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inspector_availability_user_id_key
  on public.inspector_availability(user_id);

alter table public.inspector_availability enable row level security;

drop policy if exists "Inspectors manage their own availability" on public.inspector_availability;

create policy "Inspectors manage their own availability"
  on public.inspector_availability
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The public booking page needs to read a company's availability without
-- being signed in as that inspector - service-role reads bypass RLS
-- already, so no additional public policy is needed for that path.
