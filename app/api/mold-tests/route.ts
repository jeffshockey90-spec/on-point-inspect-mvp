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

    // Only write fields the caller sent, so a partial save (e.g. editing from
    // the report builder) doesn't wipe result/findings entered elsewhere
    // (audit finding H5).
    const patch: Record<string, any> = {};

    // An explicit 0 samples must win, not fall back to the inspection default
    // (audit L2), so check presence rather than truthiness.
    if (body.air_samples !== undefined) patch.air_samples = getNumber(body.air_samples);
    if (body.surface_samples !== undefined) patch.surface_samples = getNumber(body.surface_samples);
    if (body.lab_name !== undefined) patch.lab_name = body.lab_name || "";
    if (body.lab_report_url !== undefined) patch.lab_report_url = body.lab_report_url || "";
    if (body.lab_status !== undefined) patch.lab_status = body.lab_status || "Pending Collection";
    if (body.findings !== undefined) patch.findings = body.findings || "";
    if (body.notes !== undefined) patch.notes = body.notes || "";

    // Classification: an explicit result/status wins; otherwise derive it from
    // the chosen lab status so picking "Normal" / "Action Recommended" actually
    // sets the mold result instead of staying Pending (audit finding M9).
    if (body.result !== undefined || body.status !== undefined) {
      patch.result = classifyMold(body.result || body.status);
    } else if (body.lab_status !== undefined) {
      patch.result = classifyMold(body.lab_status);
    }

    const { data: existing } = await supabase
      .from("mold_tests")
      .select("id")
      .eq("inspection_id", inspectionId)
      .maybeSingle();

    let saved;

    if (existing?.id) {
      const { data, error } = await supabase
        .from("mold_tests")
        .update(patch)
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
        .insert({
          inspection_id: inspectionId,
          air_samples:
            patch.air_samples ?? getNumber(inspection.mold_air_samples),
          surface_samples:
            patch.surface_samples ?? getNumber(inspection.mold_surface_samples),
          lab_status: patch.lab_status ?? "Pending Collection",
          result: patch.result ?? "Pending",
          ...patch,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      saved = data;
    }

    const summary = buildSummary({
      airSamples: getNumber(saved?.air_samples),
      surfaceSamples: getNumber(saved?.surface_samples),
      result: saved?.result || "Pending",
      findings: saved?.findings || "",
      labStatus: saved?.lab_status || "Pending Collection",
    });

    return NextResponse.json({
      success: true,
      mold_test: saved,
      result: saved?.result ?? null,
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
