import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushNotification } from "../../../lib/push";
import { isReportViewReload } from "../../../lib/reportViewThrottle";
import {
  getCookieSessionUser,
  resolveCardInspection,
  resolvePortalViewerRole,
} from "../../../lib/portalViewer";

// The only view types the client surfaces send. Anything else is rejected so
// arbitrary event types can't be injected into the Who-Viewed panel.
const ALLOWED_VIEW_TYPES = new Set([
  "client_portal",
  "agreement_viewed",
  "repair_request",
]);

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

function shouldSendOwnerViewPush(viewType: string) {
  return ["client_portal", "report_share", "environmental_share"].includes(
    viewType
  );
}

function getViewTitle(viewType: string) {
  if (viewType === "client_portal") return "Client Portal Opened";
  if (viewType === "environmental_share") return "Environmental Report Viewed";
  return "Report Viewed";
}

function getPropertyLabel(inspection: any) {
  return (
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Inspection report"
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const inspectionId = String(body.inspection_id || body.inspectionId || "");
    const viewType = String(body.view_type || body.viewType || "")
      .trim()
      .toLowerCase();
    const contactId = String(body.contact_id || body.contactId || "").trim();
    const viewerRole = String(body.viewer_role || body.viewerRole || "").trim();
    const viewerEmail = String(body.viewer_email || body.viewerEmail || "").trim();
    const path = String(body.path || "").trim();
    // How the viewer got here: email / sms / qr / direct (from the link's ?src=).
    // Powers the "how accessed" detail on the Who-Viewed panel.
    const accessSource = String(body.src || body.access_source || body.accessSource || "")
      .trim()
      .toLowerCase()
      .slice(0, 24);

    const numericInspectionId = Number(inspectionId);

    if (!numericInspectionId || !Number.isFinite(numericInspectionId)) {
      return NextResponse.json(
        { error: "Missing or invalid inspection ID." },
        { status: 400 }
      );
    }

    if (!viewType || !ALLOWED_VIEW_TYPES.has(viewType)) {
      return NextResponse.json(
        { error: "Missing or unsupported view type." },
        { status: 400 }
      );
    }

    // Proof the caller is actually looking at THIS inspection: its share token,
    // a contact id that belongs to it, or a signed-in user tied to it. This was
    // open to anyone with an inspection number — enough to spam the inspector
    // with "opened" pushes and to backdate the "first viewed" time shown on a
    // signed agreement's certificate.
    let allowed = false;
    const lookup = String(body.lookup || body.token || "").trim();
    if (lookup) {
      const resolved = await resolveCardInspection(supabaseAdmin, lookup);
      allowed = Boolean(resolved.inspection && Number(resolved.inspection.id) === numericInspectionId);
    }
    if (!allowed && contactId) {
      const { data: contact } = await supabaseAdmin
        .from("inspection_contacts")
        .select("id")
        .eq("id", contactId)
        .eq("inspection_id", numericInspectionId)
        .maybeSingle();
      allowed = Boolean(contact?.id);
    }
    if (!allowed) {
      const { data: owning } = await supabaseAdmin
        .from("inspections")
        .select("id, inspector_id, company_id")
        .eq("id", numericInspectionId)
        .maybeSingle();
      allowed =
        Boolean(owning) &&
        (await resolvePortalViewerRole(supabaseAdmin, owning, await getCookieSessionUser())) !== null;
    }
    if (!allowed) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
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
          ...(accessSource ? { access_source: accessSource } : {}),
        },
      });

    if (error) throw error;

    if (shouldSendOwnerViewPush(viewType)) {
      const { data: inspection } = await supabaseAdmin
        .from("inspections")
        .select("id, inspector_id, property_address, address, client_name, client_email, realtor_name, realtor_email, agent_email")
        .eq("id", numericInspectionId)
        .maybeSingle();

      const property = getPropertyLabel(inspection);
      const viewer = viewerEmail || viewerRole || "Someone";

      // Skip the push on reloads: same viewer, same report, within 30 minutes.
      const reload = await isReportViewReload(supabaseAdmin, {
        inspectionId: numericInspectionId,
        ipAddress: getClientIp(req),
        viewerEmail,
      });

      if (inspection?.inspector_id && !reload) {
        await sendPushNotification({
          title: getViewTitle(viewType),
          body: `${viewer} opened ${property}.`,
          url: `/reports/${numericInspectionId}`,
          eventType: viewType,
          target: "user",
          targetUserId: inspection.inspector_id,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Track inspection view error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to track view." },
      { status: 500 }
    );
  }
}
