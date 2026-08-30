-- Inspector "flag for review" on a finding. Set in the Live Camera (and
-- toggleable in the report builder) so the inspector can mark findings to
-- revisit later. Separate from needs_review (which the app auto-sets for raw
-- offline captures that need section verification).
alter table public.findings
  add column if not exists flagged boolean not null default false;

-- Fast lookup of an inspection's flagged findings.
create index if not exists idx_findings_flagged
  on public.findings (inspection_id)
  where flagged;
