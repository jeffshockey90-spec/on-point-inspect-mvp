-- Saved quotes with a client booking link. An inspector saves a quote from the
-- Quotes page and sends the client /book?quote=<token>; the booking form opens
-- pre-filled with the address and services and shows the quoted price, and
-- confirming that booking invoices the QUOTED price (not a re-calculation).
-- Only read/written by service-role API routes; the token is unguessable.
-- Idempotent; run once in Supabase SQL.

create table if not exists public.saved_quotes (
  id                 uuid primary key default gen_random_uuid(),
  token              text not null unique,
  inspector_id       uuid not null,
  company_id         bigint,
  client_name        text,
  client_email       text,
  property_address   text,
  city               text,
  state              text,
  zip                text,
  square_feet        integer,
  service_ids        jsonb not null default '[]'::jsonb,
  line_items         jsonb not null default '[]'::jsonb,
  travel_fee         numeric not null default 0,
  discount           numeric not null default 0,
  total              numeric not null default 0,
  status             text not null default 'open', -- open | booked
  booking_request_id bigint,
  expires_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists saved_quotes_inspector_idx on public.saved_quotes (inspector_id, created_at desc);
create index if not exists saved_quotes_booking_idx on public.saved_quotes (booking_request_id);

-- Service-role only (no policies): inspectors use it through the API routes.
alter table public.saved_quotes enable row level security;
