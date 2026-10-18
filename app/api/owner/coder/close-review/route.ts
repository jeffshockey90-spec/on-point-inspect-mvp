import { NextResponse } from "next/server";
import { requireOwnerUser, coderRepo, coderConfigured, gh } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Closes a coder PR (and deletes its branch). Two uses: auto-closing a review's
// report PR once its findings are in the chat, and declining ("Deny") a code
// change Jeff doesn't want. Safe: only ever closes an OPEN PR on a claude/*
// branch, never anything on main.
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
    const pr = await (await gh(`/repos/${repo}/pulls/${n}`)).json();
    const branch = String(pr?.head?.ref || "");
    // Guard: only an open, agent-created branch. Never a merged PR or anything
    // not on a claude/* branch.
    if (pr?.state !== "open" || !branch.startsWith("claude/")) {
      return NextResponse.json({ ok: false });
    }

    await gh(`/repos/${repo}/pulls/${n}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed" }),
    });
    await gh(`/repos/${repo}/git/refs/heads/${branch}`, { method: "DELETE" }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message });
  }
}
