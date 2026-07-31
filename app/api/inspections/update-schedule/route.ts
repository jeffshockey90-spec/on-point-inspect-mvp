import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getAdminClient, authorizeInspection, notFound } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InspectionRow = Record<string, any>;

function hasColumn(row: InspectionRow | null, column: string) {
  return !!row && Object.prototype.hasOwnProperty.call(row, column);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const inspectionId = body.inspectionId;
    const inspectionDate = body.inspection_date;
    const inspectionTime = body.inspection_time || "09:00";
    const status = body.status;

    if (!inspectionId || !inspectionDate) {
      return NextResponse.json(
        { error: "Missing inspectionId or inspection_date" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Defense-in-depth: confirm this inspection belongs to the caller (or their
    // team, for company owners) before rescheduling. The RLS-scoped read/update
    // below remain the primary gate; this returns a clean 404 for foreign ids.
    const allowed = await authorizeInspection(getAdminClient(), user.id, inspectionId);

    if (!allowed) {
      return notFound("Inspection not found");
    }

    const { data: existingInspection, error: readError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (readError || !existingInspection) {
      return NextResponse.json(
        { error: readError?.message || "Inspection not found" },
        { status: 404 }
      );
    }

    const updatePayload: Record<string, any> = {};

    if (hasColumn(existingInspection, "inspection_date")) {
      updatePayload.inspection_date = inspectionDate;
    } else if (hasColumn(existingInspection, "scheduled_date")) {
      updatePayload.scheduled_date = inspectionDate;
    } else if (hasColumn(existingInspection, "date")) {
      updatePayload.date = inspectionDate;
    } else if (hasColumn(existingInspection, "start_date")) {
      updatePayload.start_date = inspectionDate;
    } else {
      return NextResponse.json(
        {
          error:
            "No supported schedule date column found. Expected inspection_date, scheduled_date, date, or start_date.",
        },
        { status: 400 }
      );
    }

    if (hasColumn(existingInspection, "inspection_time")) {
      updatePayload.inspection_time = inspectionTime;
    } else if (hasColumn(existingInspection, "scheduled_time")) {
      updatePayload.scheduled_time = inspectionTime;
    } else if (hasColumn(existingInspection, "time")) {
      updatePayload.time = inspectionTime;
    } else if (hasColumn(existingInspection, "start_time")) {
      updatePayload.start_time = inspectionTime;
    }

    if (status) {
      if (hasColumn(existingInspection, "status")) {
        updatePayload.status = status;
      } else if (hasColumn(existingInspection, "inspection_status")) {
        updatePayload.inspection_status = status;
      }
    }

    if (hasColumn(existingInspection, "updated_at")) {
      updatePayload.updated_at = new Date().toISOString();
    }

    const { data: updatedInspection, error: updateError } = await supabase
      .from("inspections")
      .update(updatePayload)
      .eq("id", inspectionId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message, updatePayload },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      inspection: updatedInspection,
      updated: updatePayload,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Schedule update failed" },
      { status: 500 }
    );
  }
}
