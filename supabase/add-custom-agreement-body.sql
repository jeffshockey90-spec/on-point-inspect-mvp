-- Lets an inspector/owner edit the FULL agreement text for a single
-- inspection before it is signed. When this column is set, the client-agreement
-- page and the sign flow use it verbatim instead of the live template merge;
-- clearing it (null) reverts to the auto-generated agreement built from the
-- selected template(s), inspection date, and time.
--
-- No change is needed on inspection_agreements: once signed, the exact text the
-- client saw is already frozen into inspection_agreements.agreement_body, so the
-- signed copy is unaffected by later edits here.

alter table public.inspections
  add column if not exists custom_agreement_body text;
