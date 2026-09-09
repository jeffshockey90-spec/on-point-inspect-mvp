-- Speeds up count_report_views_deduped() (owner dashboard "Report views").
-- That function scans inspection_view_events for three view_types and runs a
-- window over (inspection_id_bigint, viewer) ordered by created_at. On a large
-- events table (100k+ rows) the seq-scan + sort costs ~2-3s.
--
-- This PARTIAL index covers exactly the rows the function reads and pre-orders
-- them by inspection + time, so Postgres can index-scan the relevant subset
-- instead of scanning + sorting the whole table.
--
-- Safe/idempotent. Run once in the Supabase SQL editor.

create index if not exists inspection_view_events_dedup_idx
  on public.inspection_view_events (inspection_id_bigint, created_at)
  where view_type in ('client_portal', 'report_share', 'environmental_share');
