-- Phone number for a standalone invoice's recipient (the party you bill for the
-- client's report), so "Send invoice" / "Send reminder" can also TEXT a pay link
-- via Twilio in addition to email. Safe to re-run.

alter table public.invoices
  add column if not exists client_phone text;
