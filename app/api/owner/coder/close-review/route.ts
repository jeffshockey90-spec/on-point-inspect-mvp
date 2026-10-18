import { NextResponse } from "next/server";
import { requireOwnerUser, coderRepo, coderConfigured, gh } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Once a review's findings have been pulled into the coder chat, the report PR
// isn't needed — close it (and delete its branch) so Results stays clean and
// only ever shows real code changes to approve. Best-effort: a failure here
// never matters to Jeff, the content is already in the chat.
export async function POST(req: Request) {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  if (!coderConfigured()) return NextResponse.json({ ok: false });

  const body = await req.json().catch(() => ({}));
  const n = Number(body?.number);
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ error: "Missing PR number." }, { status: 400 });
  }

  const repo = coderRepo();
  try {
    // Only ever close a review branch — never a real code-change PR.
    const pr = await (await gh(`/repos/${repo}/pulls/${n}`)).json();
    const branch = String(pr?.head?.ref || "");
    const title = String(pr?.title || "");
    const isReview = title.startsWith("App review:") || title.startsWith("FLOW code review:");
    if (!isReview || pr?.state !== "open") return NextResponse.json({ ok: false });

    await gh(`/repos/${repo}/pulls/${n}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed" }),
    });
    if (branch.startsWith("claude/")) {
      await gh(`/repos/${repo}/git/refs/heads/${branch}`, { method: "DELETE" }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message });
  }
}
