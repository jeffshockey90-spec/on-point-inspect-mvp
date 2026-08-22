-- Feature #17: Pay Splits — per-inspector commission on inspection fees.
--
-- A multi-inspector company owner sets each inspector's commission % (the cut
-- of the gross inspection fee the inspector keeps). company_users.commission_pct
-- is the per-inspector rate; when it's null the company-wide default is used.
-- companies.default_commission_pct is that default (100 = inspector keeps all,
-- i.e. a solo shop; lower it for a revenue-share arrangement).
--
-- Idempotent: safe to run more than once.

alter table public.company_users
  add column if not exists commission_pct numeric;

alter table public.companies
  add column if not exists default_commission_pct numeric default 100;

comment on column public.company_users.commission_pct is
  'Inspector''s commission on the gross inspection fee, 0-100. NULL = use companies.default_commission_pct.';
comment on column public.companies.default_commission_pct is
  'Default inspector commission % applied when company_users.commission_pct is NULL. Defaults to 100.';
