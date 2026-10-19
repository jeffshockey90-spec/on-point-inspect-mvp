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
  if (!coderConfigured()) return NextResponse.json({ configured: false, prs: [], runs: [] });

  const repo = coderRepo();

  try {
    // Recent workflow runs — ONE call, no per-run job lookups. (The UI only needs
    // whether a run is active/failed and when it started, not the live step, so
    // we skip the per-run /jobs calls that used to multiply API usage ~6x.)
    let runs: any[] = [];
    try {
      const runsRes = await gh(`/repos/${repo}/actions/workflows/claude-task.yml/runs?per_page=5`);
      if (runsRes.ok) {
        const d = await runsRes.json();
        runs = (d.workflow_runs || []).slice(0, 5).map((r: any) => {
          const active = r.status === "in_progress" || r.status === "queued";
          return {
            id: r.id,
            status: r.status,
            conclusion: r.conclusion,
            created_at: r.created_at,
            url: r.html_url,
            title: r.display_title,
            step: active ? "⚙️ Working" : "",
            active,
            failed: r.status === "completed" && r.conclusion !== "success",
          };
        });
      }
    } catch {
      /* non-fatal */
    }

    const prsRes = await gh(`/repos/${repo}/pulls?state=all&per_page=15&sort=created&direction=desc`);
    const prsRaw = prsRes.ok ? await prsRes.json() : [];
    // Results only shows real code changes to approve. Reviews are delivered into
    // the chat (and their report PRs auto-closed), so keep them out of this list.
    const isReviewPr = (p: any) => {
      const t = String(p.title || "");
      return t.startsWith("App review:") || t.startsWith("FLOW code review:");
    };
    const claudePrs = (prsRaw || [])
      .filter((p: any) => String(p.head?.ref || "").startsWith("claude/") && !isReviewPr(p))
      .slice(0, 10);

    // Review PRs, kept out of Results but surfaced here so the chat can pull a
    // finished review's findings into the conversation and then close it.
    const reviews = (prsRaw || [])
      .filter((p: any) => String(p.head?.ref || "").startsWith("claude/") && isReviewPr(p))
      .slice(0, 15)
      .map((p: any) => ({ number: p.number, branch: p.head.ref, state: p.state }));

    const prs: any[] = [];
    for (const p of claudePrs) {
      let checks = { state: "none", total: 0, passed: 0, failed: 0, pending: 0 };
      // Only spend an API call on the build status of a change that's actually
      // waiting for approval (open + not merged). Merged/closed cards show their
      // own state and don't need checks — this keeps per-poll API usage tiny.
      const needsChecks = p.state === "open" && !p.merged_at;
      try {
        // eslint-disable-next-line no-await-in-loop
        const cr = needsChecks ? await gh(`/repos/${repo}/commits/${p.head.sha}/check-runs`) : null;
        if (cr && cr.ok) {
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

    return NextResponse.json({ configured: true, repo, runs, prs, reviews });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load status." }, { status: 500 });
  }
}
