import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";

function cleanText(value: any) {
  return String(value || "").trim();
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

    const body = await request.json().catch(() => ({}));
    const imageUrl = cleanText(body.imageUrl || body.image_url);

    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL is required." }, { status: 400 });
    }

    const { error: insertError } = await supabase.from("public_profile_gallery").insert({
      company_id: company.id,
      image_url: imageUrl,
      title: cleanText(body.title),
      caption: cleanText(body.caption),
      category: cleanText(body.category) || "General",
      display_order: Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0,
      is_enabled: body.isEnabled !== false,
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
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
    if (body.is_enabled !== undefined || body.is_enabled === false || body.isEnabled !== undefined) {
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

    const { error: deleteError } = await supabase
      .from("public_profile_gallery")
      .delete()
      .eq("id", id)
      .eq("company_id", company.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    revalidateProfile(company);
    const images = await loadImages(supabase, company.id);
    return NextResponse.json({ ok: true, images });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to delete gallery image." }, { status: 500 });
  }
}
