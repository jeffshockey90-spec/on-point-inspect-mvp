-- Custom severity levels — per-company. One row per company, a structured
-- object in a jsonb `config` column ({ levels: [{ id, label, color, critical }] }).
-- Read via the service-role client (lib/severity/loadSeverityConfig.ts) and
-- edited by the company owner through /api/severity-settings. Modeled exactly on
-- company_ai_writing_settings / company_pricing.
--
-- Safe to run: idempotent (IF NOT EXISTS). Run once in the Supabase SQL editor.

create table if not exists public.company_severity_settings (
  company_id bigint primary key references public.companies (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Read/written through the service-role client (bypasses RLS); edits are gated
-- to the company owner in the API route. Enable RLS with no permissive policies
-- so the anon/auth keys cannot read or write it directly.
alter table public.company_severity_settings enable row level security;
