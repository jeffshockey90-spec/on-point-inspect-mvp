-- Adds storage for the company's completed, signed W9 so it can be kept
-- on file in Settings and attached to outbound emails on demand (see
-- app/api/send-w9/route.ts). The file itself lives in the existing
-- company-assets storage bucket (same bucket the logo already uses,
-- under a documents/ folder) - this just tracks the public URL and when
-- it was last uploaded.

alter table public.companies
  add column if not exists w9_document_url text,
  add column if not exists w9_document_uploaded_at timestamptz;
