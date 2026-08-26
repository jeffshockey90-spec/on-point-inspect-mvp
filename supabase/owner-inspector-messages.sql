-- Log of owner -> inspector emails sent from the Mail center (re-engagement,
-- broadcasts, etc.). The Resend webhook updates delivered/opened/etc by resend_id.
-- Owner-only feature; the owner pages read this with the service-role key.
create table if not exists owner_inspector_messages (
  id bigint generated always as identity primary key,
  recipient_email text not null,
  recipient_name text,
  subject text,
  template text,
  resend_id text,
  status text default 'sent',
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz
);

create index if not exists owner_inspector_messages_resend_id_idx on owner_inspector_messages (resend_id);
create index if not exists owner_inspector_messages_sent_at_idx on owner_inspector_messages (sent_at desc);

alter table owner_inspector_messages enable row level security;
-- No policies: only the service-role key (owner endpoints/pages) reads/writes.
