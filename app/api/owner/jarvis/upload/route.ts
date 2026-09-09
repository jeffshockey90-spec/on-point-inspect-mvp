import { NextResponse } from "next/server";
import { createClient } from "../../../../../utils/supabase/server";
import { getAdminClient } from "../../../../../lib/apiAuth";
import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "company-assets";
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

async function requireOwner() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && OWNER_EMAILS.includes(String(user.email || "").toLowerCase())) return user;
  } catch { /* fall through */ }
  return null;
}

// Owner-only: upload one file for a Jarvis thread attachment. Stored in the
// public company-assets bucket under an unguessable jarvis/ path; returns the
// url/name/type to attach to a message's meta.attachments.
export async function POST(req: Request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Expected multipart form." }, { status: 400 }); }
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "No file." }, { status: 400 });

  const blob = file as File;
  if (blob.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 15 MB)." }, { status: 400 });

  const buffer = Buffer.from(await blob.arrayBuffer());
  const safeName = (blob.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `jarvis/${Date.now()}-${rand}-${safeName}`;

  const admin = getAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: blob.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: pub.publicUrl, name: blob.name || safeName, type: blob.type || "application/octet-stream", size: blob.size });
}
