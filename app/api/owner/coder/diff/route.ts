import { NextResponse } from "next/server";
import { requireOwnerUser, coderRepo, coderConfigured, gh } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The changed files + patches for one PR, so the owner reviews the actual diff
// inside FLOW instead of opening GitHub.
export async function GET(req: Request) {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  if (!coderConfigured()) return NextResponse.json({ error: "Not connected." }, { status: 400 });

  const number = new URL(req.url).searchParams.get("number");
  if (!number || !/^\d+$/.test(number)) {
    return NextResponse.json({ error: "Missing PR number." }, { status: 400 });
  }

  try {
    const res = await gh(`/repos/${coderRepo()}/pulls/${number}/files?per_page=100`);
    if (!res.ok) {
      return NextResponse.json({ error: `Could not load the diff (${res.status}).` }, { status: 502 });
    }
    const raw = await res.json();
    const files = (raw || []).map((f: any) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: typeof f.patch === "string" ? f.patch.slice(0, 20000) : "",
    }));
    return NextResponse.json({ files });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load the diff." }, { status: 500 });
  }
}
