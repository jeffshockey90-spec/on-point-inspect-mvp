import { NextResponse } from "next/server";
import { requireOwnerUser, coderRepo, coderConfigured, gh } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Everything the in-app console needs to show: tasks still running in CI, and the
// Claude PRs waiting for review with their build status. All from GitHub, so the
// owner never leaves FLOW.
export async function GET() {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  if (!coderConfigured()) return NextResponse.json({ configured: false, prs: [], running: [] });

  const repo = coderRepo();
  try {
    // In-flight workflow runs (a task dispatched but no PR yet).
    let running: any[] = [];
    try {
      const runsRes = await gh(`/repos/${repo}/actions/workflows/claude-task.yml/runs?per_page=8`);
      if (runsRes.ok) {
        const d = await runsRes.json();
        running = (d.workflow_runs || [])
          .filter((r: any) => r.status !== "completed")
          .map((r: any) => ({ id: r.id, status: r.status, created_at: r.created_at, url: r.html_url, title: r.display_title }));
      }
    } catch {
      /* non-fatal */
    }

    const prsRes = await gh(`/repos/${repo}/pulls?state=all&per_page=20&sort=created&direction=desc`);
    const prsRaw = prsRes.ok ? await prsRes.json() : [];
    const claudePrs = (prsRaw || [])
      .filter((p: any) => String(p.head?.ref || "").startsWith("claude/"))
      .slice(0, 10);

    const prs: any[] = [];
    for (const p of claudePrs) {
      let checks = { state: "unknown", total: 0, passed: 0, failed: 0, pending: 0 };
      try {
        // eslint-disable-next-line no-await-in-loop
        const cr = await gh(`/repos/${repo}/commits/${p.head.sha}/check-runs`);
        if (cr.ok) {
          const d = await cr.json();
          const list = d.check_runs || [];
          let passed = 0, failed = 0, pending = 0;
          for (const c of list) {
            if (c.status !== "completed") pending += 1;
            else if (c.conclusion === "success") passed += 1;
            else failed += 1;
          }
          checks = {
            state: failed ? "failed" : pending ? "pending" : list.length ? "passed" : "none",
            total: list.length,
            passed,
            failed,
            pending,
          };
        }
      } catch {
        /* leave unknown */
      }
      prs.push({
        number: p.number,
        title: p.title,
        state: p.state,
        merged: Boolean(p.merged_at),
        url: p.html_url,
        branch: p.head.ref,
        createdAt: p.created_at,
        body: p.body || "",
        checks,
      });
    }

    return NextResponse.json({ configured: true, repo, running, prs });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load status." }, { status: 500 });
  }
}
