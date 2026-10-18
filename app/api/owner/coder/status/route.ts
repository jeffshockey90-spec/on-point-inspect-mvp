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

  // Turn a raw GitHub step name into something Jeff can read at a glance.
  const friendlyStep = (name: string): string => {
    const n = String(name || "").toLowerCase();
    if (n.includes("claude implements")) return "✍️ Claude is writing the change";
    if (n.includes("verify")) return "🧪 Running the build + tests";
    if (n.includes("pull request")) return "📬 Opening your change to review";
    if (n.includes("validate")) return "🔎 Reading the task";
    if (n.includes("checkout")) return "📥 Getting the code";
    if (n.includes("set up") || n.includes("set up job")) return "⚙️ Starting up";
    if (n.includes("complete") || n.includes("post ")) return "✅ Finishing up";
    return name ? `⏳ ${name}` : "⏳ Working";
  };

  try {
    // Recent workflow runs with the step each one is currently on, so Jeff sees
    // what the agent is actually doing (and can stop one that's in-flight).
    let runs: any[] = [];
    try {
      const runsRes = await gh(`/repos/${repo}/actions/workflows/claude-task.yml/runs?per_page=6`);
      if (runsRes.ok) {
        const d = await runsRes.json();
        const list = (d.workflow_runs || []).slice(0, 6);
        for (const r of list) {
          let step = "";
          try {
            // eslint-disable-next-line no-await-in-loop
            const jr = await gh(`/repos/${repo}/actions/runs/${r.id}/jobs`);
            if (jr.ok) {
              const jd = await jr.json();
              const steps = jd.jobs?.[0]?.steps || [];
              const inProgress = steps.find((s: any) => s.status === "in_progress");
              const lastDone = [...steps].reverse().find((s: any) => s.status === "completed");
              step = (inProgress || lastDone)?.name || "";
            }
          } catch {
            /* leave step blank */
          }
          const active = r.status === "in_progress" || r.status === "queued";
          runs.push({
            id: r.id,
            status: r.status,
            conclusion: r.conclusion,
            created_at: r.created_at,
            url: r.html_url,
            title: r.display_title,
            step: friendlyStep(step),
            active,
            failed: r.status === "completed" && r.conclusion !== "success",
          });
        }
      }
    } catch {
      /* non-fatal */
    }

    const prsRes = await gh(`/repos/${repo}/pulls?state=all&per_page=20&sort=created&direction=desc`);
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

    return NextResponse.json({ configured: true, repo, runs, prs, reviews });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not load status." }, { status: 500 });
  }
}
