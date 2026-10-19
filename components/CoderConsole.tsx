"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildChangeTask } from "../lib/coder/taskPrompt";
import { createClient } from "../utils/supabase/client";

// In-app coding agent — one conversation. Talk to Claude, attach pics/docs for it
// to see, ask it to look into things (it reads the real app and reports back in
// the chat), and when you want code changed tap "Build this". The change, its
// progress, and Approve/Deny all happen inline in the chat — no boxes below.
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
type Attachment = { url: string; name: string; type: string };
type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  docs?: { name: string }[]; // attached doc names (chips)
  docText?: string; // extracted doc text, sent to the model, not displayed
  prNumber?: number; // if set, this message renders a code-change card
};
type Pending = { taskId: string; kind: "review" | "change"; at: number };

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function isImage(type: string) {
  return /^image\//.test(type || "");
}

function CheckBadge({ c }: { c: Checks }) {
  const map: Record<string, { label: string; cls: string }> = {
    passed: { label: "✓ Checks passed", cls: "border-emerald-500/50 bg-emerald-500/10 text-[var(--fl-good-text)]" },
    failed: { label: "✗ A check failed", cls: "border-red-500/50 bg-red-500/10 text-[var(--fl-crit-text)]" },
    pending: { label: "… Checking it", cls: "border-yellow-500/50 bg-yellow-500/10 text-[var(--fl-warn-text)]" },
    none: { label: "Ready", cls: "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]" },
    unknown: { label: "Checking…", cls: "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]" },
  };
  const m = map[c?.state] || map.unknown;
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
        const cls = add ? "text-emerald-400" : del ? "text-red-400" : hunk ? "text-cyan-400" : "text-[var(--fl-muted)]";
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

// Lightweight Markdown for assistant bubbles so a detailed review reads cleanly.
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
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [prs, setPrs] = useState<Pr[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [reviews, setReviews] = useState<{ number: number; branch: string; state: string }[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const deliveringRef = useRef<Set<string>>(new Set());
  const timer = useRef<number | null>(null);
  // The conversation + pending tasks live in the DB (per owner) so a refresh,
  // a closed tab, or another device keeps the same chat. hydrated guards the
  // save effect from wiping the DB with empty state before the load lands.
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const [expandedPr, setExpandedPr] = useState<number | null>(null);
  const [diff, setDiff] = useState<Record<number, DiffFile[]>>({});
  const [diffLoading, setDiffLoading] = useState<number | null>(null);
  const [busyPr, setBusyPr] = useState<number | null>(null);

  const prByNum = useCallback((n: number) => prs.find((p) => p.number === n), [prs]);

  // Load the saved conversation once on mount.
  useEffect(() => {
    if (!connected) {
      setHydrated(true);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/owner/coder/conversation", { cache: "no-store" });
        const d = await res.json().catch(() => ({}));
        if (res.ok) {
          if (Array.isArray(d.messages)) setChat(d.messages);
          if (Array.isArray(d.pending)) setPending(d.pending);
        }
      } catch {
        /* start fresh */
      } finally {
        setHydrated(true);
      }
    })();
  }, [connected]);

  // Persist the conversation (debounced) whenever it changes.
  useEffect(() => {
    if (!hydrated || !connected) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      fetch("/api/owner/coder/conversation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chat, pending }),
      }).catch(() => {});
    }, 1000) as unknown as number;
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [chat, pending, hydrated, connected]);

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, chatBusy]);

  // When a review or change Claude launched finishes, bring it into the chat:
  // reviews deliver their findings as a message; changes drop in a change card.
  useEffect(() => {
    if (pending.length === 0) return;
    (async () => {
      for (const p of pending) {
        if (deliveringRef.current.has(p.taskId)) continue;
        if (p.kind === "review") {
          const match = reviews.find((r) => r.branch === `claude/task-${p.taskId}`);
          if (match) {
            deliveringRef.current.add(p.taskId);
            setPending((cur) => cur.filter((x) => x.taskId !== p.taskId));
            try {
              const res = await fetch(`/api/owner/coder/report?number=${match.number}`, { cache: "no-store" });
              const d = await res.json().catch(() => ({}));
              if (d?.report) {
                setChat((c) => [...c, { id: uid(), role: "assistant", content: String(d.report) }]);
                setNote({ ok: true, text: "Here's what Claude found — in the chat above. Reply to dig in, or tap Build this to have it fix something." });
                fetch("/api/owner/coder/close-review", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ number: match.number }),
                }).catch(() => {});
              }
            } catch {
              /* leave it */
            }
          } else if (Date.now() - p.at > 15 * 60 * 1000) {
            setPending((cur) => cur.filter((x) => x.taskId !== p.taskId));
            setChat((c) => [...c, { id: uid(), role: "assistant", content: "I wasn't able to finish looking into that one — mind asking me again?" }]);
          }
        } else {
          const match = prs.find((pr) => pr.branch === `claude/task-${p.taskId}`);
          if (match) {
            deliveringRef.current.add(p.taskId);
            setPending((cur) => cur.filter((x) => x.taskId !== p.taskId));
            setChat((c) => [
              ...c,
              { id: uid(), role: "assistant", content: "I'm done — here's the change I made. Take a look and approve it when you're happy:", prNumber: match.number },
            ]);
            setNote(null);
          } else if (Date.now() - p.at > 15 * 60 * 1000) {
            setPending((cur) => cur.filter((x) => x.taskId !== p.taskId));
            setChat((c) => [...c, { id: uid(), role: "assistant", content: "That change didn't go through — nothing was changed. Want me to try again?" }]);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, prs, pending]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setNote(null);
    try {
      const supabase = createClient();
      for (const file of Array.from(files).slice(0, 6)) {
        // 1) one-time signed upload URL, 2) upload straight to the private
        // bucket, 3) a signed READ url (the file now exists, so it can be signed).
        const res = await fetch("/api/owner/coder/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, type: file.type }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d?.token) {
          setNote({ ok: false, text: d?.error || "Couldn't upload that file." });
          continue;
        }
        const { error } = await supabase.storage.from("coder-attachments").uploadToSignedUrl(d.path, d.token, file);
        if (error) {
          setNote({ ok: false, text: "Couldn't upload that file." });
          continue;
        }
        const signRes = await fetch("/api/owner/coder/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: d.path }),
        });
        const signed = await signRes.json().catch(() => ({}));
        if (!signRes.ok || !signed?.url) {
          setNote({ ok: false, text: "Couldn't prepare that file." });
          continue;
        }
        setAttachments((a) => [...a, { url: signed.url, name: d.name, type: file.type }]);
      }
    } catch {
      setNote({ ok: false, text: "Couldn't upload that file." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function sendChat() {
    const text = chatInput.trim();
    if ((!text && attachments.length === 0) || chatBusy) return;
    const imgs = attachments.filter((a) => isImage(a.type)).map((a) => a.url);
    const docFiles = attachments.filter((a) => !isImage(a.type));
    setChatInput("");
    setAttachments([]);
    setChatBusy(true);
    // Read any attached PDFs/text so Claude can actually read them, not just see
    // a filename. (Images go to the vision model as-is.)
    let docText = "";
    const docNames: { name: string }[] = [];
    for (const d of docFiles) {
      docNames.push({ name: d.name });
      try {
        const r = await fetch("/api/owner/coder/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: d.url, name: d.name }),
        });
        const dd = await r.json().catch(() => ({}));
        if (dd?.text) docText += `\n\n--- Contents of ${d.name} ---\n${dd.text}`;
        else if (dd?.note) docText += `\n\n--- ${d.name}: ${dd.note} ---`;
      } catch {
        /* ignore */
      }
    }
    const userMsg: ChatMsg = {
      id: uid(),
      role: "user",
      content: text || "(see attached)",
      images: imgs.length ? imgs : undefined,
      docs: docNames.length ? docNames : undefined,
      docText: docText || undefined,
    };
    const next = [...chat, userMsg];
    setChat(next);
    try {
      const res = await fetch("/api/owner/coder/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({
            role: m.role,
            content: m.content + (m.docText ? `\n\n[Attached documents]${m.docText}` : ""),
            images: m.images,
          })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChat((c) => [...c, { id: uid(), role: "assistant", content: `⚠️ ${d?.error || "Couldn't reach the chat."}` }]);
        return;
      }
      setChat((c) => [...c, { id: uid(), role: "assistant", content: String(d.reply || "") }]);
      if (d.acted && d.taskId) {
        setPending((cur) => [...cur, { taskId: String(d.taskId), kind: "review", at: Date.now() }]);
        setNote({ ok: true, text: "On it — Claude is reading the real app now. The findings will land right here in the chat in a few minutes." });
        setTimeout(load, 3000);
      }
    } catch {
      setChat((c) => [...c, { id: uid(), role: "assistant", content: "⚠️ Couldn't reach the chat." }]);
    } finally {
      setChatBusy(false);
    }
  }

  // "Build this" — deliberately change code. Hands the conversation to the
  // builder; progress + the change land back in this chat.
  async function build() {
    if (submitting || chat.length === 0) return;
    setSubmitting(true);
    setNote(null);
    const transcript = chat
      .map((m) => `${m.role === "user" ? "Jeff" : "Claude"}: ${m.content}${m.docText ? `\n${m.docText}` : ""}`)
      .join("\n\n")
      .slice(0, 40000);
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
      if (d.taskId) setPending((cur) => [...cur, { taskId: String(d.taskId), kind: "change", at: Date.now() }]);
      setChat((c) => [...c, { id: uid(), role: "assistant", content: "On it — I'm making that change now. I'll drop it right here when it's ready for you to look at. Nothing goes live until you approve it." }]);
      setTimeout(load, 3000);
    } catch {
      setNote({ ok: false, text: "Could not start it." });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleDiff(n: number) {
    if (expandedPr === n) {
      setExpandedPr(null);
      return;
    }
    setExpandedPr(n);
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

  async function approve(n: number) {
    if (!confirm("Approve this change? It will go live on your app.")) return;
    setBusyPr(n);
    try {
      const res = await fetch("/api/owner/coder/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: n }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setChat((c) => [...c, { id: uid(), role: "assistant", content: "✅ Approved — I'm merging it and it'll be live on your app shortly." }]);
      } else {
        setChat((c) => [...c, { id: uid(), role: "assistant", content: `⚠️ ${d?.error || "Couldn't merge that."}` }]);
      }
      await load();
    } catch {
      setChat((c) => [...c, { id: uid(), role: "assistant", content: "⚠️ Couldn't merge that." }]);
    } finally {
      setBusyPr(null);
    }
  }

  async function deny(n: number) {
    if (!confirm("Discard this change? It won't be applied.")) return;
    setBusyPr(n);
    try {
      await fetch("/api/owner/coder/close-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: n }),
      });
      setChat((c) => [...c, { id: uid(), role: "assistant", content: "Okay — I've thrown that change away. Nothing was changed." }]);
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusyPr(null);
    }
  }

  async function stopBuilding() {
    const active = runs.find((r) => r.active);
    if (!active) return;
    try {
      await fetch("/api/owner/coder/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: active.id }),
      });
      setPending((cur) => cur.filter((x) => x.kind !== "change"));
      setChat((c) => [...c, { id: uid(), role: "assistant", content: "Stopped — I didn't change anything." }]);
      setTimeout(load, 1500);
    } catch {
      /* ignore */
    }
  }

  function ChangeCard({ n }: { n: number }) {
    const live = prByNum(n);
    const merged = live?.merged;
    const closed = live?.state === "closed";
    const checks = live?.checks;
    return (
      <div className="mt-2 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-bold text-[var(--fl-text)]">{live?.title || "Your change"}</p>
          {merged ? (
            <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-[var(--fl-good-text)]">Approved ✓ · going live</span>
          ) : closed ? (
            <span className="rounded-full border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-2.5 py-0.5 text-xs font-bold text-[var(--fl-muted)]">Discarded</span>
          ) : checks ? (
            <CheckBadge c={checks} />
          ) : (
            <span className="text-xs text-[var(--fl-muted)]">Preparing…</span>
          )}
        </div>

        {!merged && !closed && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => toggleDiff(n)}
              className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-text)] hover:bg-[var(--fl-raised)] [touch-action:manipulation]"
            >
              {expandedPr === n ? "Hide changes" : "👁 See what changed"}
            </button>
            <button
              type="button"
              onClick={() => approve(n)}
              disabled={busyPr === n || checks?.state === "failed" || checks?.state === "pending" || checks?.state === "unknown"}
              title={checks?.state === "passed" || checks?.state === "none" ? "Approve & go live" : "Waiting for the checks to pass"}
              className="rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-[var(--fl-good-text)] transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
            >
              {busyPr === n ? "Working…" : "✓ Approve"}
            </button>
            <button
              type="button"
              onClick={() => deny(n)}
              disabled={busyPr === n}
              className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs font-bold text-[var(--fl-crit-text)] transition hover:bg-red-500/10 disabled:opacity-50 [touch-action:manipulation]"
            >
              Deny
            </button>
          </div>
        )}

        {expandedPr === n && (
          <div className="mt-3 space-y-2 border-t border-[var(--fl-line)] pt-3">
            {diffLoading === n ? (
              <p className="text-sm text-[var(--fl-muted)]">Loading the changes…</p>
            ) : (diff[n] || []).length === 0 ? (
              <p className="text-sm text-[var(--fl-muted)]">No file changes to show.</p>
            ) : (
              (diff[n] || []).map((f) => (
                <div key={f.filename} className="rounded-lg border border-[var(--fl-line)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="break-all font-mono text-xs font-semibold text-[var(--fl-text)]">{f.filename}</span>
                    <span className="shrink-0 text-xs">
                      <span className="text-emerald-400">+{f.additions}</span> <span className="text-red-400">-{f.deletions}</span>
                    </span>
                  </div>
                  <Patch patch={f.patch} />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  if (!connected) {
    return (
      <section className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6">
        <h2 className="text-lg font-bold text-[var(--fl-warn-text)]">Connect the coding agent (one time)</h2>
        <p className="mt-2 text-sm text-[var(--fl-text)]">
          The agent runs the real Claude Code in the cloud and brings changes back to you for approval. To turn it on, add these once — then everything happens here:
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-[var(--fl-muted)]">
          <li>In GitHub → repo <b>Settings → Secrets → Actions</b>, add <code className="rounded bg-[var(--fl-surface-2)] px-1">CLAUDE_CODE_OAUTH_TOKEN</code> and <code className="rounded bg-[var(--fl-surface-2)] px-1">REVIEW_BOT_TOKEN</code>.</li>
          <li>Create a fine-grained GitHub token for this repo (Contents + Pull requests: read/write, Actions: read) and add it to FLOW's env as <code className="rounded bg-[var(--fl-surface-2)] px-1">GITHUB_CODER_TOKEN</code>.</li>
          <li>On the <b>main</b> branch, add a ruleset: require the build check to pass, block force-pushes.</li>
        </ol>
        <p className="mt-3 text-xs text-[var(--fl-faint)]">You create the tokens — they never pass through here.</p>
      </section>
    );
  }

  const building = pending.some((p) => p.kind === "change");
  const looking = pending.some((p) => p.kind === "review");

  return (
    <section className="flex h-[calc(100vh-180px)] min-h-[520px] flex-col rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--fl-line)] px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-[var(--fl-text)]">Claude Coder</h2>
          <p className="text-xs text-[var(--fl-muted)]">Talk to it like you would me. Attach pics or docs, ask it to look into things, or tap Build this to change code.</p>
        </div>
        {chat.length > 0 && (
          <button
            type="button"
            onClick={() => setChat([])}
            className="shrink-0 text-xs font-semibold text-[var(--fl-muted)] underline hover:text-[var(--fl-text)]"
          >
            New chat
          </button>
        )}
      </div>

      {/* Conversation */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {chat.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-[var(--fl-muted)]">
            <p>Start a conversation. For example:</p>
            <p className="mt-2 italic">“Here's a screenshot of a glitch on the report page — what's going on?”</p>
            <p className="mt-1 italic">“Check that all the buttons in the client portal work.”</p>
            <p className="mt-1 italic">“Add a filter on the reports page for jobs with unpaid add-ons.”</p>
          </div>
        ) : (
          chat.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] break-words rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "whitespace-pre-wrap rounded-br-sm bg-teal-500/15 text-[var(--fl-text)]"
                    : "rounded-bl-sm border border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-text)]"
                }`}
              >
                {m.images && m.images.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {m.images.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="attachment" className="h-28 w-28 rounded-lg object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                {m.docs && m.docs.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {m.docs.map((d, i) => (
                      <span key={i} className="rounded border border-[var(--fl-line)] bg-[var(--fl-ground)] px-2 py-0.5 text-xs text-[var(--fl-muted)]">
                        📄 {d.name}
                      </span>
                    ))}
                  </div>
                )}
                {m.role === "user" ? m.content : <MdLite text={m.content} />}
                {typeof m.prNumber === "number" && <ChangeCard n={m.prNumber} />}
              </div>
            </div>
          ))
        )}
        {chatBusy && <p className="px-1 text-xs text-[var(--fl-muted)]">Claude is thinking…</p>}
        {looking && (
          <p className="flex items-center gap-2 px-1 text-xs text-[var(--fl-info-text)]">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
            Claude is reading the app — findings will land here in a few minutes…
          </p>
        )}
        {building && (
          <p className="flex flex-wrap items-center gap-2 px-1 text-xs text-[var(--fl-info-text)]">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
            Claude is building your change — it'll appear here when ready…
            {runs.some((r) => r.active) && (
              <button type="button" onClick={stopBuilding} className="rounded border border-red-500/50 px-2 py-0.5 font-bold text-[var(--fl-crit-text)] hover:bg-red-500/10 [touch-action:manipulation]">
                ■ Stop
              </button>
            )}
          </p>
        )}
        <div ref={chatEndRef} />
      </div>

      {note && (
        <p className={`px-4 text-xs font-semibold ${note.ok ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>{note.text}</p>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-2">
          {attachments.map((a, i) => (
            <span key={a.url} className="flex items-center gap-1.5 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] py-1 pl-1 pr-2 text-xs">
              {isImage(a.type) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.name} className="h-8 w-8 rounded object-cover" />
              ) : (
                <span className="px-1">📄</span>
              )}
              <span className="max-w-[140px] truncate text-[var(--fl-muted)]">{a.name}</span>
              <button type="button" onClick={() => setAttachments((cur) => cur.filter((_, j) => j !== i))} className="font-bold text-[var(--fl-muted)] hover:text-[var(--fl-text)]">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-[var(--fl-line)] p-3">
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.doc,.docx,.txt"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Attach a pic or doc"
            className="shrink-0 rounded-xl border border-[var(--fl-line)] px-3 py-3 text-base text-[var(--fl-text)] hover:bg-[var(--fl-raised)] disabled:opacity-50 [touch-action:manipulation]"
          >
            {uploading ? "…" : "📎"}
          </button>
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendChat();
              }
            }}
            rows={2}
            placeholder="Tell Claude what you want…  (Enter to send, Shift+Enter for a new line)"
            className="flex-1 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
          />
          <button
            type="button"
            onClick={sendChat}
            disabled={chatBusy || (!chatInput.trim() && attachments.length === 0)}
            className="shrink-0 rounded-xl border border-[var(--fl-line)] px-4 py-3 text-sm font-semibold text-[var(--fl-text)] hover:bg-[var(--fl-raised)] disabled:opacity-50 [touch-action:manipulation]"
          >
            Send
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-[var(--fl-muted)]">Looking into things happens right in the chat. Tap Build this only to change code.</p>
          <button
            type="button"
            onClick={build}
            disabled={submitting || chat.length === 0}
            title={chat.length === 0 ? "Tell Claude what you want changed first" : "Have Claude actually change the code"}
            className="shrink-0 rounded-xl bg-teal-500 px-5 py-2 text-sm font-bold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
          >
            {submitting ? "Starting…" : "⚡ Build this"}
          </button>
        </div>
      </div>
    </section>
  );
}
