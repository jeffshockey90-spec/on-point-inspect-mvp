-- ============================================================================
-- Live Camera — Point-and-Identify feature (BETA)
-- Its OWN per-inspector opt-in + owner global kill switch, independent of the
-- async-draft beta. Ships dark (default OFF everywhere). Idempotent.
-- ============================================================================

-- 1) Per-inspector beta opt-in. Default FALSE: the Identify control is hidden
--    until the inspector turns it on in Settings. DB-backed so it follows them
--    across devices (single-source-of-truth rule).
alter table public.profiles
  add column if not exists identify_enabled boolean not null default false;

-- 2) Owner-controlled GLOBAL kill switch, in the shared feature_flags table
--    (created by add-async-draft.sql; created here too in case this runs first).
--    Resolution is AND: Identify shows only when the global flag is on AND the
--    inspector opted in. Seeded ON so the per-inspector toggle is the real gate.
create table if not exists public.feature_flags (
  key        text primary key,
  enabled    boolean not null default false,
  note       text,
  updated_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;
-- No anon/authenticated policies: service-role only (owner-only-data convention).

insert into public.feature_flags (key, enabled, note)
values ('identify_global', true, 'Live camera point-and-identify (beta) global kill switch')
on conflict (key) do nothing;
