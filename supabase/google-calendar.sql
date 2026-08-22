-- =====================================================================
-- Google Calendar sync. Per-inspector OAuth connection + a mapping of which
-- FLOW inspection produced which Google Calendar event (so re-syncs update
-- rather than duplicate).
-- =====================================================================
create or replace function public.is_platform_owner()
returns boolean language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '')
         in ('jeff@onpointhomeinspect.com', 'jeffshockey90@gmail.com');
$$;

create table if not exists public.google_calendar_connections (
  user_id        uuid primary key,
  access_token   text,
  refresh_token  text,
  expiry_date    timestamptz,          -- when the access_token expires
  calendar_id    text not null default 'primary',
  connected_email text,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.google_calendar_events (
  inspection_id  bigint primary key,
  user_id        uuid not null,
  event_id       text not null,        -- the Google Calendar event id
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists gcal_events_user_idx on public.google_calendar_events (user_id);

alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_events enable row level security;

do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies
           where schemaname='public' and tablename in ('google_calendar_connections','google_calendar_events')
  loop execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

-- Tokens are only ever read via service-role routes; this just lets a user see
-- their own connection row (never anyone else's tokens).
create policy gcal_conn_owner on public.google_calendar_connections
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_owner());
create policy gcal_events_owner on public.google_calendar_events
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_owner());
