import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOwnerUser } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "coder-attachments";
// How long the signed URL (and the attachment itself) stays reachable — keep
// this in sync with app/api/cron/coder-attachments-cleanup/route.ts.
const RETENTION_SECONDS = 14 * 24 * 60 * 60;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function safeName(name: string) {
  return (
    String(name || "file")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "file"
  );
}

// A one-time signed upload URL so the browser uploads a pic/doc straight to
// storage (no serverless body-size cap), then uses the returned signed URL in
// the coder chat so Claude can see it. Owner-only. The bucket is private — a
// screenshot here can carry a client's name, address, or payment details —
// so the URL handed back is a signed one, not a public one (see
// supabase/coder-attachments-private-bucket.sql).
export async function POST(req: Request) {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const name = safeName(body?.name);
    const type = String(body?.type || "");

    const supabase = admin();
    const path = `coder/${owner.id}/${Date.now()}-${name}`;

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Could not start upload." }, { status: 500 });
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, RETENTION_SECONDS);
    if (signErr || !signed) {
      return NextResponse.json({ error: signErr?.message || "Could not start upload." }, { status: 500 });
    }

    return NextResponse.json({
      path,
      token: data.token,
      url: signed.signedUrl,
      name: body?.name || "file",
      type,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Upload failed." }, { status: 500 });
  }
}
