-- Inspector/business locale: country, default report language, and currency.
-- Country drives the default currency (#29) and the default language the report
-- is presented in; each can be set individually at signup or in Settings.
alter table public.companies
  add column if not exists country text default 'US',
  add column if not exists preferred_language text default 'en',
  add column if not exists currency text default 'USD';
