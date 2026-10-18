import { NextResponse } from "next/server";
import { requireOwnerUser, coderRepo, coderConfigured, gh } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the plain-English report text a review produced, so the console can
// drop it straight into the coder chat (instead of leaving it in a PR Jeff
// can't act on). Looked up by the review's PR number.
export async function GET(req: Request) {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  if (!coderConfigured()) return NextResponse.json({ report: null });

  const n = Number(new URL(req.url).searchParams.get("number"));
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ error: "Missing PR number." }, { status: 400 });
  }

  const repo = coderRepo();
  try {
    const filesRes = await gh(`/repos/${repo}/pulls/${n}/files`);
    if (!filesRes.ok) return NextResponse.json({ report: null });
    const files = await filesRes.json();
    const rep = (files || []).find((f: any) => /^reports\/.*\.md$/.test(f.filename));
    if (!rep) return NextResponse.json({ report: null });

    const pr = await (await gh(`/repos/${repo}/pulls/${n}`)).json();
    const ref = pr?.head?.ref;
    if (!ref) return NextResponse.json({ report: null });

    const cRes = await gh(
      `/repos/${repo}/contents/${encodeURIComponent(rep.filename)}?ref=${encodeURIComponent(ref)}`,
    );
    if (!cRes.ok) return NextResponse.json({ report: null });
    const c = await cRes.json();
    const text = Buffer.from(c?.content || "", "base64").toString("utf8");
    return NextResponse.json({ report: text, file: rep.filename, number: n });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load the report." }, { status: 500 });
  }
}
