import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser, unauthorized } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "company-assets";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
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

// Returns a one-time signed upload URL so the browser uploads the attachment
// DIRECTLY to storage. This avoids sending the file through the serverless
// function body (which caps around ~4.5 MB and 413s on report PDFs).
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const name = safeName(body?.name);
    const type = String(body?.type || "");

    const supabase = admin();
    const path = `support/${user.id}/${Date.now()}-${name}`;

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Could not start upload." },
        { status: 500 }
      );
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
