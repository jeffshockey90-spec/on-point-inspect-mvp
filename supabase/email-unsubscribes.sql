-- Recipients who used the one-click List-Unsubscribe link in an email.
-- Reminder / follow-up sends check this and skip suppressed addresses; the
-- one-time transactional delivery a client asked for (their report, agreement,
-- invoice) still sends. Written by the service-role unsubscribe endpoint only.
create table if not exists email_unsubscribes (
  email text primary key,
  unsubscribed_at timestamptz not null default now(),
  source text
);

alter table email_unsubscribes enable row level security;
-- No policies: only the service-role key (which bypasses RLS) reads/writes this.
