import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "../../../utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
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

function classifyRadon(average: any) {
  const value = getNumber(average);

  if (value === null) return "Pending";
  if (value >= 4) return "Action Recommended";
  if (value >= 2) return "Monitor";

  return "Low";
}

function buildSummary(average: any) {
  const value = getNumber(average);

  if (value === null) {
    return "Radon test results have not been entered yet.";
  }

  if (value >= 4) {
    return `The average radon concentration measured during the testing period was ${value} pCi/L. This is at or above the EPA action level of 4.0 pCi/L. Mitigation by a qualified radon contractor is recommended.`;
  }

  if (value >= 2) {
    return `The average radon concentration measured during the testing period was ${value} pCi/L. This is below the EPA action level of 4.0 pCi/L but above 2.0 pCi/L. Continued monitoring or consultation may be considered.`;
  }

  return `The average radon concentration measured during the testing period was ${value} pCi/L. This is below the EPA action level of 4.0 pCi/L.`;
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

    const { data: inspections, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("inspector_id", user.id)
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

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("id, inspector_id")
      .eq("id", inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    if (inspection.inspector_id !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const average = getNumber(body.average_pci);
    const result = classifyRadon(average);
    const summary = buildSummary(average);

    const payload = {
      inspection_id: inspectionId,
      average_pci: average,
      highest_pci: getNumber(body.highest_pci),
      lowest_pci: getNumber(body.lowest_pci),
      start_time: body.start_time || null,
      end_time: body.end_time || null,
      device_name: body.device_name || "",
      serial_number: body.serial_number || "",
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
      summary,
    });
  } catch (error: any) {
    console.error("Radon POST error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to save radon test." },
      { status: 500 }
    );
  }
}
