"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildChangeTask } from "../lib/coder/taskPrompt";

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
type Run = {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  url: string;
  title: string;
  step: string;
  active: boolean;
  failed: boolean;
};
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

// Inline **bold** and `code` inside a chat line.
function fmtInline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={`${keyBase}-${i}`}>{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p))
      return (
        <code key={`${keyBase}-${i}`} className="rounded bg-[var(--fl-ground)] px-1 py-0.5 text-[0.85em]">
          {p.slice(1, -1)}
        </code>
      );
    return <span key={`${keyBase}-${i}`}>{p}</span>;
  });
}

// Lightweight Markdown for assistant bubbles so a detailed review reads cleanly
// (headings, bullets, bold, dividers) without pulling in a renderer library.
function MdLite({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  return (
    <div className="space-y-1.5 break-words">
      {lines.map((ln, i) => {
        if (/^#{1,6}\s/.test(ln))
          return (
            <p key={i} className="mt-1 font-bold text-[var(--fl-text)]">
              {fmtInline(ln.replace(/^#{1,6}\s/, ""), `h${i}`)}
            </p>
          );
        if (/^\s*[-*]\s/.test(ln))
          return (
            <p key={i} className="flex gap-1.5 pl-1">
              <span className="text-[var(--fl-muted)]">•</span>
              <span>{fmtInline(ln.replace(/^\s*[-*]\s/, ""), `li${i}`)}</span>
            </p>
          );
        if (/^---+$/.test(ln.trim())) return <hr key={i} className="my-2 border-[var(--fl-line)]" />;
        if (ln.trim() === "") return <div key={i} className="h-1.5" />;
        return <p key={i}>{fmtInline(ln, `p${i}`)}</p>;
      })}
    </div>
  );
}

export default function CoderConsole({ connected }: { connected: boolean }) {
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Conversational planning: talk with Claude in plain language before building.
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [prs, setPrs] = useState<Pr[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [stoppingId, setStoppingId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [diff, setDiff] = useState<Record<number, DiffFile[]>>({});
  const [diffLoading, setDiffLoading] = useState<number | null>(null);
  const [busyPr, setBusyPr] = useState<number | null>(null);
  // Reviews Claude is running for the chat, and the ones we've already delivered
  // into the conversation (guard against double-delivery across status polls).
  const [reviews, setReviews] = useState<{ number: number; branch: string; state: string }[]>([]);
  const [pendingReviews, setPendingReviews] = useState<{ taskId: string; at: number }[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem("coder_pending_reviews") || "[]");
    } catch {
      return [];
    }
  });
  const deliveringRef = useRef<Set<string>>(new Set());
  const timer = useRef<number | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("coder_pending_reviews", JSON.stringify(pendingReviews));
    } catch {
      /* ignore */
    }
  }, [pendingReviews]);

  const load = useCallback(async () => {
    if (!connected) return;
    try {
      const res = await fetch("/api/owner/coder/status", { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setPrs(Array.isArray(d.prs) ? d.prs : []);
        setRuns(Array.isArray(d.runs) ? d.runs : []);
        setReviews(Array.isArray(d.reviews) ? d.reviews : []);
      }
    } catch {
      /* keep last */
    }
  }, [connected]);

  useEffect(() => {
    load();
    timer.current = window.setInterval(load, 8000) as unknown as number;
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [load]);

  async function stopRun(id: number) {
    if (!confirm("Stop this task? It won't open a change.")) return;
    setStoppingId(id);
    try {
      const res = await fetch("/api/owner/coder/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) alert(d?.error || "Could not stop it.");
      setTimeout(load, 1500);
    } catch {
      alert("Could not stop it.");
    } finally {
      setStoppingId(null);
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, chatBusy]);

  // When a review Claude launched from the chat finishes, pull its findings
  // straight into the conversation (not a dead report), then close the report PR
  // so Results stays clean. A review that never produces one is given up on after
  // 15 minutes so it doesn't hang forever.
  useEffect(() => {
    if (pendingReviews.length === 0) return;
    (async () => {
      for (const pend of pendingReviews) {
        if (deliveringRef.current.has(pend.taskId)) continue;
        const match = reviews.find((r) => r.branch === `claude/task-${pend.taskId}`);
        if (match) {
          deliveringRef.current.add(pend.taskId);
          setPendingReviews((cur) => cur.filter((x) => x.taskId !== pend.taskId));
          try {
            const res = await fetch(`/api/owner/coder/report?number=${match.number}`, { cache: "no-store" });
            const d = await res.json().catch(() => ({}));
            if (d?.report) {
              setChat((c) => [...c, { role: "assistant", content: String(d.report) }]);
              setNote({ ok: true, text: "Here's what Claude found — it's in the chat above. Reply to keep working on it, or tap Build this to have it make a fix." });
              // The content now lives in the chat; retire the report PR.
              fetch("/api/owner/coder/close-review", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ number: match.number }),
              }).catch(() => {});
            }
          } catch {
            /* leave it; the PR still exists if needed */
          }
        } else if (Date.now() - pend.at > 15 * 60 * 1000) {
          setPendingReviews((cur) => cur.filter((x) => x.taskId !== pend.taskId));
          setChat((c) => [
            ...c,
            { role: "assistant", content: "I wasn't able to finish looking into that one — mind asking me again?" },
          ]);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, pendingReviews]);

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const next = [...chat, { role: "user" as const, content: text }];
    setChat(next);
    setChatInput("");
    setChatBusy(true);
    try {
      const res = await fetch("/api/owner/coder/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChat((c) => [...c, { role: "assistant", content: `⚠️ ${d?.error || "Couldn't reach the chat."}` }]);
        return;
      }
      setChat((c) => [...c, { role: "assistant", content: String(d.reply || "") }]);
      // The chat went to look at the real app. Track the review so we can drop
      // its findings right back into this conversation when it finishes.
      if (d.acted && d.taskId) {
        setPendingReviews((cur) => [...cur, { taskId: String(d.taskId), at: Date.now() }]);
        setNote({ ok: true, text: "On it — Claude is reading the real app now. I'll drop what it finds right here in the chat in a few minutes." });
        setTimeout(load, 3000);
      }
    } catch {
      setChat((c) => [...c, { role: "assistant", content: "⚠️ Couldn't reach the chat." }]);
    } finally {
      setChatBusy(false);
    }
  }

  // "Build this" — the deliberate "actually change the code" action. Hands the
  // whole conversation to the builder, which makes the change on a branch for
  // Jeff to approve. (Looking into things happens in the chat itself, no button.)
  async function submit() {
    if (submitting || chat.length === 0) return;
    setSubmitting(true);
    setNote(null);
    const transcript = chat
      .map((m) => `${m.role === "user" ? "Jeff" : "Claude"}: ${m.content}`)
      .join("\n\n")
      .slice(0, 7000);
    try {
      const res = await fetch("/api/owner/coder/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: buildChangeTask(transcript) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote({ ok: false, text: d?.error || "Could not start it." });
        return;
      }
      setNote({ ok: true, text: "On it — Claude is making that change now. It'll show up below for you to approve in a few minutes. Nothing goes live until you do." });
      setTimeout(load, 3000);
    } catch {
      setNote({ ok: false, text: "Could not start it." });
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--fl-text)]">Talk it through</h2>
          {chat.length > 0 && (
            <button
              type="button"
              onClick={() => setChat([])}
              className="text-xs font-semibold text-[var(--fl-muted)] underline hover:text-[var(--fl-text)]"
            >
              New chat
            </button>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--fl-muted)]">
          Talk to Claude like you would in a chat. Ask it to look into or check something and it'll go read the real app and report back below — no button needed. When you actually want it to <b>change the code</b>, tap <b>Build this</b>.
        </p>

        <div className="mt-3 max-h-80 space-y-3 overflow-y-auto rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3">
          {chat.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-[var(--fl-muted)]">
              e.g. “On the reports page I want a filter for jobs with unpaid add-ons.”  or  “Something feels off on the client portal payment screen — can we look at it?”
            </p>
          ) : (
            chat.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] break-words rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "whitespace-pre-wrap rounded-br-sm bg-teal-500/15 text-[var(--fl-text)]"
                      : "rounded-bl-sm border border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-text)]"
                  }`}
                >
                  {m.role === "user" ? m.content : <MdLite text={m.content} />}
                </div>
              </div>
            ))
          )}
          {chatBusy && <p className="px-1 text-xs text-[var(--fl-muted)]">Claude is thinking…</p>}
          {pendingReviews.length > 0 && (
            <p className="flex items-center gap-2 px-1 text-xs text-[var(--fl-info-text)]">
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              Claude is reading the app — the findings will land here in a few minutes…
            </p>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
            }}
            rows={2}
            placeholder="Tell Claude what you want…  (Enter to send, Shift+Enter for a new line)"
            className="flex-1 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
          />
          <button
            type="button"
            onClick={sendChat}
            disabled={chatBusy || !chatInput.trim()}
            className="rounded-xl border border-[var(--fl-line)] px-4 py-3 text-sm font-semibold text-[var(--fl-text)] hover:bg-[var(--fl-raised)] disabled:opacity-50 [touch-action:manipulation]"
          >
            Send
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--fl-muted)]">Only tap Build this when you want the code actually changed. Claude works in a safe copy and checks everything first — nothing goes live until you approve.</p>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || chat.length === 0}
            title={chat.length === 0 ? "Tell Claude what you want changed first" : "Have Claude actually change the code"}
            className="rounded-xl bg-teal-500 px-6 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
          >
            {submitting ? "Starting…" : "⚡ Build this"}
          </button>
        </div>
        {note && (
          <p className={`mt-2 text-sm font-semibold ${note.ok ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>{note.text}</p>
        )}
      </section>

      {runs.some((r) => r.active) && (
        <section className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4">
          <p className="text-sm font-bold text-[var(--fl-info-text)]">Working now</p>
          <ul className="mt-2 space-y-2">
            {runs.filter((r) => r.active).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--fl-text)]">
                    <span className="inline-flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-cyan-400" />
                    {r.step || "⏳ Working"}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--fl-muted)]">
                    {r.status === "queued" ? "queued" : "running"} · started {when(r.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => stopRun(r.id)}
                  disabled={stoppingId === r.id}
                  className="shrink-0 rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-[var(--fl-crit-text)] transition hover:bg-red-500/20 disabled:opacity-50 [touch-action:manipulation]"
                >
                  {stoppingId === r.id ? "Stopping…" : "■ Stop"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {runs.some((r) => r.failed) && !runs.some((r) => r.active) && (
        <section className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
          <p className="text-sm font-bold text-[var(--fl-crit-text)]">A recent run didn't finish</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--fl-muted)]">
            {runs.filter((r) => r.failed).slice(0, 3).map((r) => (
              <li key={r.id}>
                ❌ {r.conclusion === "cancelled" ? "Stopped" : "Failed"} at {r.step} <span className="text-[var(--fl-faint)]">· {when(r.created_at)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--fl-muted)]">Nothing was changed. Try again, or tell me and I'll check the logs.</p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[var(--fl-text)]">Changes to approve</h2>
        {prs.length === 0 ? (
          <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 text-sm text-[var(--fl-muted)]">
            Nothing to approve yet. When you tap <b>Build this</b>, the code change shows up here for you to review. (Things you ask Claude to look into come back in the chat above, not here.)
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
