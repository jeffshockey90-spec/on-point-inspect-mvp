-- Conversations (stage 1) — persist the owner's OUTBOUND replies so a thread
-- shows both sides of the conversation, not just the client's inbound message.
--
-- Inbound lives in inbound_replies (one row per received email). Every time the
-- owner replies from FLOW (/api/owner/replies action "reply") we also insert one
-- row here, keyed by the contact's email so the Conversations view can merge
-- inbound + outbound into a single per-contact thread.
--
-- RLS is enabled with NO policies: only the service-role key (server) can read
-- or write, matching inbound_replies and the rest of FLOW's owner-only data.

create table if not exists conversation_outbound (
  id            uuid primary key default gen_random_uuid(),
  to_email      text not null,           -- contact we replied to (thread key, lowercased)
  subject       text,
  body          text,                    -- the plain-text reply the owner sent
  in_reply_to   text,                    -- Message-ID we threaded onto (from the inbound row)
  resend_id     text,                    -- Resend message id (for delivery lookups)
  inbound_id    uuid,                    -- the inbound_replies row this answers (nullable)
  inspection_id text,                    -- carried from the inbound match, if any
  sent_by       text,                    -- owner email who sent it
  sent_at       timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists conversation_outbound_contact_idx
  on conversation_outbound (lower(to_email), sent_at desc);
create index if not exists conversation_outbound_inbound_idx
  on conversation_outbound (inbound_id);

alter table conversation_outbound enable row level security;
