-- Intrusion-attempt logging + owner alerting.
--
-- Every time a caller is REJECTED at one of the token/ownership-gated endpoints
-- (i.e. someone probing with a guessed inspection id), the API writes a row
-- here via the service-role client. lib/securityAlerts.ts counts recent rows
-- per IP and, past a threshold, emails + pushes the owner (with a cooldown so a
-- burst only alerts once). "alert_sent" rows are written here too as the
-- dedupe/cooldown marker.
--
-- Safe to run more than once.

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_type text not null,          -- e.g. 'portal_enum', 'repair_enum', 'checkout_enum', 'signup_hijack', 'alert_sent'
  ip text,
  path text,
  method text,
  user_agent text,
  detail jsonb
);

create index if not exists security_events_ip_created_idx
  on public.security_events (ip, created_at desc);

create index if not exists security_events_type_created_idx
  on public.security_events (event_type, created_at desc);

-- Lock the table down: RLS on with NO policies means anon/authenticated clients
-- get nothing; only the service-role key (used server-side) can read/write.
alter table public.security_events enable row level security;
