-- File attachments on support chat messages (both inspector and owner sides).
-- The file itself lives in the existing public "company-assets" storage bucket
-- under a support/ prefix; these columns hold its URL + display name/type.
alter table public.inspector_support_messages
  add column if not exists attachment_url text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text;
