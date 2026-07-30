import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  getAgreementVersion,
  normalizeAgreementState,
} from "../../../lib/agreementTemplates";
import { resolveInspectionAccessFilter } from "../../../lib/inspectionAccess";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
        setAll() {},
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    // This route uses the service-role key, which bypasses RLS - it must
    // verify the caller is logged in and owns this inspection itself.
    const authedSupabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await authedSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized. You must be logged in." },
        { status: 401 }
      );
    }

    const body = await req.json();

    const inspectionId = String(body.inspectionId || "");
    const agreementState = normalizeAgreementState(body.agreementState);

    const agreementTemplateIds = Array.isArray(body.agreementTemplateIds)
      ? body.agreementTemplateIds.map((id: any) => String(id)).filter(Boolean)
      : body.agreementTemplateId
        ? [String(body.agreementTemplateId)]
        : [];

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

    const { data: ownedInspection, error: ownershipError } = await supabase
      .from("inspections")
      .select("id")
      .eq("id", inspectionId)
      .eq(accessFilter.column, accessFilter.value)
      .single();

    if (ownershipError || !ownedInspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    let version = getAgreementVersion(agreementState);
    let primaryTemplateId: string | null =
      agreementTemplateIds[0] || null;

    if (agreementTemplateIds.length > 0) {
      const { data: templates } = await supabase
        .from("agreement_templates")
        .select("*")
        .in("id", agreementTemplateIds);

      if (templates && templates.length > 0) {
        version = templates
          .map((template) => template.version || template.title)
          .filter(Boolean)
          .join(" + ");
      }
    }

    const { data, error } = await supabase
      .from("inspections")
      .update({
        agreement_state: agreementState,
        agreement_version: version,
        agreement_template_id: primaryTemplateId,
        agreement_template_ids: agreementTemplateIds,
      })
      .eq("id", inspectionId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      inspection: data,
      agreement_state: agreementState,
      agreement_version: version,
      agreement_template_id: primaryTemplateId,
      agreement_template_ids: agreementTemplateIds,
    });
  } catch (error: any) {
    console.error("Update agreement state error:", error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Failed to update agreement selection.",
      },
      { status: 500 }
    );
  }
}
