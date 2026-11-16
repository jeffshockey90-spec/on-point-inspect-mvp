-- Opt-in automatic client reminders (company defaults; per-inspector overrides
-- live in profiles.notification_prefs like the other notification toggles):
--   auto_agreement_reminder_enabled - nudge unsigned agreement signers daily,
--                                     from 3 days before the inspection (max 3)
--   auto_balance_reminder_enabled   - email a Pay link 3 / 7 / 14 days after the
--                                     inspection while a balance is due
-- Both default OFF so no new client emails go out until a company turns them on.
-- Sends are deduped in schedule_reminder_logs. Idempotent; run once in Supabase SQL.

alter table public.companies
  add column if not exists auto_agreement_reminder_enabled boolean not null default false,
  add column if not exists auto_balance_reminder_enabled   boolean not null default false;
