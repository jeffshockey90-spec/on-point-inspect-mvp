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

function classifyMold(status: any) {
  const value = String(status || "").toLowerCase();

  if (
    value.includes("elevated") ||
    value.includes("positive") ||
    value.includes("action") ||
    value.includes("recommend")
  ) {
    return "Action Recommended";
  }

  if (
    value.includes("normal") ||
    value.includes("not elevated") ||
    value.includes("acceptable") ||
    value.includes("clear")
  ) {
    return "Normal";
  }

  return "Pending";
}

function buildSummary({
  airSamples,
  surfaceSamples,
  result,
  findings,
  labStatus,
}: {
  airSamples: number;
  surfaceSamples: number;
  result: string;
  findings: string;
  labStatus: string;
}) {
  const parts = [];

  if (airSamples > 0) {
    parts.push(`${airSamples} air sample${airSamples === 1 ? "" : "s"}`);
  }

  if (surfaceSamples > 0) {
    parts.push(
      `${surfaceSamples} surface/tape/swab sample${
        surfaceSamples === 1 ? "" : "s"
      }`
    );
  }

  const sampleText =
    parts.length > 0 ? parts.join(" and ") : "mold samples";

  if (labStatus !== "Completed" && result === "Pending") {
    return `Mold sampling was performed with ${sampleText}. The current lab status is ${labStatus}. Final laboratory results are pending.`;
  }

  if (result === "Action Recommended") {
    return `Mold sampling was performed with ${sampleText}. The lab results or observations indicate elevated or concerning conditions. Further evaluation and/or remediation by a qualified mold remediation contractor is recommended.${
      findings ? ` Summary: ${findings}` : ""
    }`;
  }

  if (result === "Normal") {
    return `Mold sampling was performed with ${sampleText}. The lab results did not indicate elevated mold conditions at the sampled locations at the time of testing.${
      findings ? ` Summary: ${findings}` : ""
    }`;
  }

  return `Mold sampling was performed with ${sampleText}. Lab results are pending or have not been fully entered yet.${
    findings ? ` Notes: ${findings}` : ""
  }`;
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
        "mold.eq.true,service_mode.ilike.%mold%,inspection_type.ilike.%mold%,services.ilike.%mold%"
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
      const { data: moldTests, error: moldError } = await supabase
        .from("mold_tests")
        .select("*")
        .in("inspection_id", inspectionIds);

      if (moldError) {
        return NextResponse.json(
          { error: moldError.message },
          { status: 500 }
        );
      }

      tests = moldTests || [];
    }

    const testMap = new Map(
      tests.map((test: any) => [String(test.inspection_id), test])
    );

    const rows = (inspections || []).map((inspection: any) => ({
      ...inspection,
      mold_test: testMap.get(String(inspection.id)) || null,
    }));

    return NextResponse.json({ inspections: rows });
  } catch (error: any) {
    console.error("Mold GET error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to load mold tests." },
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
      .select("id, inspector_id, mold_air_samples, mold_surface_samples")
      .eq("id", inspectionId)
      .eq(postAccessFilter.column, postAccessFilter.value)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const airSamples =
      getNumber(body.air_samples) || getNumber(inspection.mold_air_samples);
    const surfaceSamples =
      getNumber(body.surface_samples) ||
      getNumber(inspection.mold_surface_samples);
    const result = classifyMold(body.result || body.status);
    const findings = body.findings || "";
    const labStatus = body.lab_status || "Pending Collection";

    const summary = buildSummary({
      airSamples,
      surfaceSamples,
      result,
      findings,
      labStatus,
    });

    const payload = {
      inspection_id: inspectionId,
      air_samples: airSamples,
      surface_samples: surfaceSamples,
      lab_name: body.lab_name || "",
      lab_report_url: body.lab_report_url || "",
      lab_status: labStatus,
      findings,
      result,
      notes: body.notes || "",
    };

    const { data: existing } = await supabase
      .from("mold_tests")
      .select("id")
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    let saved;

    if (existing?.id) {
      const { data, error } = await supabase
        .from("mold_tests")
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
        .from("mold_tests")
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
      mold_test: saved,
      result,
      summary,
    });
  } catch (error: any) {
    console.error("Mold POST error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to save mold test." },
      { status: 500 }
    );
  }
}
