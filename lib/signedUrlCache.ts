import { createClient } from "@supabase/supabase-js";

// Caches Supabase signed-URL STRINGS per (path, variant) so the report builder
// doesn't re-sign every photo on every load. It never changes the files it
// points at — same bytes, same quality. Fully fail-open: any cache error just
// falls back to signing fresh (i.e. today's behavior), so it can never break an
// image. Requires supabase/signed-url-cache.sql to be run; until then every
// read/write errors and we transparently sign everything as before.

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Never reuse a cached URL with less than this much validity left, so a URL can
// never expire mid-session and show a broken image.
const REUSE_BUFFER_MS = 24 * 60 * 60 * 1000; // 1 day

type SignFn = (missingPaths: string[]) => Promise<Record<string, string>>;

export async function getCachedSignedUrls(opts: {
  paths: string[];
  variant: string;
  ttlSeconds: number;
  sign: SignFn;
}): Promise<Record<string, string>> {
  const unique = Array.from(new Set((opts.paths || []).filter(Boolean)));
  if (unique.length === 0) return {};

  const db = admin();
  // No service-role client → skip the cache entirely, just sign.
  if (!db) {
    try {
      return await opts.sign(unique);
    } catch {
      return {};
    }
  }

  const out: Record<string, string> = {};
  const hit = new Set<string>();

  // 1) Read cache (fail-open).
  try {
    const reuseCutoff = Date.now() + REUSE_BUFFER_MS;
    const { data } = await db
      .from("signed_url_cache")
      .select("path, signed_url, expires_at")
      .eq("variant", opts.variant)
      .in("path", unique);
    for (const row of data || []) {
      if (
        row?.path &&
        row?.signed_url &&
        row?.expires_at &&
        new Date(row.expires_at).getTime() > reuseCutoff
      ) {
        out[row.path] = row.signed_url;
        hit.add(row.path);
      }
    }
  } catch {
    /* cache unavailable (e.g. table not created yet) → sign everything below */
  }

  // 2) Sign only the misses (fail-open).
  const misses = unique.filter((p) => !hit.has(p));
  if (misses.length > 0) {
    let signed: Record<string, string> = {};
    try {
      signed = await opts.sign(misses);
    } catch {
      signed = {};
    }

    const expiresAt = new Date(Date.now() + opts.ttlSeconds * 1000).toISOString();
    const rows: Array<{ path: string; variant: string; signed_url: string; expires_at: string }> = [];
    for (const p of misses) {
      if (signed[p]) {
        out[p] = signed[p];
        rows.push({ path: p, variant: opts.variant, signed_url: signed[p], expires_at: expiresAt });
      }
    }

    // 3) Write back (best-effort; never blocks or throws).
    if (rows.length > 0) {
      try {
        await db.from("signed_url_cache").upsert(rows, { onConflict: "path,variant" });
      } catch {
        /* ignore */
      }
    }
  }

  return out;
}
