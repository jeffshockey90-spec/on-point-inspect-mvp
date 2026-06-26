import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../../utils/supabase/server";

function cleanText(value: any) {
  return String(value || "").trim();
}

function getCoverUrl(inspection: any) {
  return (
    inspection?.property_image_url ||
    inspection?.property_image ||
    inspection?.street_view_url ||
    ""
  );
}

function normalizeShareUrl(value: string, inspectionId: string) {
  const clean = cleanText(value);
  if (clean) return clean;
  return `/share/${inspectionId}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const inspectionId = cleanText(body.inspectionId);
    const enabled = body.enabled === true;
    const title = cleanText(body.title);
    const description = cleanText(body.description);
    const shareUrl = normalizeShareUrl(cleanText(body.shareUrl), inspectionId);

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    const { data: companyUser, error: companyUserError } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (companyUserError) {
      console.error("Sample report company lookup error:", companyUserError);
      return NextResponse.json({ error: "Unable to verify company access." }, { status: 500 });
    }

    if (!companyUser?.company_id) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    // Match the actual inspections table columns. Do not select non-existent photo fields.
    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select(
        "id, company_id, inspector_id, address, property_address, client_name, inspection_type, service_mode, services, property_image_url, property_image, street_view_url"
      )
      .eq("id", inspectionId)
      .maybeSingle();

    if (inspectionError) {
      console.error("Sample report inspection lookup error:", inspectionError);
      return NextResponse.json({ error: inspectionError.message || "Unable to load report." }, { status: 500 });
    }

    if (!inspection) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const currentUserCompanyId = cleanText(companyUser.company_id);
    const inspectionCompanyId = cleanText(inspection.company_id);
    const currentUserOwnsReport = cleanText(inspection.inspector_id) === cleanText(user.id);
    const sameCompany = Boolean(inspectionCompanyId && inspectionCompanyId === currentUserCompanyId);

    if (!currentUserOwnsReport && !sameCompany) {
      return NextResponse.json(
        { error: "You do not have access to this report." },
        { status: 403 }
      );
    }

    const fallbackTitle =
      title ||
      cleanText(inspection.address || inspection.property_address || inspection.client_name) ||
      "Sample Inspection Report";

    const fallbackDescription =
      description ||
      cleanText(inspection.inspection_type || inspection.service_mode || inspection.services) ||
      "View a sample inspection report from this inspector.";

    const { error } = await supabase.from("public_sample_reports").upsert(
      {
        company_id: Number(companyUser.company_id),
        inspection_id: Number(inspection.id),
        title: fallbackTitle,
        description: fallbackDescription,
        cover_image_url: getCoverUrl(inspection),
        share_url: shareUrl,
        is_enabled: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,inspection_id" }
    );

    if (error) {
      console.error("Sample report save error:", error);
      return NextResponse.json(
        { error: error.message || "Unable to save sample report." },
        { status: 500 }
      );
    }

    revalidatePath(`/reports/${inspectionId}`);
    revalidatePath("/inspectors");

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Sample report API error:", error);
    return NextResponse.json(
      { error: error?.message || "Unable to save sample report." },
      { status: 500 }
    );
  }
}
