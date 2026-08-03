-- Makes the payment receipt email + inspector "Payment Received" push fire
-- exactly once. Previously both were sent only by the Stripe webhook and only
-- when the inspection wasn't already marked paid; but the payment-success page
-- marks the inspection paid the instant the buyer returns, so if it won the
-- race against the webhook, the webhook saw "already paid" and dropped the
-- receipt + push entirely.
--
-- This column is an independent, atomically-claimed flag: whichever path first
-- flips it from null sends the receipt/push, and every other delivery (webhook
-- retries, the success page) sees it already set and skips. It is deliberately
-- separate from paid_at so marking paid never suppresses the receipt.

alter table public.inspections
  add column if not exists receipt_sent_at timestamptz;
