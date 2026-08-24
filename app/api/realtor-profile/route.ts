import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Realtor self-service profile (headshot/logo + name + brokerage) for the
// Realtor Portal. Portal realtors are identified by email only, so the profile
// is keyed by the logged-in user's email. Service-role handles storage + upsert
// so the closed-RLS table and bucket work without per-realtor policies.
function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function getUserEmail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ? user.email.toLowerCase().trim() : "";
}

export async function GET() {
  const email = await getUserEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data } = await adminClient()
    .from("realtor_profiles")
    .select("email,name,brokerage,photo_url")
    .ilike("email", email)
    .maybeSingle();

  return NextResponse.json({
    profile: data || { email, name: "", brokerage: "", photo_url: "" },
  });
}

export async function POST(req: Request) {
  const email = await getUserEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const form = await req.formData();
    const name = String(form.get("name") || "").trim().slice(0, 120);
    const brokerage = String(form.get("brokerage") || "").trim().slice(0, 160);
    const file = form.get("photo") as File | null;

    const admin = adminClient();
    let photoUrl: string | undefined;

    if (file && typeof file.arrayBuffer === "function" && file.size > 0) {
      if (file.size > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "Image is too large (max 15MB)." }, { status: 413 });
      }
      const input = Buffer.from(await file.arrayBuffer());
      // Preserve aspect (works for a square headshot or a wide brokerage logo),
      // cap the size, and compress so the stored image stays small.
      const out = await sharp(input)
        .rotate()
        .resize(500, 500, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      const slug = email.replace(/[^a-z0-9]+/gi, "-");
      const path = `realtor-avatars/${slug}/${Date.now()}.jpg`;
      const uploaded = await admin.storage
        .from("company-assets")
        .upload(path, out, { contentType: "image/jpeg", upsert: true });
      if (uploaded.error) throw uploaded.error;
      photoUrl = admin.storage.from("company-assets").getPublicUrl(path).data.publicUrl;
    }

    const row: Record<string, any> = {
      email,
      name,
      brokerage,
      updated_at: new Date().toISOString(),
    };
    if (photoUrl) row.photo_url = photoUrl;

    const { data, error } = await admin
      .from("realtor_profiles")
      .upsert(row, { onConflict: "email" })
      .select("email,name,brokerage,photo_url")
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ profile: data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not save profile." }, { status: 500 });
  }
}
