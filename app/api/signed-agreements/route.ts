import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export async function GET(req: Request) {
  try {
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