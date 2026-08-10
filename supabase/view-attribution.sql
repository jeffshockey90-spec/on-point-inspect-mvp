-- View attribution: record the device (user-agent) and a hashed IP on every
-- shared-report view event, so the owner can tell WHO opened a report and
-- whether a repeat view is the same device.
--
-- Idempotent: safe to run more than once. Does NOT store raw IPs -- only a
-- salted SHA-256 hash is written by the app.

alter table public.inspection_view_events
  add column if not exists user_agent text;

alter table public.inspection_view_events
  add column if not exists ip_hash text;

-- "Returning viewer?" checks look up prior rows for the same inspection + device.
create index if not exists idx_ive_inspection_ip_hash
  on public.inspection_view_events (inspection_id_bigint, ip_hash);
