-- Caches the generated report PDF so repeat downloads are served instantly from
-- storage instead of rebuilt (~10s each). The route keys the cache by a content
-- SIGNATURE (findings/photos/equipment/etc.), so any report change invalidates
-- it automatically. The PDF bytes live in the existing inspection-photos bucket
-- under `_pdf-cache/<inspection_id>/<variant>.pdf`.
create table if not exists public.report_pdf_cache (
  inspection_id text not null,
  variant       text not null,          -- e.g. "full-en" (reportMode + language)
  signature     text not null,          -- content hash; mismatch => rebuild
  storage_path  text not null,          -- path within the inspection-photos bucket
  updated_at    timestamptz not null default now(),
  primary key (inspection_id, variant)
);

-- Only the service role (used by the PDF route) touches this table; it bypasses
-- RLS, and there are no public policies, so the cache is not client-readable.
alter table public.report_pdf_cache enable row level security;
