import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "../../../utils/supabase/server";
import { resolveInspectionAccessFilter } from "../../../lib/inspectionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function classifyRadon(value: any) {
  const average = getNumber(value);

  if (!average) return "Pending";
  if (average >= 4) return "Action Recommended";
  if (average >= 2) return "Monitor";

  return "Low";
}

export async function GET() {
  try {
    const supabaseAuth = await createClient();

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

    const { data: inspections, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq(accessFilter.column, accessFilter.value)
      .or(
        "radon.eq.true,service_mode.ilike.%radon%,inspection_type.ilike.%radon%,services.ilike.%radon%"
      )
      .order("created_at", { ascending: false });

    if (inspectionError) {
      return NextResponse.json(
        { error: inspectionError.message },
        { status: 500 }
      );
    }

    const inspectionIds = (inspections || []).map((inspection: any) =>
      String(inspection.id)
    );

    let tests: any[] = [];

    if (inspectionIds.length > 0) {
      const { data: radonTests, error: radonError } = await supabase
        .from("radon_tests")
        .select("*")
        .in("inspection_id", inspectionIds);

      if (radonError) {
        return NextResponse.json(
          { error: radonError.message },
          { status: 500 }
        );
      }

      tests = radonTests || [];
    }

    const testMap = new Map(
      tests.map((test: any) => [String(test.inspection_id), test])
    );

    const rows = (inspections || []).map((inspection: any) => ({
      ...inspection,
      radon_test: testMap.get(String(inspection.id)) || null,
    }));

    return NextResponse.json({ inspections: rows });
  } catch (error: any) {
    console.error("Radon GET error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to load radon tests." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabaseAuth = await createClient();

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const inspectionId = body.inspection_id || body.inspectionId;

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const postAccessFilter = await resolveInspectionAccessFilter(supabase, user.id);

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("id, inspector_id")
      .eq("id", inspectionId)
      .eq(postAccessFilter.column, postAccessFilter.value)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const averagePci = getNumber(body.average_pci);
    const result = body.result || classifyRadon(averagePci);

    const payload = {
      inspection_id: inspectionId,
      average_pci: averagePci || null,
      highest_pci: getNumber(body.highest_pci) || null,
      lowest_pci: getNumber(body.lowest_pci) || null,
      start_time: body.start_time || null,
      end_time: body.end_time || null,
      device_name: body.device_name || "",
      serial_number: body.serial_number || "",
      report_url: body.report_url || "",
      report_status: body.report_status || "Pending",
      result,
      notes: body.notes || "",
    };

    const { data: existing } = await supabase
      .from("radon_tests")
      .select("id")
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    let saved;

    if (existing?.id) {
      const { data, error } = await supabase
        .from("radon_tests")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      saved = data;
    } else {
      const { data, error } = await supabase
        .from("radon_tests")
        .insert(payload)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      saved = data;
    }

    return NextResponse.json({
      success: true,
      radon_test: saved,
      result,
    });
  } catch (error: any) {
    console.error("Radon POST error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to save radon test." },
      { status: 500 }
    );
  }
}
