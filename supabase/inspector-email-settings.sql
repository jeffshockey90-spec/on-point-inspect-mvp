-- Per-inspector "send from my own company mailbox" (SMTP) settings, used by the
-- manual "Resend via my company email" fallback. The password is stored
-- ENCRYPTED (AES-256-GCM, see lib/secretCrypto.ts) -- never in plaintext.
create table if not exists inspector_email_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  smtp_host text,
  smtp_port int not null default 465,
  smtp_user text,
  smtp_pass_encrypted text,
  from_name text,
  updated_at timestamptz not null default now()
);

alter table inspector_email_settings enable row level security;

-- Each inspector manages only their own row. The encrypted password is useless
-- without the server-side key, and the settings API never returns it to clients.
drop policy if exists "own email settings select" on inspector_email_settings;
create policy "own email settings select" on inspector_email_settings
  for select using (auth.uid() = user_id);

drop policy if exists "own email settings insert" on inspector_email_settings;
create policy "own email settings insert" on inspector_email_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "own email settings update" on inspector_email_settings;
create policy "own email settings update" on inspector_email_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
