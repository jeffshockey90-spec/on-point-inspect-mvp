import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOwnerUser } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "company-assets";

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
// storage (no serverless body-size cap), then uses the returned public URL in
// the coder chat so Claude can see it. Owner-only.
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

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      path,
      token: data.token,
      url: pub?.publicUrl || "",
      name: body?.name || "file",
      type,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Upload failed." }, { status: 500 });
  }
}
