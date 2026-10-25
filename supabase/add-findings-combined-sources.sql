-- Reverse-combine support. When defects are combined into one, we snapshot the
-- original source findings here on the surviving finding BEFORE the others are
-- deleted — each source's fields, its original photo ids, and its sort order —
-- so a combine can be fully reversed (split back apart) or have a single
-- location pulled back out later. Null = this finding is not a combined finding.
alter table findings
  add column if not exists combined_sources jsonb;
