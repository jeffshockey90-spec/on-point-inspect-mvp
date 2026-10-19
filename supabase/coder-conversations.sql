-- The Coder chat (CoderConsole.tsx) used to live only in the browser's own
-- memory: refreshing the tab, closing it, or opening FLOW on a different
-- device lost the whole conversation and any task it was still waiting on.
-- This persists both centrally per owner, the same way every other FLOW
-- setting is the DB's job to sync, not one browser's.
--
-- Service-role only (RLS enabled, no policies) — the owner reaches it
-- through the owner-gated /api/owner/coder/conversation route, same model as
-- jarvis_threads.

create table if not exists coder_conversations (
  owner_id    uuid primary key,
  messages    jsonb not null default '[]'::jsonb,
  pending     jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table coder_conversations enable row level security;
