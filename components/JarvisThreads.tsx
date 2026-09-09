"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = { id: string; author: "jarvis" | "owner" | "claude"; body: string; meta: any; created_at: string };
type Thread = {
  id: string;
  title: string;
  status: "open" | "in_progress" | "shipped" | "closed";
  severity: string;
  origin: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
};

const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", shipped: "Shipped", closed: "Closed" };
const STATUS_CLS: Record<string, string> = {
  open: "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]",
  in_progress: "border-blue-500/40 bg-blue-500/10 text-[var(--fl-info-text)]",
  shipped: "border-green-500/40 bg-green-500/10 text-[var(--fl-good-text)]",
  closed: "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]",
};
const AUTHOR: Record<string, { name: string; icon: string; ring: string; chip: string }> = {
  jarvis: { name: "Jarvis", icon: "🤖", ring: "from-teal-300 via-teal-500 to-cyan-700", chip: "text-[var(--fl-accent-text)]" },
  owner: { name: "You", icon: "👤", ring: "from-slate-400 to-slate-600", chip: "text-[var(--fl-text)]" },
  claude: { name: "Claude", icon: "⚡", ring: "from-violet-400 via-purple-500 to-fuchsia-600", chip: "text-[var(--fl-purple-text)]" },
};

function fmt(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function JarvisThreads() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/jarvis/threads", { cache: "no-store" });
      const data = await res.json().catch(() => ({}) as any);
      if (Array.isArray(data.threads)) setThreads(data.threads);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 15000); // poll so new Jarvis/Claude posts appear
    return () => window.clearInterval(id);
  }, [load]);

  async function post(payload: any) {
    setBusy(true);
    try {
      const res = await fetch("/api/owner/jarvis/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}) as any);
      await load();
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function reply(t: Thread) {
    if (!draft.trim()) return;
    await post({ action: "reply", thread_id: t.id, body: draft });
    setDraft("");
  }

  async function createThread() {
    if (!newTitle.trim() || !newBody.trim()) return;
    const data = await post({ action: "create", title: newTitle, body: newBody, severity: "info" });
    setNewTitle("");
    setNewBody("");
    setComposing(false);
    if (data?.thread_id) setOpenId(data.thread_id);
  }

  const inputCls = "w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400";

  return (
    <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 shadow-xl sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--fl-accent-text)]">Work threads</h2>
          <p className="mt-1 text-sm text-[var(--fl-muted)]">Where the three of you work an issue — Jarvis flags it, you direct, Claude does the work. Nothing ships until you confirm.</p>
        </div>
        <button
          type="button"
          onClick={() => setComposing((v) => !v)}
          className="rounded-xl border border-teal-400 bg-teal-500/10 px-4 py-2 text-sm font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/20"
        >
          {composing ? "Cancel" : "+ New thread"}
        </button>
      </div>

      {composing && (
        <div className="mt-4 space-y-2 rounded-2xl border border-teal-500/30 bg-[var(--fl-ground)] p-4">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="What's this about?" className={inputCls} />
          <textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={3} placeholder="Describe it…" className={inputCls} />
          <button type="button" onClick={createThread} disabled={busy || !newTitle.trim() || !newBody.trim()} className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60">
            Open thread
          </button>
        </div>
      )}

      {!loaded ? (
        <div className="mt-5 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-center text-[var(--fl-muted)]">Loading…</div>
      ) : threads.length === 0 ? (
        <div className="mt-5 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-center text-[var(--fl-muted)]">
          No threads yet. Ask Jarvis to look into something and approve it, or open one yourself.
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {threads.map((t) => {
            const open = openId === t.id;
            const a = AUTHOR[t.messages[0]?.author || "jarvis"];
            return (
              <li key={t.id} className="overflow-hidden rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-ground)]">
                <button type="button" onClick={() => setOpenId(open ? null : t.id)} className="flex w-full items-center gap-3 p-4 text-left">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br ${a.ring} text-sm`}>{a.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-[var(--fl-text)]">{t.title}</span>
                    <span className="text-xs text-[var(--fl-faint)]">{t.messages.length} message{t.messages.length === 1 ? "" : "s"} · updated {fmt(t.updated_at)}</span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase ${STATUS_CLS[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                </button>

                {open && (
                  <div className="border-t border-[var(--fl-raised)] p-4">
                    <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                      {t.messages.map((m) => {
                        const au = AUTHOR[m.author] || AUTHOR.jarvis;
                        return (
                          <div key={m.id} className="flex items-start gap-2.5">
                            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br ${au.ring} text-xs`}>{au.icon}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
                                <span className={au.chip}>{au.name}</span>
                                <span className="text-[var(--fl-faint)]">{fmt(m.created_at)}</span>
                              </div>
                              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[var(--fl-text)]">{m.body}</p>
                              {m.meta?.commit && (
                                <p className="mt-1 text-xs text-[var(--fl-faint)]">commit <code className="rounded bg-[var(--fl-surface-2)] px-1">{String(m.meta.commit).slice(0, 12)}</code>{m.meta.url ? <> · <a href={m.meta.url} className="text-[var(--fl-accent-text)] underline decoration-dotted">view</a></> : null}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Owner reply + status */}
                    <div className="mt-3 space-y-2 border-t border-[var(--fl-raised)] pt-3">
                      <textarea value={openId === t.id ? draft : ""} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Reply…" className={inputCls} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => reply(t)} disabled={busy || !draft.trim()} className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60">
                            Reply
                          </button>
                          <button type="button" onClick={() => post({ action: "jarvis_reply", thread_id: t.id })} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-teal-400/50 bg-teal-500/10 px-3 py-2 text-sm font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/20 disabled:opacity-60">
                            🤖 Ask Jarvis
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(["open", "in_progress", "shipped", "closed"] as const).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => post({ action: "status", thread_id: t.id, status: s })}
                              disabled={busy || t.status === s}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-100 ${t.status === s ? STATUS_CLS[s] : "border-[var(--fl-line)] text-[var(--fl-muted)] hover:border-slate-400"}`}
                            >
                              {STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
