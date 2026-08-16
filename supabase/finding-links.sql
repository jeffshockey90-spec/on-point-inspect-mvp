-- Link related findings so the report can tell the bigger-picture story (e.g. an
-- exterior vertical gap related to interior marriage cracks -> possible structural
-- movement). Symmetric: linking A to B stores B on A and A on B.

alter table findings
  add column if not exists related_finding_ids jsonb not null default '[]'::jsonb;

-- Optional short note explaining WHY this finding is related to the others.
alter table findings
  add column if not exists related_note text;
