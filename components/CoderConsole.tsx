"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// In-app coding agent console. Submit a task → Claude Code (real engine, in the
// cloud) builds it on a branch and opens a PR → review the diff + build status
// here → Approve & merge. GitHub stays invisible.
type Checks = { state: string; total: number; passed: number; failed: number; pending: number };
type Pr = {
  number: number;
  title: string;
  state: string;
  merged: boolean;
  url: string;
  branch: string;
  createdAt: string;
  body: string;
  checks: Checks;
};
type Running = { id: number; status: string; created_at: string; url: string; title: string };
type DiffFile = { filename: string; status: string; additions: number; deletions: number; patch: string };

function when(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function CheckBadge({ c }: { c: Checks }) {
  const map: Record<string, { label: string; cls: string }> = {
    passed: { label: "✓ Build passed", cls: "border-emerald-500/50 bg-emerald-500/10 text-[var(--fl-good-text)]" },
    failed: { label: "✗ Build failed", cls: "border-red-500/50 bg-red-500/10 text-[var(--fl-crit-text)]" },
    pending: { label: "… Building", cls: "border-yellow-500/50 bg-yellow-500/10 text-[var(--fl-warn-text)]" },
    none: { label: "No checks", cls: "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]" },
    unknown: { label: "Checking…", cls: "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]" },
  };
  const m = map[c.state] || map.unknown;
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${m.cls}`}>{m.label}</span>;
}

function Patch({ patch }: { patch: string }) {
  if (!patch) return <p className="px-3 py-2 text-xs text-[var(--fl-muted)]">(no preview — binary or too large)</p>;
  return (
    <pre className="max-h-80 overflow-auto rounded-lg bg-[var(--fl-ground)] p-3 text-[11px] leading-5">
      {patch.split("\n").map((line, i) => {
        const add = line.startsWith("+") && !line.startsWith("+++");
        const del = line.startsWith("-") && !line.startsWith("---");
        const hunk = line.startsWith("@@");
        const cls = add
          ? "text-emerald-400"
          : del
            ? "text-red-400"
            : hunk
              ? "text-cyan-400"
              : "text-[var(--fl-muted)]";
        return (
          <div key={i} className={`whitespace-pre-wrap break-all font-mono ${cls}`}>{line || " "}</div>
        );
      })}
    </pre>
  );
}

export default function CoderConsole({ connected }: { connected: boolean }) {
  const [task, setTask] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [prs, setPrs] = useState<Pr[]>([]);
  const [running, setRunning] = useState<Running[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [diff, setDiff] = useState<Record<number, DiffFile[]>>({});
  const [diffLoading, setDiffLoading] = useState<number | null>(null);
  const [busyPr, setBusyPr] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!connected) return;
    try {
      const res = await fetch("/api/owner/coder/status", { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setPrs(Array.isArray(d.prs) ? d.prs : []);
        setRunning(Array.isArray(d.running) ? d.running : []);
      }
    } catch {
      /* keep last */
    }
  }, [connected]);

  useEffect(() => {
    load();
    timer.current = window.setInterval(load, 12000) as unknown as number;
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [load]);

  async function submit() {
    const t = task.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    setNote(null);
    try {
      const res = await fetch("/api/owner/coder/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: t }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote({ ok: false, text: d?.error || "Could not start the task." });
        return;
      }
      setNote({ ok: true, text: "On it — Claude is building this. A reviewable change will appear below in a few minutes." });
      setTask("");
      setTimeout(load, 3000);
    } catch {
      setNote({ ok: false, text: "Could not start the task." });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleDiff(n: number) {
    if (expanded === n) {
      setExpanded(null);
      return;
    }
    setExpanded(n);
    if (!diff[n]) {
      setDiffLoading(n);
      try {
        const res = await fetch(`/api/owner/coder/diff?number=${n}`, { cache: "no-store" });
        const d = await res.json().catch(() => ({}));
        if (res.ok) setDiff((prev) => ({ ...prev, [n]: d.files || [] }));
      } catch {
        /* ignore */
      } finally {
        setDiffLoading(null);
      }
    }
  }

  async function merge(n: number) {
    if (!confirm("Approve and merge this change? It will deploy to your live app.")) return;
    setBusyPr(n);
    try {
      const res = await fetch("/api/owner/coder/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: n }),
      });
      const d = await res.json().catch(() => ({}));
      alert(d?.error || d?.message || "Done.");
      await load();
    } catch {
      alert("Merge failed.");
    } finally {
      setBusyPr(null);
    }
  }

  if (!connected) {
    return (
      <section className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6">
        <h2 className="text-lg font-bold text-[var(--fl-warn-text)]">Connect the coding agent (one time)</h2>
        <p className="mt-2 text-sm text-[var(--fl-text)]">
          The agent runs the real Claude Code in the cloud and opens changes for your review. To turn it on, add these once — then everything happens here:
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-[var(--fl-muted)]">
          <li>In GitHub → repo <b>Settings → Secrets → Actions</b>, add <code className="rounded bg-[var(--fl-surface-2)] px-1">ANTHROPIC_API_KEY</code> and <code className="rounded bg-[var(--fl-surface-2)] px-1">REVIEW_BOT_TOKEN</code> (a fine-grained token that can open PRs).</li>
          <li>Create a fine-grained GitHub token for this repo (Contents + Pull requests: read/write, Actions: read) and add it to FLOW's env as <code className="rounded bg-[var(--fl-surface-2)] px-1">GITHUB_CODER_TOKEN</code> (+ <code className="rounded bg-[var(--fl-surface-2)] px-1">GITHUB_CODER_REPO</code> if not the default).</li>
          <li>On the <b>main</b> branch, add a ruleset: require the build check to pass, block force-pushes. (That, plus this page, is what guarantees nothing ships without you.)</li>
        </ol>
        <p className="mt-3 text-xs text-[var(--fl-faint)]">You create the tokens — they never pass through here. Ask Claude in a session to walk you through any step.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-xl">
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={3}
          placeholder="What should I build or fix?  e.g. “On the reports page, add a filter for unpaid add-ons” or “Fix the typo on the client portal payment screen.”"
          className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--fl-muted)]">Be specific. Claude builds it on a branch and runs the build before you see it.</p>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !task.trim()}
            className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
          >
            {submitting ? "Starting…" : "⚡ Build it"}
          </button>
        </div>
        {note && (
          <p className={`mt-2 text-sm font-semibold ${note.ok ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>{note.text}</p>
        )}
      </section>

      {running.length > 0 && (
        <section className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4">
          <p className="text-sm font-bold text-[var(--fl-info-text)]">⏳ Working now</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--fl-muted)]">
            {running.map((r) => (
              <li key={r.id}>Claude is building… <span className="text-[var(--fl-faint)]">started {when(r.created_at)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[var(--fl-text)]">Changes to review</h2>
        {prs.length === 0 ? (
          <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 text-sm text-[var(--fl-muted)]">
            No changes yet. Describe something above and Claude will bring you a reviewable diff.
          </p>
        ) : (
          prs.map((p) => (
            <div key={p.number} className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[var(--fl-text)]">{p.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--fl-muted)]">{when(p.createdAt)} · {p.branch}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {p.merged ? (
                    <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-[var(--fl-good-text)]">Merged ✓ · deploying</span>
                  ) : p.state === "closed" ? (
                    <span className="rounded-full border border-[var(--fl-line)] bg-[var(--fl-ground)] px-2.5 py-0.5 text-xs font-bold text-[var(--fl-muted)]">Closed</span>
                  ) : (
                    <CheckBadge c={p.checks} />
                  )}
                </div>
              </div>

              {p.body && (
                <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[var(--fl-ground)] p-2 text-xs text-[var(--fl-muted)]">{p.body.slice(0, 600)}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleDiff(p.number)}
                  className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-text)] hover:bg-[var(--fl-raised)] [touch-action:manipulation]"
                >
                  {expanded === p.number ? "Hide changes" : "👁 Review changes"}
                </button>
                {!p.merged && p.state === "open" && (
                  <button
                    type="button"
                    onClick={() => merge(p.number)}
                    disabled={busyPr === p.number || p.checks.state === "failed" || p.checks.state === "pending"}
                    title={p.checks.state === "passed" ? "" : "Waiting for the build to pass"}
                    className="rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-[var(--fl-good-text)] transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
                  >
                    {busyPr === p.number ? "Merging…" : "✓ Approve & merge"}
                  </button>
                )}
              </div>

              {expanded === p.number && (
                <div className="mt-3 space-y-2 border-t border-[var(--fl-line)] pt-3">
                  {diffLoading === p.number ? (
                    <p className="text-sm text-[var(--fl-muted)]">Loading the diff…</p>
                  ) : (diff[p.number] || []).length === 0 ? (
                    <p className="text-sm text-[var(--fl-muted)]">No file changes to show.</p>
                  ) : (
                    (diff[p.number] || []).map((f) => (
                      <div key={f.filename} className="rounded-lg border border-[var(--fl-line)]">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <span className="break-all font-mono text-xs font-semibold text-[var(--fl-text)]">{f.filename}</span>
                          <span className="shrink-0 text-xs">
                            <span className="text-emerald-400">+{f.additions}</span> <span className="text-red-400">-{f.deletions}</span> <span className="text-[var(--fl-faint)]">· {f.status}</span>
                          </span>
                        </div>
                        <Patch patch={f.patch} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
