import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { sendPushNotification } from "../../../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    },
  );
}

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const inspectionId = body?.inspection_id;
    const nextInspectorId = String(body?.inspector_id || "").trim();

    if (!inspectionId || !nextInspectorId) {
      return NextResponse.json(
        { error: "Missing inspection_id or inspector_id." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: ownerRow } = await admin
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();

    if (!ownerRow?.company_id) {
      return NextResponse.json(
        { error: "Only the company owner can reassign inspections." },
        { status: 403 },
      );
    }

    const { data: inspection } = await admin
      .from("inspections")
      .select("id, company_id, inspector_id, property_address, address")
      .eq("id", inspectionId)
      .maybeSingle();

    if (!inspection || inspection.company_id !== ownerRow.company_id) {
      return NextResponse.json(
        { error: "Inspection not found for your company." },
        { status: 404 },
      );
    }

    const { data: targetMember } = await admin
      .from("company_users")
      .select("user_id")
      .eq("user_id", nextInspectorId)
      .eq("company_id", ownerRow.company_id)
      .maybeSingle();

    if (!targetMember) {
      return NextResponse.json(
        { error: "That inspector is not a member of your company." },
        { status: 400 },
      );
    }

    const { error } = await admin
      .from("inspections")
      .update({ inspector_id: nextInspectorId })
      .eq("id", inspectionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Notify the newly assigned inspector (best-effort; a push failure must not
    // fail the reassignment). Skip if they were already the assignee.
    if (nextInspectorId !== String(inspection.inspector_id || "")) {
      const propertyLabel =
        inspection.property_address || inspection.address || "an inspection";
      try {
        await sendPushNotification({
          title: "New Inspection Assigned",
          body: `You've been assigned ${propertyLabel}.`,
          url: `/reports/${inspectionId}`,
          eventType: "inspection_assigned",
          target: "user",
          targetUserId: nextInspectorId,
        });
      } catch (pushError) {
        console.error("Assignment push failed:", pushError);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not reassign inspection." },
      { status: 500 },
    );
  }
}
