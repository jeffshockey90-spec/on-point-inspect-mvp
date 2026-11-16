import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser, unauthorized, notFound, authorizeInspection } from "../../../lib/apiAuth";
import { sendAgreementReminder } from "../../../lib/agreementReminder";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getBaseUrl(req: Request) {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL;

  if (envUrl) return envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;

  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json();

    const inspectionId = String(body.inspectionId || "");
    const contactId = body.contactId ? String(body.contactId) : "";

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Missing RESEND_API_KEY." }, { status: 500 });
    }

    const authorizedInspection = await authorizeInspection(supabase, user.id, inspectionId);
    if (!authorizedInspection) return notFound("Inspection not found.");

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    const result = await sendAgreementReminder(supabase, inspection, {
      baseUrl: getBaseUrl(req),
      contactId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.failed ? { failed: result.failed } : {}) },
        { status: result.status },
      );
    }

    const { ok: _ok, ...payload } = result;
    return NextResponse.json({ success: true, ...payload });
  } catch (error: any) {
    console.error("Send agreement reminder error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to send agreement reminder.",
      },
      { status: 500 }
    );
  }
}
