-- Photo reordering within a finding.
--
-- The report builder already writes photos.sort_order when an inspector drags/
-- arrows a photo into a new position, but the column never existed — so those
-- writes silently 400'd and reordering did nothing.
--
-- Nullable on purpose: every existing photo keeps sort_order = NULL. Read paths
-- must order by (sort_order NULLS LAST, created_at) so legacy photos keep their
-- current created_at order and NOTHING gets dropped (ordering by a missing
-- column is what previously 400'd and blanked photos out of reports/PDFs).
--
-- Run this in the Supabase SQL editor BEFORE the read-ordering code change ships.

alter table public.photos
  add column if not exists sort_order integer;
