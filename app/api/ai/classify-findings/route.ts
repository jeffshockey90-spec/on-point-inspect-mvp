import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { classifyFindingsWithAI } from "../../../../lib/ai/classifyDefectType";
import { recomputeDealPrevalence } from "../../../../lib/dealInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// AI-tag findings with a Common Ground catalog defect type. dryRun=1 reports
// what WOULD change without writing (safe to run against live data); otherwise
// it updates findings.defect_type and recomputes prevalence.
function authorized(req: Request, url: URL) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // open in local/dev where no secret is configured
  const auth = req.headers.get("authorization") || "";
  const header = req.headers.get("x-cron-secret") || "";
  const q = url.searchParams.get("secret") || "";
  return auth === `Bearer ${secret}` || header === secret || q === secret;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!authorized(req, url)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const inspectionId = (url.searchParams.get("inspectionId") || "").trim();
  const dryRun = url.searchParams.get("dryRun") === "1";
  if (!inspectionId) {
    return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const { data: findings } = await admin
      .from("findings")
      .select("id, title, observation, implication, section, defect_type")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });

    const rows = (findings as any[]) || [];
    if (!rows.length) {
      return NextResponse.json({ ok: true, inspectionId, total: 0, message: "No findings." });
    }

    const keys = await classifyFindingsWithAI(rows);

    let matched = 0;
    const changes: any[] = [];
    rows.forEach((f, i) => {
      const proposed = keys[i]; // catalog key or null
      const proposedStored = proposed || "_unmatched";
      if (proposed) matched += 1;
      const current = f.defect_type ?? null;
      if (proposedStored !== current) {
        changes.push({ id: f.id, title: f.title, section: f.section, from: current, to: proposedStored });
      }
    });

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        inspectionId,
        total: rows.length,
        wouldMatch: matched,
        coverage: `${matched}/${rows.length}`,
        changes,
      });
    }

    // Apply: write new defect_type for changed findings.
    for (const c of changes) {
      await admin.from("findings").update({ defect_type: c.to }).eq("id", c.id);
    }

    // Keep prevalence accurate after re-tagging.
    let prevalence: any = null;
    try {
      prevalence = await recomputeDealPrevalence(admin);
    } catch (e: any) {
      prevalence = { error: e?.message || "recompute failed" };
    }

    return NextResponse.json({
      ok: true,
      applied: true,
      inspectionId,
      total: rows.length,
      matched,
      coverage: `${matched}/${rows.length}`,
      updated: changes.length,
      prevalence,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Classification failed." },
      { status: 500 },
    );
  }
}
