-- FLOW Agreement + Client Portal Phase 1
-- Run this in Supabase SQL Editor.

create table if not exists public.inspection_agreements (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  inspector_id uuid not null,
  state text not null default 'MD',
  agreement_version text not null default 'v1',
  agreement_title text not null default 'Residential Inspection Agreement',
  agreement_body text not null,
  client_name text,
  client_email text,
  client_signature text,
  signed_at timestamptz,
  signer_ip text,
  signer_user_agent text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_agreements_inspection_id_idx
on public.inspection_agreements(inspection_id);

create index if not exists inspection_agreements_inspector_id_idx
on public.inspection_agreements(inspector_id);

alter table public.inspection_agreements enable row level security;

drop policy if exists "Inspectors can view own agreements" on public.inspection_agreements;
create policy "Inspectors can view own agreements"
on public.inspection_agreements
for select
to authenticated
using (auth.uid() = inspector_id);

drop policy if exists "Inspectors can insert own agreements" on public.inspection_agreements;
create policy "Inspectors can insert own agreements"
on public.inspection_agreements
for insert
to authenticated
with check (auth.uid() = inspector_id);

drop policy if exists "Inspectors can update own agreements" on public.inspection_agreements;
create policy "Inspectors can update own agreements"
on public.inspection_agreements
for update
to authenticated
using (auth.uid() = inspector_id)
with check (auth.uid() = inspector_id);

create table if not exists public.client_portal_events (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references public.inspections(id) on delete cascade,
  event_type text not null,
  event_note text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists client_portal_events_inspection_id_idx
on public.client_portal_events(inspection_id);

alter table public.client_portal_events enable row level security;

drop policy if exists "Inspectors can view own portal events" on public.client_portal_events;
create policy "Inspectors can view own portal events"
on public.client_portal_events
for select
to authenticated
using (
  exists (
    select 1
    from public.inspections i
    where i.id = client_portal_events.inspection_id
      and i.inspector_id = auth.uid()
  )
);

-- Optional inspection columns used by portal/payment status.
alter table public.inspections
add column if not exists agreement_status text default 'pending';

alter table public.inspections
add column if not exists payment_status text default 'unpaid';

alter table public.inspections
add column if not exists invoice_amount numeric;

alter table public.inspections
add column if not exists portal_note text;
