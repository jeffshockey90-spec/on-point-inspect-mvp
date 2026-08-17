-- Report download links must be TOKEN-based, never the numeric inspection id.
--
-- The PDF download route only accepts a numeric id from the logged-in owning
-- inspector; everyone else (clients, realtors, a new browser tab with no
-- session) must use the inspection's public_share_token. When a row had no
-- token, the share/portal pages fell back to the numeric id, so the download
-- 401'd with "This download link requires a valid shared report link" for
-- clients and realtors.
--
-- This backfills a token for every existing inspection that lacks one and sets a
-- default so every NEW inspection gets one automatically. gen_random_uuid() is
-- provided by pgcrypto, which Supabase enables by default.

-- 1) Backfill existing rows with no token.
update inspections
set public_share_token = replace(gen_random_uuid()::text, '-', '')
where public_share_token is null
   or btrim(public_share_token) = '';

-- 2) Every future inspection gets a token at insert time.
alter table inspections
  alter column public_share_token
  set default replace(gen_random_uuid()::text, '-', '');

-- 3) Speed up token lookups on the download/share paths.
create index if not exists inspections_public_share_token_idx
  on inspections (public_share_token);
