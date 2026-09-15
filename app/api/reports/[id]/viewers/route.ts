import { NextResponse } from "next/server";
import {
  getSessionUser,
  unauthorized,
  notFound,
  getAdminClient,
  authorizeInspection,
} from "../../../../../lib/apiAuth";
import { buildViewerReport } from "../../../../../lib/reportViewers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/reports/[id]/viewers
//
// The data behind the "Who Viewed This Report" panel: exactly who opened the
// report, how they got in (portal / shared / emailed / texted / QR /
// environmental), on what device, how many sessions, reading time, and flags.
// Works for demo/sample reports too — it just reads that inspection's events.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const inspectionId = Number(id);
    if (!inspectionId || !Number.isFinite(inspectionId)) {
      return NextResponse.json({ error: "Invalid inspection id." }, { status: 400 });
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId);
    if (!authorized) return notFound("Inspection not found.");

    // Pull the report's contacts (for names/roles) and this inspection's client
    // + realtor emails (to answer "has the client/realtor opened it yet?").
    const [eventsResult, contactsResult, inspectionResult] = await Promise.all([
      admin
        // Select * so a not-yet-added column can never 400 the whole query
        // (duration lives in metadata.duration_seconds, not a top-level column).
        .from("inspection_view_events")
        .select("*")
        .eq("inspection_id_bigint", inspectionId)
        .order("created_at", { ascending: true })
        .limit(2000),
      admin
        .from("inspection_contacts")
        .select("id, name, role")
        .eq("inspection_id", inspectionId),
      admin
        .from("inspections")
        .select("client_email, realtor_email, agent_email")
        .eq("id", inspectionId)
        .maybeSingle(),
    ]);

    if (eventsResult.error) {
      console.error("Viewers route events error:", eventsResult.error);
      return NextResponse.json({ error: "Could not load view events." }, { status: 500 });
    }

    const contactsById: Record<string, { name?: string | null; role?: string | null }> = {};
    for (const contact of contactsResult.data || []) {
      contactsById[String(contact.id)] = { name: contact.name, role: contact.role };
    }

    const inspection = (inspectionResult.data || {}) as {
      client_email?: string | null;
      realtor_email?: string | null;
      agent_email?: string | null;
    };
    const realtorEmails = [inspection.realtor_email, inspection.agent_email]
      .map((e: any) => String(e || "").trim().toLowerCase())
      .filter(Boolean);

    const report = buildViewerReport(eventsResult.data || [], {
      contactsById,
      clientEmail: inspection.client_email || "",
      realtorEmails,
    });

    return NextResponse.json(report);
  } catch (error: any) {
    console.error("Viewers route error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load report viewers." },
      { status: 500 },
    );
  }
}
