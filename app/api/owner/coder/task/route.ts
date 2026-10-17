import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireOwnerUser, coderRepo, coderConfigured, gh } from "../../../../../lib/coder/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner submits a coding task in FLOW → fire a GitHub repository_dispatch so the
// real Claude Code runs in the cloud on a fresh branch and opens a PR.
export async function POST(req: Request) {
  const owner = await requireOwnerUser();
  if (!owner) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  if (!coderConfigured()) {
    return NextResponse.json(
      { error: "The coding agent isn't connected yet. Add GITHUB_CODER_TOKEN (and the GitHub Action secrets) to turn it on." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const task = String(body?.task || "").trim();
  if (!task) return NextResponse.json({ error: "Describe what to build or fix." }, { status: 400 });
  if (task.length > 8000) return NextResponse.json({ error: "Task is too long (8000 character max)." }, { status: 400 });

  const taskId = randomUUID();
  try {
    const res = await gh(`/repos/${coderRepo()}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ event_type: "claude-task", client_payload: { task_id: taskId, task } }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Could not start the task (${res.status}). ${t.slice(0, 200)}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, taskId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not start the task." }, { status: 500 });
  }
}
