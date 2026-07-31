-- Granular radon reminder toggles.
--
-- The notification settings screen has always shown separate "Radon
-- deployment reminder" and "Radon retrieval reminder" switches, but the
-- columns backing them never existed - the settings API silently dropped
-- them and only stored the single legacy `radon_reminders_enabled` flag, so
-- the two switches did nothing. These columns give each switch real storage.
--
-- Safe to run more than once.
alter table schedule_reminder_settings
  add column if not exists radon_deployment_reminder_enabled boolean not null default true,
  add column if not exists radon_retrieval_reminder_enabled boolean not null default true;

-- Backfill the granular flags from the legacy master flag for existing rows
-- so nobody who previously turned radon reminders off gets them turned back
-- on by the new defaults.
update schedule_reminder_settings
set
  radon_deployment_reminder_enabled = coalesce(radon_reminders_enabled, true),
  radon_retrieval_reminder_enabled = coalesce(radon_reminders_enabled, true)
where radon_reminders_enabled is not null;
