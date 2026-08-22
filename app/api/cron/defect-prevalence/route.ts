import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { recomputeDealPrevalence } from "../../../../lib/dealInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ever-learning "Common Ground": classify any newly-published findings and
// recompute defect prevalence (national + per-state) from ALL findings, so the
// percentages adjust automatically as more inspections are logged. Runs nightly
// (and can be hit manually to backfill). Vercel calls it with CRON_SECRET.
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const result = await recomputeDealPrevalence(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Prevalence recompute failed." },
      { status: 500 },
    );
  }
}
