-- Per-user dashboard layout (widget order / size / visibility). One jsonb
-- column on profiles, mirroring report_section_order. RLS on profiles already
-- restricts rows to the owning user, so the app reads/writes it with the
-- session (anon) client via /api/settings/dashboard-layout.
--
-- Safe to run: idempotent. Run once in the Supabase SQL editor.

alter table public.profiles
  add column if not exists dashboard_layout jsonb;
