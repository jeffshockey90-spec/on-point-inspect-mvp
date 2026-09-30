-- AI radon report summary (mirrors add-mold-ai-remark.sql)
--
-- Stores the AI-drafted, inspector-approved plain-English radon results remark
-- on the radon test, shown to the client in the Radon section of the separate
-- environmental report. Safe + idempotent; degrades to draft-only until run.

alter table public.radon_tests
  add column if not exists ai_remark              text,
  add column if not exists ai_remark_generated_at timestamptz;

comment on column public.radon_tests.ai_remark is
  'AI-drafted, inspector-approved plain-English radon results summary shown to the client.';
comment on column public.radon_tests.ai_remark_generated_at is
  'When the AI radon summary was last drafted.';
