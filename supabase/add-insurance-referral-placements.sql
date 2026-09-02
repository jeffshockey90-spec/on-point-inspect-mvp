-- Per-placement visibility toggles for the per-inspector insurance-agent
-- referral. Each inspector chooses where THEIR card shows. Defaults preserve
-- current behavior (shown everywhere, incl. realtors) — each inspector turns
-- off the areas they don't want. Idempotent; run once in Supabase SQL.

alter table public.insurance_referral_settings
  add column if not exists show_on_report    boolean not null default true, -- shared report page
  add column if not exists show_on_portal    boolean not null default true, -- client portal
  add column if not exists show_on_hub        boolean not null default true, -- /my-home maintenance hub
  add column if not exists show_to_realtors  boolean not null default true; -- when a realtor opens the report
