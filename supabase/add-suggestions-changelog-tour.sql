-- Feature backlog: suggestion box, changelog/what's-new feed, and a
-- server-persisted dashboard tour dismissal flag (localStorage alone
-- doesn't survive reliably across logins/devices/native app reinstalls).
-- Run in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists dashboard_tour_dismissed_at timestamptz;

-- Suggestion box: inspectors submit feature requests / bug reports, owner
-- gets an immediate push notification with the submitter's name attached.
create table if not exists public.feature_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  user_email text,
  company_id bigint references public.companies(id) on delete set null,
  message text not null,
  status text not null default 'new', -- new | planned | in_progress | shipped | declined
  owner_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_requests_user_id_idx on public.feature_requests(user_id);
create index if not exists feature_requests_status_idx on public.feature_requests(status);

alter table public.feature_requests enable row level security;

drop policy if exists "Users manage their own feature requests" on public.feature_requests;

create policy "Users manage their own feature requests"
  on public.feature_requests
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Changelog / "What's New" feed: owner posts entries, optionally crediting
-- the user whose feature_requests submission it came from.
create table if not exists public.changelog_entries (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  credited_user_name text,
  feature_request_id bigint references public.feature_requests(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists changelog_entries_published_at_idx on public.changelog_entries(published_at desc);

alter table public.changelog_entries enable row level security;

drop policy if exists "Anyone signed in can read changelog" on public.changelog_entries;

create policy "Anyone signed in can read changelog"
  on public.changelog_entries
  for select
  using (auth.role() = 'authenticated');

-- Writes to changelog_entries go through the owner-only API routes using
-- the service-role key, which bypasses RLS - no insert/update policy needed.
