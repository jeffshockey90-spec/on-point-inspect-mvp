-- Per-inspector preference: auto-enable the live camera compass every session,
-- so the inspector doesn't have to tap "Enable compass" each time they open the
-- camera. DB-backed so it follows them across devices. Default false (opt-in).
-- Safe to run multiple times.
alter table public.profiles
  add column if not exists compass_auto_enable boolean not null default false;
