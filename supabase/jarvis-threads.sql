-- Jarvis collaboration threads — the shared workspace where all three of you
-- work an issue: Jarvis (spots it), the owner (confirms/directs), and Claude
-- (the dev session, posts progress + commits). One thread per problem/idea.
--
-- Service-role only (RLS enabled, no policies). The owner reaches it through
-- owner-gated APIs; Claude reaches it through a token-gated bridge API.

create table if not exists jarvis_threads (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  status      text not null default 'open',   -- open | in_progress | shipped | closed
  severity    text not null default 'warning',-- info | warning | critical
  origin      text not null default 'jarvis',  -- jarvis | owner
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists jarvis_threads_status_idx on jarvis_threads (status, updated_at desc);

create table if not exists jarvis_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references jarvis_threads(id) on delete cascade,
  author      text not null,                  -- jarvis | owner | claude
  body        text not null,
  meta        jsonb,                           -- e.g. { commit, files, url }
  created_at  timestamptz not null default now()
);
create index if not exists jarvis_messages_thread_idx on jarvis_messages (thread_id, created_at);

alter table jarvis_threads enable row level security;
alter table jarvis_messages enable row level security;
