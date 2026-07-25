-- Per-inspector custom pricing (base service formula + add-on services with
-- optional "paired" pricing when bundled with the base service, e.g. radon
-- costs less when done alongside a home inspection). One row per inspector
-- user; each inspector's rates are independent of teammates on the same
-- company account.
-- Run in the Supabase SQL Editor.

create table if not exists public.inspector_pricing (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inspector_pricing_user_id_key
  on public.inspector_pricing(user_id);

alter table public.inspector_pricing enable row level security;

drop policy if exists "Inspectors manage their own pricing" on public.inspector_pricing;

create policy "Inspectors manage their own pricing"
  on public.inspector_pricing
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
