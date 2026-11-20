-- Indexes for the lookups FLOW runs most, so they stay fast as data grows.
--
-- inspections had indexes only on public_share_token, created_at and
-- parent_inspection_id, yet every dashboard/schedule/report list (and the
-- inspections RLS policy itself) filters on inspector_id or company_id, and the
-- 15-minute schedule-reminders cron filters on inspection_date. The Resend
-- webhook updates email_logs by resend_id on every event, and the reminder cron
-- checks schedule_reminder_logs by (inspection_id, reminder_type).
--
-- Additive and safe to re-run. Small tables build these instantly.

create index if not exists inspections_inspector_created_idx
  on public.inspections (inspector_id, created_at desc);

create index if not exists inspections_company_created_idx
  on public.inspections (company_id, created_at desc);

create index if not exists inspections_inspection_date_idx
  on public.inspections (inspection_date);

create index if not exists email_logs_resend_id_idx
  on public.email_logs (resend_id);

create index if not exists email_logs_inspection_id_bigint_idx
  on public.email_logs (inspection_id_bigint);

create index if not exists schedule_reminder_logs_inspection_type_idx
  on public.schedule_reminder_logs (inspection_id, reminder_type);
