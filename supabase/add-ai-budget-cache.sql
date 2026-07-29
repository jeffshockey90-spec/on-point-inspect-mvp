-- OpenAI's Costs API has a low rate limit (30 req/min) not meant for
-- frequent polling. The owner dashboard was calling it fresh on every page
-- load/click plus a 15-minute cron, occasionally colliding and 429ing.
-- Cache the last successful result so repeat calls within a few minutes
-- reuse it instead of hitting OpenAI again.
-- Run in the Supabase SQL Editor.

alter table public.ai_budget_status
  add column if not exists cached_spent_since_set_usd numeric,
  add column if not exists cached_spent_fetched_at timestamptz;
