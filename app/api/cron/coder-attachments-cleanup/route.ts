import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "coder-attachments";
// Keep in sync with the signed-URL lifetime in app/api/owner/coder/upload/route.ts
// so an attachment stays viewable in the chat right up until it's removed.
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

// Coder chat attachments (screenshots/docs Jeff attaches) only need to live
// as long as that conversation does. This sweeps anything older than the
// retention window out of private storage so it doesn't sit around
// indefinitely (see supabase/coder-attachments-private-bucket.sql).
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  const xcs = req.headers.get("x-cron-secret") || "";
  return auth === `Bearer ${secret}` || xcs === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const cutoff = Date.now() - RETENTION_MS;
  let scanned = 0;
  let removed = 0;

  try {
    const { data: ownerFolders, error: listErr } = await admin.storage.from(BUCKET).list("coder", { limit: 1000 });
    if (listErr) throw listErr;

    for (const folder of ownerFolders || []) {
      if (!folder.name || folder.id !== null) continue; // only folders (one per owner) have a null id
      const prefix = `coder/${folder.name}`;
      // eslint-disable-next-line no-await-in-loop
      const { data: files, error: filesErr } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
      if (filesErr) continue;

      scanned += (files || []).length;
      const stale = (files || [])
        .filter((f) => f.id !== null && new Date(f.created_at || 0).getTime() < cutoff)
        .map((f) => `${prefix}/${f.name}`);

      if (stale.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const { error: delErr } = await admin.storage.from(BUCKET).remove(stale);
        if (!delErr) removed += stale.length;
      }
    }

    return NextResponse.json({ ok: true, scanned, removed });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Cleanup failed." }, { status: 500 });
  }
}
