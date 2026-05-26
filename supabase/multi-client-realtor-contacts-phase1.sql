-- On Point Inspect Multi-Client/Realtor Contacts Phase 1
-- Run in Supabase SQL Editor.

create table if not exists public.inspection_contacts (
  id uuid primary key default gen_random_uuid(),

  inspection_id bigint not null
    references public.inspections(id)
    on delete cascade,

  inspector_id uuid not null,

  role text not null default 'client',
  name text not null,
  email text not null,

  agreement_required boolean not null default false,
  portal_access boolean not null default true,

  agreement_signed boolean not null default false,
  signed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_contacts_inspection_id_idx
on public.inspection_contacts(inspection_id);

create index if not exists inspection_contacts_inspector_id_idx
on public.inspection_contacts(inspector_id);

create index if not exists inspection_contacts_email_idx
on public.inspection_contacts(email);

alter table public.inspection_contacts enable row level security;

drop policy if exists "Inspectors can view own inspection contacts"
on public.inspection_contacts;

create policy "Inspectors can view own inspection contacts"
on public.inspection_contacts
for select
to authenticated
using (auth.uid() = inspector_id);

drop policy if exists "Inspectors can insert own inspection contacts"
on public.inspection_contacts;

create policy "Inspectors can insert own inspection contacts"
on public.inspection_contacts
for insert
to authenticated
with check (auth.uid() = inspector_id);

drop policy if exists "Inspectors can update own inspection contacts"
on public.inspection_contacts;

create policy "Inspectors can update own inspection contacts"
on public.inspection_contacts
for update
to authenticated
using (auth.uid() = inspector_id)
with check (auth.uid() = inspector_id);

drop policy if exists "Inspectors can delete own inspection contacts"
on public.inspection_contacts;

create policy "Inspectors can delete own inspection contacts"
on public.inspection_contacts
for delete
to authenticated
using (auth.uid() = inspector_id);

alter table public.inspection_agreements
add column if not exists contact_id uuid
references public.inspection_contacts(id)
on delete set null;

alter table public.inspection_agreements
add column if not exists signature_role text default 'client';
