-- Lets the owner change FLOW's subscription pricing from the owner
-- dashboard instead of editing code and redeploying. Single-row table
-- (id is always 1). Service-role only - no anon/authenticated policies,
-- matching this app's owner-only-data RLS convention. The public /pricing
-- page and the actual Stripe checkout both read from this table server-side
-- via the service role, so changing a price here changes what people
-- actually get charged, not just what's displayed.
-- Run in the Supabase SQL Editor.

create table if not exists public.subscription_pricing (
  id smallint primary key default 1,
  standard_price_cents integer not null default 6900,
  founding_member_price_cents integer not null default 4900,
  updated_at timestamptz not null default now(),
  constraint subscription_pricing_singleton check (id = 1)
);

insert into public.subscription_pricing (id, standard_price_cents, founding_member_price_cents)
values (1, 6900, 4900)
on conflict (id) do nothing;

alter table public.subscription_pricing enable row level security;
