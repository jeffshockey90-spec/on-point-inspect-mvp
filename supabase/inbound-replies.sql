-- Inbound replies pulled from the support@flowinspect.app mailbox (Zoho IMAP).
-- The poll-replies cron inserts one row per new message, deduped by message_id.
-- RLS is enabled with no policies: only the service-role key (server) can read
-- or write, matching how the rest of FLOW's owner-only data is gated.

create table if not exists inbound_replies (
  id            uuid primary key default gen_random_uuid(),
  message_id    text unique,            -- RFC5322 Message-ID, used to dedupe
  from_email    text,
  from_name     text,
  subject       text,
  snippet       text,                   -- first ~600 chars of the plain-text body
  body_text     text,                   -- full plain-text body (capped on insert)
  in_reply_to   text,                   -- Message-ID this is replying to (threading)
  refs          text,                   -- References header (threading)
  received_at   timestamptz,
  inspection_id text,                   -- best-effort match to an inspection
  matched_name  text,                   -- client/realtor name we matched on
  is_read       boolean not null default false,
  replied_at    timestamptz,            -- set when the owner replies from FLOW
  created_at    timestamptz not null default now()
);

create index if not exists inbound_replies_received_idx on inbound_replies (received_at desc);
create index if not exists inbound_replies_unread_idx on inbound_replies (is_read, received_at desc);

alter table inbound_replies enable row level security;
