-- Invoices with line items, optionally tied to an inspection, payable online
-- via Stripe Connect. Run this in the Supabase SQL editor.
--
-- Line items are stored as JSONB (array of
--   { "description": text, "quantity": number, "unitPrice": number, "amount": number })
-- rather than a separate table, to keep the create/edit flow simple.

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),

  -- Owner / scoping. inspector_id is the authenticated user who created it and
  -- is what RLS checks. company_id drives branding. inspection_id is optional
  -- (invoices can be standalone).
  inspector_id uuid not null default auth.uid(),
  company_id bigint,
  inspection_id bigint,

  -- Human-facing invoice number (e.g. INV-1042). Unique per inspector.
  invoice_number text,

  client_name text,
  client_email text,

  -- draft | sent | paid | void
  status text not null default 'draft',

  line_items jsonb not null default '[]'::jsonb,

  subtotal numeric not null default 0,
  total numeric not null default 0,
  amount_paid numeric not null default 0,
  balance_due numeric not null default 0,

  due_date date,
  notes text,

  -- Public, unguessable token for the client-facing invoice / pay link.
  public_token text unique default replace(gen_random_uuid()::text, '-', ''),

  stripe_checkout_session_id text,
  stripe_payment_intent_id text,

  -- Atomic once-only guard for the paid receipt email (mirrors inspections).
  receipt_sent_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  paid_at timestamptz
);

create index if not exists invoices_inspector_id_idx on public.invoices (inspector_id);
create index if not exists invoices_company_id_idx on public.invoices (company_id);
create index if not exists invoices_inspection_id_idx on public.invoices (inspection_id);
create index if not exists invoices_public_token_idx on public.invoices (public_token);

alter table public.invoices enable row level security;

-- Inspectors manage only their own invoices. The client-facing pay page and the
-- Stripe webhook use the service-role key, which bypasses RLS, so no public
-- policy is needed here (matches how inspection_agreements is handled).
drop policy if exists "invoices_owner_all" on public.invoices;
create policy "invoices_owner_all"
  on public.invoices
  for all
  using (auth.uid() = inspector_id)
  with check (auth.uid() = inspector_id);

-- Keep updated_at fresh on every write.
create or replace function public.set_invoices_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_invoices_updated_at();
