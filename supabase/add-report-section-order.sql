-- Persists the inspector's custom report-section order. The report builder lets
-- you drag section headers (or use the up/down arrows) to reorder sections, but
-- that order was never saved - it reset on every refresh/publish. This column
-- stores the ordered list of section names; resolveActiveSections honors it so
-- the same order shows in the builder, the client share page, the print/PDF
-- view, and the realtor download. Null/empty = the default built-in order.

alter table public.inspections
  add column if not exists report_section_order jsonb;
