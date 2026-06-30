import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@supabase/ssr";
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

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
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

function redirectBack(request: Request, returnTo: string, key: string, value: string) {
  const baseUrl = new URL(request.url);
  const target = new URL(returnTo || "/reports", baseUrl.origin);
  target.searchParams.set(key, value);
  return NextResponse.redirect(target);
}

function getSafeExtension(file: File) {
  const type = String(file.type || "").toLowerCase();
  const ext = String(file.name || "")
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (type.includes("png") || ext === "png") return "png";
  if (type.includes("webp") || ext === "webp") return "webp";
  return "jpg";
}

function getContentType(extension: string) {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function isHeic(file: File) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();

  return (
    type.includes("heic") ||
    type.includes("heif") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

function isAllowedImage(file: File) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();

  return (
    type.startsWith("image/") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".webp") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export async function POST(request: Request) {
  let returnTo = "/reports";

  try {
    const formData = await request.formData();

    const file =
      (formData.get("property_photo") as File | null) ||
      (formData.get("file") as File | null);

    const inspectionId = String(formData.get("inspection_id") || "").trim();
    returnTo = String(formData.get("return_to") || (inspectionId ? `/reports/${inspectionId}` : "/reports"));
    const context = safeSegment(formData.get("context") || `inspection-${inspectionId || "property-photo"}`);

    if (!file || file.size === 0) {
      return redirectBack(request, returnTo, "property_photo_error", "missing");
    }

    if (!isAllowedImage(file)) {
      return redirectBack(request, returnTo, "property_photo_error", "type");
    }

    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      return redirectBack(request, returnTo, "property_photo_error", "size");
    }

    if (isHeic(file)) {
      return redirectBack(request, returnTo, "property_photo_error", "heic");
    }

    const userSupabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (inspectionId) {
      const { data: ownedInspection, error: ownershipError } = await userSupabase
        .from("inspections")
        .select("id")
        .eq("id", inspectionId)
        .eq("inspector_id", user.id)
        .single();

      if (ownershipError || !ownedInspection) {
        return NextResponse.redirect(new URL("/reports", request.url));
      }
    }

    const admin = createAdminClient();
    const extension = getSafeExtension(file);
    const contentType = getContentType(extension);
    const path = `property-photos/${context}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("inspection-photos")
      .upload(path, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Property photo upload error:", uploadError);
      return redirectBack(request, returnTo, "property_photo_error", "upload");
    }

    const { data: publicUrlData } = admin.storage
      .from("inspection-photos")
      .getPublicUrl(path);

    const { data: signedUrlData } = await admin.storage
      .from("inspection-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    const publicUrl = publicUrlData?.publicUrl || "";
    const signedUrl = signedUrlData?.signedUrl || "";

    if (!publicUrl && !signedUrl) {
      return redirectBack(request, returnTo, "property_photo_error", "url");
    }

    if (inspectionId) {
      const { error: updateError } = await userSupabase
        .from("inspections")
        .update({
          property_image: publicUrl || signedUrl,
          street_view_url: publicUrl || signedUrl,
          cover_photo_url: publicUrl || signedUrl,
        })
        .eq("id", inspectionId)
        .eq("inspector_id", user.id);

      if (updateError) {
        console.error("Property photo save error:", updateError);
        return redirectBack(request, returnTo, "property_photo_error", "save");
      }

      revalidatePath(`/reports/${inspectionId}`);
      revalidatePath(`/reports/${inspectionId}/print`);
      revalidatePath(`/share/${inspectionId}`);
      revalidatePath(`/client-portal/${inspectionId}`);

      return redirectBack(request, returnTo, "property_photo_updated", "1");
    }

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
    console.error("Property photo route crash:", error);
    return redirectBack(request, returnTo, "property_photo_error", "upload");
  }
}
