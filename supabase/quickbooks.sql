-- =====================================================================
-- QuickBooks Online sync. Per-inspector OAuth connection (tokens + the Intuit
-- company/realm id) plus a mapping of which FLOW inspection produced which
-- QuickBooks invoice (so re-syncs update rather than duplicate).
-- Reuses the OAuth pattern established for Google Calendar.
-- =====================================================================
create or replace function public.is_platform_owner()
returns boolean language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '')
         in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com');
$$;

create table if not exists public.quickbooks_connections (
  user_id         uuid primary key,
  access_token    text,
  refresh_token   text,                 -- Intuit rotates this on every refresh
  expiry_date     timestamptz,          -- when the access_token expires
  realm_id        text,                 -- the QuickBooks company id
  connected_company text,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.quickbooks_sync (
  inspection_id   bigint primary key,
  user_id         uuid not null,
  qb_customer_id  text,
  qb_invoice_id   text,
  qb_sync_token   text,                 -- required to update a QBO invoice
  amount          numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists quickbooks_sync_user_idx on public.quickbooks_sync (user_id);

alter table public.quickbooks_connections enable row level security;
alter table public.quickbooks_sync enable row level security;

do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies
           where schemaname='public' and tablename in ('quickbooks_connections','quickbooks_sync')
  loop execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

-- Tokens are only ever read via service-role routes; these policies just let a
-- user see their own connection/sync rows (never anyone else's tokens).
create policy qb_conn_owner on public.quickbooks_connections
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_owner());
create policy qb_sync_owner on public.quickbooks_sync
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_owner());
