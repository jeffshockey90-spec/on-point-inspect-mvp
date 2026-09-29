-- AI mold lab-report summary
--
-- Stores the AI-drafted, inspector-approved plain-English mold results remark on
-- the mold test, so it shows in the Mold section of the client's environmental
-- report (server-side = single source of truth). Safe + idempotent; the app
-- degrades gracefully until this runs.

alter table public.mold_tests
  add column if not exists ai_remark              text,
  add column if not exists ai_remark_generated_at timestamptz;

comment on column public.mold_tests.ai_remark is
  'AI-drafted, inspector-approved plain-English mold results summary shown to the client.';
comment on column public.mold_tests.ai_remark_generated_at is
  'When the AI mold summary was last drafted.';
