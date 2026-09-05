-- Tracks when each user last viewed the What's New page, so the nav can show an
-- unread dot when a newer changelog entry has been published since. Idempotent;
-- run once in Supabase SQL.

alter table public.profiles
  add column if not exists whats_new_seen_at timestamptz;
