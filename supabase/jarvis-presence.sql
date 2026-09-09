-- Jarvis presence — the "truth layer" so availability in work threads is never
-- a guess. Jarvis and GPT are cloud/always-on (they answer server-side whenever
-- tagged), so they don't need a row. Claude only answers when the local watcher
-- is running, so the watcher heartbeats here each poll; the UI shows Claude as
-- Online only while that heartbeat is fresh, and a @claude tag with a stale
-- heartbeat triggers an honest, system-authored "offline" fallback.
--
-- Service-role only (RLS on, no policies), same as the rest of Jarvis.

create table if not exists jarvis_presence (
  participant text primary key,          -- 'claude' (others are cloud-always-on)
  last_seen   timestamptz not null default now(),
  source      text,                       -- 'watcher' | 'session'
  meta        jsonb,
  updated_at  timestamptz not null default now()
);

alter table jarvis_presence enable row level security;
