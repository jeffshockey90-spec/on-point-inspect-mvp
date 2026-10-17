import { NextResponse } from "next/server";
import { requireOwnerUser, coderRepo, coderConfigured, gh } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Approve & merge, from inside FLOW. GitHub only allows this when the required
// CI checks pass (per the branch ruleset), so a tap here = the owner's approval
// of a change that already built clean. Merging main triggers the Vercel deploy.
export async function POST(req: Request) {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  if (!coderConfigured()) return NextResponse.json({ error: "Not connected." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const number = Number(body?.number);
  if (!Number.isFinite(number) || number <= 0) {
    return NextResponse.json({ error: "Missing PR number." }, { status: 400 });
  }

  try {
    const res = await gh(`/repos/${coderRepo()}/pulls/${number}/merge`, {
      method: "PUT",
      body: JSON.stringify({ merge_method: "squash" }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 405 = not mergeable (checks failing / conflicts); 409 = head changed.
      return NextResponse.json(
        { error: d?.message || `Merge failed (${res.status}). Make sure the build passed.` },
        { status: res.status === 405 || res.status === 409 ? 409 : 502 },
      );
    }
    return NextResponse.json({ ok: true, merged: Boolean(d?.merged), message: "Merged — FLOW will deploy from main shortly." });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Merge failed." }, { status: 500 });
  }
}
