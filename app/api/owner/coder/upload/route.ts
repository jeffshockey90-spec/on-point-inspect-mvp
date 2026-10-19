import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOwnerUser } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A screenshot/doc Jeff attaches in the coder chat can carry a client's name,
// address, or payment details, so attachments live in a PRIVATE bucket scoped
// to the owner's own folder (see supabase/coder-attachments-private-bucket.sql),
// reached only through time-limited signed URLs and swept after a couple of
// weeks by app/api/cron/coder-attachments-cleanup/route.ts.
const BUCKET = "coder-attachments";
// How long a read signed URL (and the file itself) stays reachable — keep in
// sync with app/api/cron/coder-attachments-cleanup/route.ts.
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

// Two modes, owner-only:
//   { name, type } → a one-time signed UPLOAD url so the browser puts the file
//                    straight into storage (no serverless body-size cap).
//   { path }       → after the upload finishes, a signed READ url (the file now
//                    exists, so it can be signed). This is what the chat hands
//                    to Claude's vision model / the doc reader.
export async function POST(req: Request) {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const supabase = admin();

  // Sign-read mode.
  if (body?.path) {
    const path = String(body.path);
    // Only ever sign a file inside this owner's own coder folder.
    if (!path.startsWith(`coder/${owner.id}/`)) {
      return NextResponse.json({ error: "Not your file." }, { status: 403 });
    }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, RETENTION_SECONDS);
    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Could not sign the file." }, { status: 500 });
    }
    return NextResponse.json({ url: data.signedUrl });
  }

  // Upload mode.
  try {
    const name = safeName(body?.name);
    const type = String(body?.type || "");
    const path = `coder/${owner.id}/${Date.now()}-${name}`;

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Could not start upload." }, { status: 500 });
    }

    return NextResponse.json({ path, token: data.token, name: body?.name || "file", type });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Upload failed." }, { status: 500 });
  }
}
