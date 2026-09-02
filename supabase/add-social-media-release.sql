-- Optional social-media / content-use consent. Separate from the main
-- inspection agreement: the client can grant or skip it (never blocks anything),
-- and whether they granted it shows on the report builder + report page.
--
-- Company-level release text + on/off (owner edits in Settings); per-inspection
-- consent record. Idempotent; run once in Supabase SQL.

alter table public.companies
  add column if not exists social_media_release_enabled boolean not null default false,
  add column if not exists social_media_release_text text;

alter table public.inspections
  add column if not exists social_media_consent boolean,                 -- null = unanswered, true = granted, false = declined
  add column if not exists social_media_consent_at timestamptz,
  add column if not exists social_media_consent_name text,
  add column if not exists social_media_consent_source text;             -- 'signing' | 'portal' | 'report'
