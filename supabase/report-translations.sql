-- Multi-language (#23): cached AI translations of a report's client-facing
-- strings, so viewing a report in a language translates once and is then
-- instant/free on every later view. One row per (inspection, language); the
-- translations map is hash-of-source -> translated string.
create table if not exists public.report_translations (
  inspection_id bigint not null,
  lang          text   not null,
  translations  jsonb  not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (inspection_id, lang)
);

-- Only ever read/written by the service-role report pages/routes, so lock it
-- down: enable RLS with no policies (service role bypasses RLS; anon/auth get
-- nothing). The translated content is not sensitive, but there's no reason for
-- direct client access.
alter table public.report_translations enable row level security;
