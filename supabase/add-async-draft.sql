-- ============================================================================
-- Live Camera — Async "draft in the background" feature (BETA)
-- Phase 0: schema + beta toggle groundwork. Ships dark (default OFF everywhere).
-- Safe to run multiple times (idempotent). See LIVE_CAMERA_ASYNC_DRAFT_DESIGN.md.
-- ============================================================================

-- 1) Per-inspector beta opt-in. Default FALSE: the live camera behaves exactly
--    as today until the inspector turns this on in Settings. DB-backed so it
--    follows them across devices (single-source-of-truth rule).
alter table public.profiles
  add column if not exists async_draft_enabled boolean not null default false;

-- 2) Findings: fix a latent bug + store the AI baseline for the learning loop.
--    `ai_review_required` is written today by generateAiFindingAfterSync but the
--    column was missing (that write silently failed). `ai_prediction` holds the
--    first AI draft so the approve/edit step can still compute the learning diff
--    after the capture is backgrounded.
alter table public.findings
  add column if not exists ai_review_required boolean not null default false;
alter table public.findings
  add column if not exists ai_prediction jsonb;

-- 3) Generalize the review queue beyond findings so limitations + equipment
--    drafts can also wait for approval. Mirrors supabase/findings-review.sql.
alter table public.section_limitations
  add column if not exists needs_review boolean not null default false;
alter table public.section_limitations
  add column if not exists offline_captured boolean not null default false;
alter table public.section_limitations
  add column if not exists ai_prediction jsonb;
create index if not exists idx_section_limitations_needs_review
  on public.section_limitations (inspection_id, needs_review);

alter table public.equipment_inventory
  add column if not exists needs_review boolean not null default false;
alter table public.equipment_inventory
  add column if not exists offline_captured boolean not null default false;
alter table public.equipment_inventory
  add column if not exists ai_prediction jsonb;
create index if not exists idx_equipment_inventory_needs_review
  on public.equipment_inventory (inspection_id, needs_review);

-- 4) Owner-controlled GLOBAL kill switch (service-role only, like
--    subscription_pricing). Resolution is AND: a draft runs async only when the
--    global flag is on AND the inspector opted in. The owner flips the global
--    flag OFF to instantly disable the beta for everyone (no app release needed,
--    since iOS is a remote WebView). Seeded ON so the per-inspector toggle is the
--    real gate; the per-inspector default is still OFF.
create table if not exists public.feature_flags (
  key        text primary key,
  enabled    boolean not null default false,
  note       text,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;
-- No anon/authenticated policies: readable/writable only via the service role
-- (owner-only-data convention, same as subscription_pricing).

insert into public.feature_flags (key, enabled, note)
values ('async_draft_global', true, 'Live camera background AI drafting (beta) global kill switch')
on conflict (key) do nothing;
