-- Per-recipient reminder/notification toggles, so an operation can dial down
-- what clients and agents receive. COMPANY-LEVEL defaults live on `companies`;
-- a per-inspector OVERRIDE lives in `profiles.notification_prefs` (jsonb — a
-- present key wins over the company default, an absent key inherits it).
--
-- Everything defaults to TRUE (send), so behavior is unchanged until someone
-- turns a toggle off. Safe/idempotent — run once in the Supabase SQL editor.

alter table public.companies
  add column if not exists client_confirmation_enabled boolean not null default true,
  add column if not exists client_reminder_sms_enabled boolean not null default true,
  add column if not exists client_report_ready_enabled boolean not null default true,
  add column if not exists agent_confirmation_enabled boolean not null default true,
  add column if not exists agent_report_ready_enabled boolean not null default true;

-- Per-inspector overrides: { "client_confirmation": false, ... }. Keys present
-- override the company default; keys absent inherit it. Empty object = inherit
-- everything (the default).
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
