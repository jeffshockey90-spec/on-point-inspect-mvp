-- Company-level pricing set by the company owner, used as the default price
-- sheet for everyone on the team. Individual inspectors can still set their
-- own inspector_pricing row, which overrides the company sheet for their jobs.
--
-- Effective pricing resolution (in /api/pricing):
--   inspector_pricing[user]  (personal override)
--     -> company_pricing[user's company]  (owner-set default)
--       -> platform default
--
-- Run in the Supabase SQL Editor.

create table if not exists public.company_pricing (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_pricing_company_id_key
  on public.company_pricing(company_id);

alter table public.company_pricing enable row level security;

-- Any member of the company can read the company price sheet (so their
-- Quotes / New Inspection pricing resolves to it).
drop policy if exists "Company members can read company pricing" on public.company_pricing;
create policy "Company members can read company pricing"
  on public.company_pricing
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_users cu
      where cu.user_id = auth.uid()
        and cu.company_id = company_pricing.company_id
    )
  );

-- Only the company owner can create / update / delete the company price sheet.
drop policy if exists "Company owners manage company pricing" on public.company_pricing;
create policy "Company owners manage company pricing"
  on public.company_pricing
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.company_users cu
      where cu.user_id = auth.uid()
        and cu.company_id = company_pricing.company_id
        and cu.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.company_users cu
      where cu.user_id = auth.uid()
        and cu.company_id = company_pricing.company_id
        and cu.role = 'owner'
    )
  );
