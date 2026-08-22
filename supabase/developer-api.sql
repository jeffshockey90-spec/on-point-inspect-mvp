-- =====================================================================
-- Developer platform: API keys (for the public /api/v1) + outbound webhooks.
-- Foundation for Zapier (#9) and the MCP server (#30).
--
-- api_keys: third-party access tokens. Only a SHA-256 HASH is stored; the full
--   key is shown once at creation. Auth = Authorization: Bearer <key>.
-- webhook_endpoints: URLs FLOW POSTs signed events to (report.sent,
--   inspection.paid, review.received, ...). Each has its own signing secret.
--
-- Both are per-inspector (user_id). Writes/reads go through service-role routes;
-- RLS lets a user see their own rows and blocks everyone else.
-- =====================================================================
create or replace function public.is_platform_owner()
returns boolean language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '')
         in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com');
$$;

create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  name         text,
  key_prefix   text not null,          -- shown for identification (e.g. flow_ab12cd…)
  key_hash     text not null,          -- sha256(full key); the full key is never stored
  last_used_at timestamptz,
  revoked      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists api_keys_hash_idx on public.api_keys (key_hash);
create index if not exists api_keys_user_idx on public.api_keys (user_id);

create table if not exists public.webhook_endpoints (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  url         text not null,
  secret      text not null,           -- HMAC signing secret for this endpoint
  events      text[] not null default '{}',  -- subscribed events; empty = all
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists webhook_endpoints_user_idx on public.webhook_endpoints (user_id);

alter table public.api_keys enable row level security;
alter table public.webhook_endpoints enable row level security;

do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in ('api_keys', 'webhook_endpoints')
  loop execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

-- Never expose key_hash/secret broadly: the app reads these via service-role.
-- These policies just let a signed-in user read their own rows directly.
create policy api_keys_owner on public.api_keys
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_owner());

create policy webhook_endpoints_owner on public.webhook_endpoints
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_owner());
