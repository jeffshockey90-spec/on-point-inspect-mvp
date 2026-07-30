import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { resolveInspectionAccessFilter } from "../../../lib/inspectionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanInspectionId(value: any) {
  return String(value || "").trim();
}

async function getOwnedInspection(
  supabase: any,
  inspectionId: string,
  userId: string,
) {
  const accessFilter = await resolveInspectionAccessFilter(supabase, userId);

  return await supabase
    .from("inspections")
    .select(
      "id, inspector_id, agreement_waived, agreement_waived_at, agreement_waived_by, agreement_waived_by_name, agreement_waiver_reason",
    )
    .eq("id", inspectionId)
    .eq(accessFilter.column, accessFilter.value)
    .single();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const inspectionId = cleanInspectionId(
      url.searchParams.get("inspection_id") ||
        url.searchParams.get("inspectionId"),
    );

    if (!inspectionId) {
      return NextResponse.json(
        { error: "inspection_id is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: inspection, error } = await getOwnedInspection(
      supabase,
      inspectionId,
      user.id,
    );

    if (error || !inspection) {
      return NextResponse.json(
        { error: error?.message || "Inspection not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      agreement_waived: inspection.agreement_waived === true,
      agreement_waived_at: inspection.agreement_waived_at || null,
      agreement_waived_by: inspection.agreement_waived_by || null,
      agreement_waived_by_name:
        inspection.agreement_waived_by_name || null,
      agreement_waiver_reason:
        inspection.agreement_waiver_reason || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to load agreement waiver." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const inspectionId = cleanInspectionId(
      body.inspectionId || body.inspection_id || body.id,
    );
    const action = String(body.action || "waive").trim().toLowerCase();
    const reason = String(body.reason || "").trim();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "inspectionId is required" },
        { status: 400 },
      );
    }

    if (!["waive", "remove"].includes(action)) {
      return NextResponse.json(
        { error: "action must be waive or remove" },
        { status: 400 },
      );
    }

    if (action === "waive" && !reason) {
      return NextResponse.json(
        { error: "A waiver reason is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: inspection, error: inspectionError } =
      await getOwnedInspection(supabase, inspectionId, user.id);

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: inspectionError?.message || "Inspection not found" },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();
    const userName =
      String(
        user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email ||
          "Inspector",
      ).trim() || "Inspector";

    const update =
      action === "waive"
        ? {
            agreement_waived: true,
            agreement_waived_at: now,
            agreement_waived_by: user.id,
            agreement_waived_by_name: userName,
            agreement_waiver_reason: reason,
          }
        : {
            agreement_waived: false,
            agreement_waived_at: null,
            agreement_waived_by: null,
            agreement_waived_by_name: null,
            agreement_waiver_reason: null,
          };

    const updateAccessFilter = await resolveInspectionAccessFilter(supabase, user.id);

    const { data: savedInspection, error: updateError } = await supabase
      .from("inspections")
      .update(update)
      .eq("id", inspectionId)
      .eq(updateAccessFilter.column, updateAccessFilter.value)
      .select(
        "id, agreement_waived, agreement_waived_at, agreement_waived_by, agreement_waived_by_name, agreement_waiver_reason",
      )
      .single();

    if (updateError || !savedInspection) {
      return NextResponse.json(
        { error: updateError?.message || "Waiver was not saved" },
        { status: 500 },
      );
    }

    // Best-effort audit log. Do not fail the waiver if this optional table
    // is unavailable in an older installation.
    try {
      await supabase.from("inspection_activity").insert({
        inspection_id: inspectionId,
        actor_id: user.id,
        event_type:
          action === "waive"
            ? "agreement_requirement_waived"
            : "agreement_waiver_removed",
        title:
          action === "waive"
            ? "Agreement requirement waived"
            : "Agreement waiver removed",
        detail:
          action === "waive"
            ? reason
            : "The agreement requirement waiver was removed.",
        metadata: {
          waived: action === "waive",
          reason: action === "waive" ? reason : null,
          actor_name: userName,
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      ...savedInspection,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unable to update agreement waiver." },
      { status: 500 },
    );
  }
}
