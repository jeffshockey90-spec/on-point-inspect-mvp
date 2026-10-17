import { NextResponse } from "next/server";
import { requireOwnerUser, coderRepo, coderConfigured, gh } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stop a running coding task — cancels the GitHub Actions run.
export async function POST(req: Request) {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  if (!coderConfigured()) return NextResponse.json({ error: "Not connected." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const runId = Number(body?.run_id);
  if (!Number.isFinite(runId) || runId <= 0) {
    return NextResponse.json({ error: "Missing run id." }, { status: 400 });
  }

  try {
    const res = await gh(`/repos/${coderRepo()}/actions/runs/${runId}/cancel`, { method: "POST" });
    // GitHub returns 202 Accepted on a cancel request.
    if (!res.ok && res.status !== 202) {
      const t = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Could not stop it (${res.status}). ${t.slice(0, 160)}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, message: "Stopping…" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not stop it." }, { status: 500 });
  }
}
