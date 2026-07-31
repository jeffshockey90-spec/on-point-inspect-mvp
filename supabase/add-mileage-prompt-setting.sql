-- Real storage for the "Start mileage prompt" toggle.
--
-- The notification settings screen has always shown a "Start mileage prompt"
-- switch ("Offer to start mileage tracking"), but the column backing it never
-- existed - the settings API silently dropped it, so toggling it did nothing
-- and the mileage offer always appeared on departure. This column gives the
-- switch real storage.
--
-- Safe to run more than once.
alter table schedule_reminder_settings
  add column if not exists mileage_prompt_enabled boolean not null default true;
