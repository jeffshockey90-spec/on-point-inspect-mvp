"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = { id: string; author: "jarvis" | "owner" | "claude" | "gpt" | "system"; body: string; meta: any; created_at: string };
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
  gpt: { name: "ChatGPT", icon: "💡", ring: "from-emerald-300 via-green-500 to-teal-600", chip: "text-[var(--fl-good-text)]" },
};

function fmt(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Dot({ on }: { on: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {on && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${on ? "bg-emerald-400" : "bg-[var(--fl-faint)]"}`} />
    </span>
  );
}

function Presence({ p }: { p: any }) {
  if (!p) return null;
  const claudeLabel = p.claude?.online ? (p.claude?.cloud ? "Online · cloud" : "Online · watching") : "Offline";
  const chip = "inline-flex items-center gap-1.5 rounded-full border border-[var(--fl-line)] bg-[var(--fl-ground)] px-2.5 py-1 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={chip}><Dot on={!!p.jarvis?.online} /> 🤖 Jarvis <span className="text-[var(--fl-faint)]">Online</span></span>
      <span className={chip}><Dot on={!!p.gpt?.online} /> 💡 GPT <span className="text-[var(--fl-faint)]">Online</span></span>
      <span className={chip}><Dot on={!!p.claude?.online} /> ⚡ Claude <span className="text-[var(--fl-faint)]">{claudeLabel}</span></span>
    </div>
  );
}

function Attachments({ atts }: { atts: any[] }) {
  if (!atts?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {atts.map((a, i) =>
        String(a?.type || "").startsWith("image/") ? (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block">
            <img src={a.url} alt={a.name || "image"} className="max-h-56 rounded-lg border border-[var(--fl-line)]" />
          </a>
        ) : (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--fl-accent-text)] hover:border-teal-400">
            📎 {a.name || "file"}
          </a>
        ),
      )}
    </div>
  );
}

export default function JarvisThreads() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [presence, setPresence] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [thinkingId, setThinkingId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Keep the open thread pinned to the newest message.
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [threads, openId, thinkingId]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/jarvis/threads", { cache: "no-store" });
      const data = await res.json().catch(() => ({}) as any);
      if (Array.isArray(data.threads)) setThreads(data.threads);
      if (data.presence) setPresence(data.presence);
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

  async function uploadFiles(list: File[]) {
    const attachments: any[] = [];
    for (const f of list) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/owner/jarvis/upload", { method: "POST", body: fd });
        const d = await res.json().catch(() => ({}) as any);
        if (d.url) attachments.push({ url: d.url, name: d.name, type: d.type });
      } catch { /* skip a failed file */ }
    }
    return attachments;
  }

  async function reply(t: Thread) {
    const text = draft.trim();
    if ((!text && files.length === 0) || busy) return;
    setThinkingId(t.id);
    const toUpload = files;
    setFiles([]);
    setDraft("");
    const attachments = toUpload.length ? await uploadFiles(toUpload) : [];
    // Show my message instantly (optimistic), then let the request bring back
    // the canonical thread + the teammates' auto-replies.
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      author: "owner",
      body: text || "(shared a file)",
      meta: attachments.length ? { attachments } : null,
      created_at: new Date().toISOString(),
    };
    setThreads((prev) => prev.map((x) => (x.id === t.id ? { ...x, messages: [...x.messages, optimistic] } : x)));
    await post({ action: "reply", thread_id: t.id, body: text, meta: attachments.length ? { attachments } : undefined });
    setThinkingId(null);
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

      <div className="mt-3"><Presence p={presence} /></div>

      {composing && (
        <div className="mt-4 space-y-2 rounded-2xl border border-teal-500/30 bg-[var(--fl-ground)] p-4">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createThread(); } }} placeholder="What's this about?" className={inputCls} />
          <textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); createThread(); } }} rows={3} placeholder="Describe it…  (Enter to open, Shift+Enter for a new line)" className={inputCls} />
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
                    <div ref={scrollerRef} className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                      {t.messages.map((m) => {
                        if (m.author === "system") {
                          return (
                            <div key={m.id} className="my-1 text-center">
                              <span className="inline-block rounded-full border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-3 py-1 text-xs text-[var(--fl-muted)]">{m.body}</span>
                            </div>
                          );
                        }
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
                              <Attachments atts={m.meta?.attachments || []} />
                              {m.meta?.commit && (
                                <p className="mt-1 text-xs text-[var(--fl-faint)]">commit <code className="rounded bg-[var(--fl-surface-2)] px-1">{String(m.meta.commit).slice(0, 12)}</code>{m.meta.url ? <> · <a href={m.meta.url} className="text-[var(--fl-accent-text)] underline decoration-dotted">view</a></> : null}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {thinkingId === t.id && (
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-300 via-teal-500 to-cyan-700 text-xs">🤖</span>
                          <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-teal-500/20 bg-[var(--fl-ground)] px-3 py-2 text-xs text-[var(--fl-muted)]">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400" />
                            <span className="ml-1">Jarvis is replying…</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Owner reply + status */}
                    <div className="mt-3 space-y-2 border-t border-[var(--fl-raised)] pt-3">
                      <textarea
                        value={openId === t.id ? draft : ""}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); reply(t); }
                        }}
                        rows={2}
                        placeholder="Reply…  (Enter to send, Shift+Enter for a new line)"
                        className={inputCls}
                      />
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        hidden
                        onChange={(e) => { setFiles(Array.from(e.target.files || [])); if (e.target) e.target.value = ""; }}
                      />
                      {files.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {files.map((f, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-teal-400/40 bg-teal-500/10 px-2.5 py-1 text-xs text-[var(--fl-text)]">
                              📎 {f.name}
                              <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-[var(--fl-faint)] hover:text-[var(--fl-crit-text)]">✕</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => reply(t)} disabled={busy || (!draft.trim() && files.length === 0)} className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60">
                            Reply
                          </button>
                          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} title="Attach files or images" className="rounded-xl border border-[var(--fl-line)] px-3 py-2 text-sm font-semibold text-[var(--fl-muted)] hover:border-teal-400 hover:text-[var(--fl-text)] disabled:opacity-60">
                            📎
                          </button>
                          <button type="button" onClick={() => post({ action: "jarvis_reply", thread_id: t.id })} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-teal-400/50 bg-teal-500/10 px-3 py-2 text-sm font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/20 disabled:opacity-60">
                            🤖 Ask Jarvis
                          </button>
                          <button type="button" onClick={() => post({ action: "gpt_reply", thread_id: t.id })} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-[var(--fl-good-text)] hover:bg-emerald-500/20 disabled:opacity-60">
                            💡 Ask GPT
                          </button>
                          <button type="button" onClick={() => post({ action: "claude_reply", thread_id: t.id })} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-400/50 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-[var(--fl-purple-text)] hover:bg-violet-500/20 disabled:opacity-60">
                            ⚡ Ask Claude
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
