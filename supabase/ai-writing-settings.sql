-- AI Writing Studio — per-company settings for how the AI writes finding
-- narratives (cited SOP standard, length, detail, tone, per-severity overrides).
-- Modeled on company_pricing: one row per company, structured object in a jsonb
-- `config` column. Read by the finding-writer routes via the service-role
-- client (lib/ai/loadWritingConfig.ts) and edited by the company owner through
-- /api/ai-writing-settings.
--
-- Safe to run: idempotent (IF NOT EXISTS). Run once in the Supabase SQL editor.

create table if not exists public.company_ai_writing_settings (
  company_id bigint primary key references public.companies (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- The app reads/writes this table through the service-role client (bypasses
-- RLS) and gates edits to the company owner in the API route, mirroring
-- company_pricing. Enable RLS with no permissive policies so the anon/auth
-- keys cannot read or write it directly.
alter table public.company_ai_writing_settings enable row level security;
