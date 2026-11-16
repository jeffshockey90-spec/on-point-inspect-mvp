-- Track Stripe's cumulative refunded amount separately from manual refunds.
--
-- inspections.amount_refunded is the TOTAL refunded (manual + Stripe). The
-- Stripe webhook receives a cumulative per-charge figure; storing it here lets
-- the webhook add only Stripe's change, so a refund recorded manually in the
-- app (Record Refund) is never wiped out by a later Stripe refund.
-- See lib/refundTotals.ts. Idempotent; run once in the Supabase SQL editor.

alter table public.inspections
  add column if not exists stripe_amount_refunded numeric;
