-- Jarvis — the owner-only FLOW ops/health agent.
--
-- Two tables:
--   app_errors     — a central place failures LAND, so Jarvis can watch them.
--                    Right now most errors are swallowed by try/catch and vanish;
--                    lib/jarvis/logError.ts writes them here instead.
--   jarvis_reports — stored health digests (the feed on the owner Jarvis page).
--
-- Both are RLS-enabled with NO policies: only the service-role key (server) can
-- read/write, and the API layer additionally gates to the platform owner
-- (OWNER_EMAILS). No inspector can ever see this data.

create table if not exists app_errors (
  id          uuid primary key default gen_random_uuid(),
  source      text,                     -- e.g. "api/ask-flow", "cron/reminders"
  route       text,                     -- request path when known
  severity    text not null default 'error', -- info | warning | error | critical
  message     text not null,
  detail      jsonb,                    -- stack, args, ids — anything useful
  count       integer not null default 1, -- deduped occurrences
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists app_errors_last_seen_idx on app_errors (last_seen desc);
create index if not exists app_errors_unresolved_idx on app_errors (resolved_at, last_seen desc);
create index if not exists app_errors_severity_idx on app_errors (severity, last_seen desc);

create table if not exists jarvis_reports (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'digest', -- digest | alert
  headline     text,
  body         text not null,           -- the AI-written report (markdown)
  severity     text not null default 'info', -- info | warning | critical
  signals      jsonb,                   -- raw numbers the report was built from
  created_at   timestamptz not null default now()
);
create index if not exists jarvis_reports_created_idx on jarvis_reports (created_at desc);

alter table app_errors enable row level security;
alter table jarvis_reports enable row level security;
