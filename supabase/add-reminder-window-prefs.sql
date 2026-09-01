-- Per-window (24h / 2h / 30m) reminder toggles for clients and agents, so an
-- operation can turn on exactly the reminder texts it wants. Company-level
-- defaults; per-inspector overrides still live in profiles.notification_prefs.
--
-- Defaults preserve today's behavior and don't add surprise texts:
--   client 24h = ON (that text already sends today)
--   everything else (client 2h/30m, agent 24h/2h/30m) = OFF, opt-in.
-- Inspector 24h/2h/30m reminders are unchanged — they stay in
-- schedule_reminder_settings (push). Idempotent; run once in Supabase SQL.

alter table public.companies
  add column if not exists client_reminder_24h_enabled boolean not null default true,
  add column if not exists client_reminder_2h_enabled  boolean not null default false,
  add column if not exists client_reminder_30m_enabled boolean not null default false,
  add column if not exists agent_reminder_24h_enabled  boolean not null default false,
  add column if not exists agent_reminder_2h_enabled   boolean not null default false,
  add column if not exists agent_reminder_30m_enabled  boolean not null default false;
