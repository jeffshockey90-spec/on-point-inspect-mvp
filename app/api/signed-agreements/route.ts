import { NextResponse } from "next/server";
import {
  authorizeInspection,
  getAdminClient,
  getSessionUser,
  notFound,
  unauthorized,
} from "../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = getAdminClient();

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const inspectionId = String(
      searchParams.get("inspection_id") ||
        searchParams.get("inspectionId") ||
        ""
    ).trim();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection_id." },
        { status: 400 }
      );
    }

    const inspection = await authorizeInspection(supabase, user.id, inspectionId);
    if (!inspection) return notFound("Inspection not found.");

    const { data, error } = await supabase
      .from("inspection_agreements")
      .select(
        "id, inspection_id, contact_id, client_name, client_email, signed_at, status"
      )
      .eq("inspection_id", inspectionId)
      .eq("status", "signed")
      .order("signed_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      agreements: data || [],
    });
  } catch (error: any) {
    console.error("Signed agreements list error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to load signed agreements." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json();

    const agreementId = String(body.agreementId || body.id || "").trim();
    const inspectionId = String(
      body.inspectionId || body.inspection_id || ""
    ).trim();
    const agreementBody = String(
      body.agreement_body || body.agreementBody || ""
    ).trim();

    if (!agreementId) {
      return NextResponse.json(
        { error: "Missing agreementId." },
        { status: 400 }
      );
    }

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspectionId." },
        { status: 400 }
      );
    }

    const inspection = await authorizeInspection(supabase, user.id, inspectionId);
    if (!inspection) return notFound("Inspection not found.");

    if (!agreementBody) {
      return NextResponse.json(
        { error: "Agreement body cannot be blank." },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("inspection_agreements")
      .select("id, inspection_id, status")
      .eq("id", agreementId)
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing) {
      return NextResponse.json(
        { error: "Signed agreement not found for this inspection." },
        { status: 404 }
      );
    }

    const { data: agreement, error } = await supabase
      .from("inspection_agreements")
      .update({
        agreement_body: agreementBody,
      })
      .eq("id", agreementId)
      .eq("inspection_id", inspectionId)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      agreement,
    });
  } catch (error: any) {
    console.error("Signed agreement update error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to update signed agreement." },
      { status: 500 }
    );
  }
}