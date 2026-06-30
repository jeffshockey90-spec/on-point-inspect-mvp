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

function buildReturnUrl(request: Request, returnTo: string, key: string, value: string) {
  const baseUrl = new URL(request.url);
  const target = new URL(returnTo || "/reports", baseUrl.origin);
  target.searchParams.delete("property_photo_error");
  target.searchParams.delete("property_photo_updated");
  target.searchParams.set(key, value);
  return target;
}

function sendResult(
  request: Request,
  ajax: boolean,
  returnTo: string,
  ok: boolean,
  key: string,
  value: string,
  extra: Record<string, any> = {},
) {
  const target = buildReturnUrl(request, returnTo, key, value);

  if (ajax) {
    return NextResponse.json(
      {
        ok,
        [key]: value,
        redirectTo: `${target.pathname}${target.search}`,
        ...extra,
      },
      { status: ok ? 200 : 400 },
    );
  }

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

function isAllowedImage(file: File) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();

  return (
    type.startsWith("image/") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".webp")
  );
}

export async function POST(request: Request) {
  let returnTo = "/reports";
  let ajax = false;

  try {
    const formData = await request.formData();

    ajax = String(formData.get("ajax") || "") === "1";

    const file =
      (formData.get("property_photo") as File | null) ||
      (formData.get("file") as File | null);

    const inspectionId = String(formData.get("inspection_id") || "").trim();
    returnTo = String(
      formData.get("return_to") || (inspectionId ? `/reports/${inspectionId}` : "/reports"),
    );
    const context = safeSegment(
      formData.get("context") || `inspection-${inspectionId || "property-photo"}`,
    );

    if (!file || file.size === 0) {
      return sendResult(request, ajax, returnTo, false, "property_photo_error", "missing", {
        error: "missing",
      });
    }

    if (!isAllowedImage(file)) {
      return sendResult(request, ajax, returnTo, false, "property_photo_error", "type", {
        error: "type",
      });
    }

    // The client component compresses normal iPhone camera photos before this route is called.
    // Keep this limit low enough that Vercel is not asked to process huge raw camera files.
    const maxBytes = 4 * 1024 * 1024;
    if (file.size > maxBytes) {
      return sendResult(request, ajax, returnTo, false, "property_photo_error", "size", {
        error: "size",
      });
    }

    const userSupabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await userSupabase.auth.getUser();

    if (!user) {
      if (ajax) {
        return NextResponse.json({ ok: false, error: "auth", redirectTo: "/login" }, { status: 401 });
      }
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
        if (ajax) {
          return NextResponse.json({ ok: false, error: "ownership", redirectTo: "/reports" }, { status: 403 });
        }
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
      return sendResult(request, ajax, returnTo, false, "property_photo_error", "upload", {
        error: "upload",
      });
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
      return sendResult(request, ajax, returnTo, false, "property_photo_error", "url", {
        error: "url",
      });
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
        return sendResult(request, ajax, returnTo, false, "property_photo_error", "save", {
          error: "save",
        });
      }

      revalidatePath(`/reports/${inspectionId}`);
      revalidatePath(`/reports/${inspectionId}/print`);
      revalidatePath(`/share/${inspectionId}`);
      revalidatePath(`/client-portal/${inspectionId}`);

      return sendResult(request, ajax, returnTo, true, "property_photo_updated", "1", {
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
    return sendResult(request, ajax, returnTo, false, "property_photo_error", "upload", {
      error: "upload",
    });
  }
}
