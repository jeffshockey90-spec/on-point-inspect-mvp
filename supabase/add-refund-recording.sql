-- Refund recording
--
-- A refund returns money that was already collected. It must NEVER be modeled
-- by lowering `amount_paid` / raising `balance_due` — doing that re-creates a
-- false "balance due" and re-locks a delivered report (the client appears to
-- owe the refunded amount). Instead a refund is stored as its OWN cumulative
-- quantity, leaving amount_paid / balance_due untouched so the report stays
-- unlocked and the invoice stays satisfied.
--
-- Idempotent: safe to run more than once.

alter table public.inspections
  add column if not exists amount_refunded numeric default 0;

alter table public.inspections
  add column if not exists refunded_at timestamptz;

comment on column public.inspections.amount_refunded is
  'Cumulative dollars refunded to the client (Stripe or manual). Tracked separately from amount_paid/balance_due so a refund never creates a false balance owed or re-locks a delivered report.';
comment on column public.inspections.refunded_at is
  'Timestamp of the most recent refund recorded for this inspection.';
