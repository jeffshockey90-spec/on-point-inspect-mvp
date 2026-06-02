import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

function getClientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    ""
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const inspectionId = String(body.inspection_id || body.inspectionId || "");
    const viewType = String(body.view_type || body.viewType || "").trim();
    const contactId = String(body.contact_id || body.contactId || "").trim();
    const viewerRole = String(body.viewer_role || body.viewerRole || "").trim();
    const viewerEmail = String(body.viewer_email || body.viewerEmail || "").trim();
    const path = String(body.path || "").trim();

    const numericInspectionId = Number(inspectionId);

    if (!numericInspectionId || !Number.isFinite(numericInspectionId)) {
      return NextResponse.json(
        { error: "Missing or invalid inspection ID." },
        { status: 400 }
      );
    }

    if (!viewType) {
      return NextResponse.json(
        { error: "Missing view type." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("inspection_view_events")
      .insert({
        inspection_id_bigint: numericInspectionId,
        view_type: viewType,
        contact_id: contactId || null,
        viewer_role: viewerRole || null,
        viewer_email: viewerEmail || null,
        path: path || null,
        user_agent: req.headers.get("user-agent") || null,
        ip_address: getClientIp(req) || null,
        metadata: {
          source: "client_tracking_api",
        },
      });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Track inspection view error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to track view." },
      { status: 500 }
    );
  }
}