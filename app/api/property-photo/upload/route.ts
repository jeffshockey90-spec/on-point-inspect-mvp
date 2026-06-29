import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function safeSegment(value: any) {
  return String(value || "property")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const context = safeSegment(formData.get("context") || "property-photo");

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Missing image file." }, { status: 400 });
    }

    if (!String(file.type || "").startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are allowed." }, { status: 400 });
    }

    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: "Image must be 15MB or smaller." }, { status: 400 });
    }

    const admin = createAdminClient();
    const extension =
      file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
      "jpg";
    const path = `property-photos/${context}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await admin.storage
      .from("inspection-photos")
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = admin.storage
      .from("inspection-photos")
      .getPublicUrl(path);

    const { data: signedUrlData } = await admin.storage
      .from("inspection-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    const publicUrl = publicUrlData?.publicUrl || "";
    const signedUrl = signedUrlData?.signedUrl || "";

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      publicUrl,
      public_url: publicUrl,
      signedUrl,
      signed_url: signedUrl,
      displayUrl: signedUrl || publicUrl,
      display_url: signedUrl || publicUrl,
      path,
      storagePath: path,
      storage_path: path,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Property photo upload failed." },
      { status: 500 }
    );
  }
}
