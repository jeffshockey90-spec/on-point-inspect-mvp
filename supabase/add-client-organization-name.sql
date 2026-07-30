-- Lets an inspector record that the person hiring them is doing so on
-- behalf of a business or charity/nonprofit, so that organization's name
-- can appear on the agreement and the report alongside the individual
-- client's own name (not instead of it).
--
-- inspection_agreements gets its own copy, frozen at signing time, for the
-- same reason client_name/client_email are already frozen there: a signed
-- legal document shouldn't silently change if the inspection row is
-- edited afterward.

alter table public.inspections
  add column if not exists client_organization_name text;

alter table public.inspection_agreements
  add column if not exists client_organization_name text;
