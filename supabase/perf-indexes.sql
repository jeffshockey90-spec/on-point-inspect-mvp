-- Performance indexes for the hottest queries in the app.
-- Speeds up: every report open, login, client-portal/share view, reports list,
-- schedule, and dashboard. Adds an index on the columns those queries filter by
-- so Postgres stops scanning whole tables.
--
-- Safe to run: idempotent (IF NOT EXISTS) so it can be re-run, and every
-- table/column below was verified to exist. On a small dataset these build
-- instantly. Run once in the Supabase SQL editor.

-- Public share / client-portal token lookup (the hottest public-facing path).
create index if not exists idx_inspections_public_share_token
  on public.inspections (public_share_token);

-- Event tables: filtered by inspection and ordered by created_at.
-- Composite (col, created_at desc) serves both the filter and the ORDER BY.
create index if not exists idx_ive_inspection_created
  on public.inspection_view_events (inspection_id_bigint, created_at desc);
create index if not exists idx_email_logs_inspection_created
  on public.email_logs (inspection_id_bigint, created_at desc);

-- Per-report child tables read on every report render (share / print / editor).
create index if not exists idx_equipment_inventory_inspection
  on public.equipment_inventory (inspection_id);
create index if not exists idx_section_checklist_selections_inspection
  on public.section_checklist_selections (inspection_id);
create index if not exists idx_section_limitations_inspection
  on public.section_limitations (inspection_id);
create index if not exists idx_section_reference_photos_inspection
  on public.section_reference_photos (inspection_id);
create index if not exists idx_report_disclaimers_inspection
  on public.report_disclaimers (inspection_id);
create index if not exists idx_repair_request_shares_inspection
  on public.repair_request_shares (inspection_id);
create index if not exists idx_mold_tests_inspection
  on public.mold_tests (inspection_id);
create index if not exists idx_radon_tests_inspection
  on public.radon_tests (inspection_id);
create index if not exists idx_limitation_photos_limitation
  on public.limitation_photos (limitation_id);
create index if not exists idx_repair_request_responses_share
  on public.repair_request_responses (share_id);

-- Ubiquitous auth/company lookup — resolved on nearly every authenticated request.
create index if not exists idx_company_users_user
  on public.company_users (user_id);
create index if not exists idx_company_users_company
  on public.company_users (company_id);
