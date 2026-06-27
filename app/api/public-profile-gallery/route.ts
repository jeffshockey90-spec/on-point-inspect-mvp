import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";

const GALLERY_BUCKET = "company-assets";

function cleanText(value: any) {
  return String(value || "").trim();
}

function safeFileName(value: string) {
  const clean = String(value || "portfolio-photo")
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return clean || "portfolio-photo";
}

function getExtension(file: File) {
  const fromName = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";

  return "jpg";
}

function getStoragePathFromPublicUrl(value: any) {
  const clean = cleanText(value);
  if (!clean) return "";

  const marker = `/storage/v1/object/public/${GALLERY_BUCKET}/`;
  const markerIndex = clean.indexOf(marker);

  if (markerIndex === -1) return "";

  try {
    return decodeURIComponent(clean.slice(markerIndex + marker.length).split("?")[0]);
  } catch {
    return clean.slice(markerIndex + marker.length).split("?")[0];
  }
}

async function getCompanyForCurrentUser(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, company: null, error: "Not authenticated." };

  const { data: companyUser, error: companyUserError } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (companyUserError) {
    return { user, company: null, error: companyUserError.message };
  }

  if (!companyUser?.company_id) {
    return { user, company: null, error: "Company not found." };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, profile_slug")
    .eq("id", companyUser.company_id)
    .maybeSingle();

  if (companyError) return { user, company: null, error: companyError.message };
  if (!company) return { user, company: null, error: "Company not found." };

  return { user, company, error: "" };
}

async function loadImages(supabase: any, companyId: any) {
  const { data, error } = await supabase
    .from("public_profile_gallery")
    .select("id, image_url, title, caption, category, display_order, is_featured, is_enabled, created_at")
    .eq("company_id", companyId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

function revalidateProfile(company: any) {
  revalidatePath("/settings/public-profile");
  revalidatePath("/inspectors");
  if (company?.profile_slug) revalidatePath(`/inspectors/${company.profile_slug}`);
}

async function uploadGalleryFile(supabase: any, companyId: any, file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file.");
  }

  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Please upload an image smaller than 12 MB.");
  }

  const extension = getExtension(file);
  const fileName = `${Date.now()}-${safeFileName(file.name)}.${extension}`;
  const path = `public-profile-gallery/${companyId}/${fileName}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(GALLERY_BUCKET)
    .upload(path, bytes, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Unable to upload portfolio photo.");
  }

  const { data } = supabase.storage.from(GALLERY_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { company, error } = await getCompanyForCurrentUser(supabase);

    if (error || !company) {
      return NextResponse.json({ error: error || "Unable to load gallery." }, { status: error === "Not authenticated." ? 401 : 400 });
    }

    const images = await loadImages(supabase, company.id);
    return NextResponse.json({ images });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to load gallery." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { company, error } = await getCompanyForCurrentUser(supabase);

    if (error || !company) {
      return NextResponse.json({ error: error || "Unable to add gallery image." }, { status: error === "Not authenticated." ? 401 : 400 });
    }

    const contentType = request.headers.get("content-type") || "";
    let imageUrl = "";
    let title = "";
    let caption = "";
    let category = "General";
    let displayOrder = 0;
    let isEnabled = true;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("image");

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Choose a photo before adding it to the gallery." }, { status: 400 });
      }

      imageUrl = await uploadGalleryFile(supabase, company.id, file);
      title = cleanText(formData.get("title"));
      caption = cleanText(formData.get("caption"));
      category = cleanText(formData.get("category")) || "General";
      displayOrder = Number(formData.get("displayOrder")) || 0;
      isEnabled = String(formData.get("isEnabled") || "true") !== "false";
    } else {
      const body = await request.json().catch(() => ({}));
      imageUrl = cleanText(body.imageUrl || body.image_url);
      title = cleanText(body.title);
      caption = cleanText(body.caption);
      category = cleanText(body.category) || "General";
      displayOrder = Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0;
      isEnabled = body.isEnabled !== false;
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "Image is required." }, { status: 400 });
    }

    const { error: insertError } = await supabase.from("public_profile_gallery").insert({
      company_id: company.id,
      image_url: imageUrl,
      title,
      caption,
      category,
      display_order: displayOrder,
      is_enabled: isEnabled,
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      const storagePath = getStoragePathFromPublicUrl(imageUrl);
      if (storagePath) {
        await supabase.storage.from(GALLERY_BUCKET).remove([storagePath]);
      }

      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    revalidateProfile(company);
    const images = await loadImages(supabase, company.id);
    return NextResponse.json({ ok: true, images });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to add gallery image." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { company, error } = await getCompanyForCurrentUser(supabase);

    if (error || !company) {
      return NextResponse.json({ error: error || "Unable to update gallery image." }, { status: error === "Not authenticated." ? 401 : 400 });
    }

    const body = await request.json().catch(() => ({}));
    const id = cleanText(body.id);

    if (!id) {
      return NextResponse.json({ error: "Missing gallery image ID." }, { status: 400 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) updates.title = cleanText(body.title);
    if (body.caption !== undefined) updates.caption = cleanText(body.caption);
    if (body.category !== undefined) updates.category = cleanText(body.category) || "General";
    if (body.display_order !== undefined || body.displayOrder !== undefined) {
      updates.display_order = Number(body.display_order ?? body.displayOrder) || 0;
    }
    if (body.is_featured !== undefined || body.isFeatured !== undefined) {
      updates.is_featured = Boolean(body.is_featured ?? body.isFeatured);
    }
    if (body.is_enabled !== undefined || body.isEnabled !== undefined) {
      updates.is_enabled = Boolean(body.is_enabled ?? body.isEnabled);
    }

    const { error: updateError } = await supabase
      .from("public_profile_gallery")
      .update(updates)
      .eq("id", id)
      .eq("company_id", company.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    revalidateProfile(company);
    const images = await loadImages(supabase, company.id);
    return NextResponse.json({ ok: true, images });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to update gallery image." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { company, error } = await getCompanyForCurrentUser(supabase);

    if (error || !company) {
      return NextResponse.json({ error: error || "Unable to delete gallery image." }, { status: error === "Not authenticated." ? 401 : 400 });
    }

    const { searchParams } = new URL(request.url);
    const id = cleanText(searchParams.get("id"));

    if (!id) {
      return NextResponse.json({ error: "Missing gallery image ID." }, { status: 400 });
    }

    const { data: image, error: imageError } = await supabase
      .from("public_profile_gallery")
      .select("id, image_url")
      .eq("id", id)
      .eq("company_id", company.id)
      .maybeSingle();

    if (imageError) {
      return NextResponse.json({ error: imageError.message }, { status: 500 });
    }

    if (!image) {
      return NextResponse.json({ error: "Gallery image not found." }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("public_profile_gallery")
      .delete()
      .eq("id", id)
      .eq("company_id", company.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const storagePath = getStoragePathFromPublicUrl(image.image_url);
    if (storagePath) {
      await supabase.storage.from(GALLERY_BUCKET).remove([storagePath]);
    }

    revalidateProfile(company);
    const images = await loadImages(supabase, company.id);
    return NextResponse.json({ ok: true, images });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to delete gallery image." }, { status: 500 });
  }
}
