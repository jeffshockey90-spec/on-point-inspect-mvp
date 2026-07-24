-- Tracks the owner's self-reported OpenAI account balance so the app can
-- alert (via push notification) when it's running low. OpenAI doesn't expose
-- a "remaining balance" API - only a spend/costs API - so the owner enters
-- their current balance whenever they top up, and we subtract real OpenAI
-- spend (queried from the Costs API) accrued since that moment.
--
-- Single-row table (id is always 1). Service-role only - no anon/authenticated
-- policies, matching this app's owner-only-data RLS convention.
-- Run in the Supabase SQL Editor.

create table if not exists public.ai_budget_status (
  id smallint primary key default 1,
  starting_balance_usd numeric not null default 0,
  low_balance_threshold_usd numeric not null default 2,
  balance_set_at timestamptz not null default now(),
  last_alert_sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint ai_budget_status_singleton check (id = 1)
);

insert into public.ai_budget_status (id, starting_balance_usd, low_balance_threshold_usd, balance_set_at)
values (1, 0, 2, now())
on conflict (id) do nothing;

alter table public.ai_budget_status enable row level security;
