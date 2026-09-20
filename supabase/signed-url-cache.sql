-- Signed-URL cache: the report builder re-signs every photo's storage path on
-- every load (3 batches of createSignedUrls, 7-day expiry). The URLs point to
-- the SAME files at the SAME quality — regenerating them each load is pure
-- overhead. This caches the signed URL string per (path, variant) so a warm
-- report opens without re-signing.
--
-- Quality is unaffected: this stores URL strings only; no image/video is
-- transformed, recompressed, or moved. `variant` distinguishes the transform
-- baked into the URL ("raw" = full quality, "preview640q72" = the builder's
-- 640px/q72 thumbnail). A cached URL is only ever reused while it has comfortable
-- validity left; otherwise it's re-signed. Service-role only.

CREATE TABLE IF NOT EXISTS signed_url_cache (
  path text NOT NULL,
  variant text NOT NULL,
  signed_url text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (path, variant)
);

ALTER TABLE signed_url_cache ENABLE ROW LEVEL SECURITY;
-- No policies: RLS on with no policy = service-role only (the report page uses
-- the service-role key), clients cannot read/write it.
