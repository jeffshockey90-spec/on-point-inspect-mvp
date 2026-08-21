-- =====================================================================
-- Secure 24 home-security referral (OPT-IN at every level).
--
--   * secure24_settings  -- per-inspector on/off switch (default OFF).
--   * secure24_leads     -- consent + submission log, one row per opt-in.
--
-- Nothing is ever sent unless: the inspector turned it on AND the client
-- actively opted in on their report. Both tables are RLS-locked; only the
-- owning inspector and the platform owner can read, and the app's
-- service-role routes do the writes.
-- =====================================================================

-- is_platform_owner() already exists from earlier RLS migrations; recreated
-- here so this file is runnable on its own.
create or replace function public.is_platform_owner()
returns boolean language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '')
         in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com');
$$;

-- ---------------------------------------------------------------------
-- Per-inspector switch. Keyed by the inspector's auth user id.
-- ---------------------------------------------------------------------
create table if not exists public.secure24_settings (
  user_id     uuid primary key,
  user_email  text,
  enabled     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.secure24_settings enable row level security;

do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'secure24_settings'
  loop execute format('drop policy if exists %I on public.secure24_settings', p.policyname); end loop;
end $$;

-- An inspector manages only their own row; the platform owner can read all.
create policy secure24_settings_owner on public.secure24_settings
  for all to authenticated
  using (user_id = auth.uid() or public.is_platform_owner())
  with check (user_id = auth.uid() or public.is_platform_owner());

-- ---------------------------------------------------------------------
-- Consent + submission log. One row per client opt-in.
-- ---------------------------------------------------------------------
create table if not exists public.secure24_leads (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  bigint not null,
  inspector_id   uuid,
  client_name    text,
  client_email   text,
  consent_text   text,          -- exact wording the client agreed to
  consent_at     timestamptz not null default now(),
  status         text not null default 'pending',  -- pending | submitted | error
  result_code    integer,
  result_message text,
  lead_token     text,
  created_at     timestamptz not null default now()
);

create index if not exists secure24_leads_inspection_idx
  on public.secure24_leads (inspection_id);
create index if not exists secure24_leads_inspector_idx
  on public.secure24_leads (inspector_id);

alter table public.secure24_leads enable row level security;

do $$ declare p record; begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'secure24_leads'
  loop execute format('drop policy if exists %I on public.secure24_leads', p.policyname); end loop;
end $$;

-- The owning inspector and the platform owner can read their leads. Writes go
-- through service-role routes (which bypass RLS), so no insert policy needed
-- for the anonymous client portal caller.
create policy secure24_leads_read on public.secure24_leads
  for select to authenticated
  using (inspector_id = auth.uid() or public.is_platform_owner());
