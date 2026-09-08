"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type ConvoMessage = {
  id: string;
  direction: "in" | "out";
  body: string;
  subject: string | null;
  at: string | null;
  isRead: boolean;
};

export type Thread = {
  key: string;
  email: string;
  name: string | null;
  unread: number;
  lastAt: string | null;
  lastSnippet: string;
  lastDirection: "in" | "out";
  inspectionId: string | null;
  matchedName: string | null;
  latestInboundId: string | null;
  messages: ConvoMessage[];
};

function fmt(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtShort(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(name: string | null, email: string) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

const inputCls =
  "w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] px-3 py-2.5 text-[var(--fl-text)] outline-none focus:border-teal-400";

export default function Conversations({ threads }: { threads: Thread[] }) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Reply-in-thread state
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Compose state
  const [toField, setToField] = useState("");
  const [subjectField, setSubjectField] = useState("");
  const [composeBody, setComposeBody] = useState("");

  const totalUnread = useMemo(() => threads.reduce((n, t) => n + (t.unread > 0 ? 1 : 0), 0), [threads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (unreadOnly && t.unread === 0) return false;
      if (!q) return true;
      return (
        t.email.toLowerCase().includes(q) ||
        (t.name || "").toLowerCase().includes(q) ||
        (t.matchedName || "").toLowerCase().includes(q) ||
        t.lastSnippet.toLowerCase().includes(q)
      );
    });
  }, [threads, search, unreadOnly]);

  const selected = useMemo(
    () => (selectedKey ? threads.find((t) => t.key === selectedKey) || null : null),
    [threads, selectedKey],
  );

  async function post(payload: any) {
    const res = await fetch("/api/owner/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json().catch(() => ({}) as any);
  }

  async function selectThread(t: Thread) {
    setSelectedKey(t.key);
    setComposing(false);
    setDraft("");
    setMsg(null);
    if (t.unread > 0) {
      await post({ action: "read-thread", email: t.email });
      router.refresh();
    }
  }

  function startCompose() {
    setComposing(true);
    setSelectedKey(null);
    setToField("");
    setSubjectField("");
    setComposeBody("");
    setMsg(null);
  }

  function backToList() {
    setSelectedKey(null);
    setComposing(false);
    setMsg(null);
  }

  async function markUnread(t: Thread) {
    if (!t.latestInboundId) return;
    setBusy(true);
    await post({ action: "unread", id: t.latestInboundId });
    setBusy(false);
    setSelectedKey(null);
    router.refresh();
  }

  async function sendReply(t: Thread) {
    if (!draft.trim()) return;
    setBusy(true);
    setMsg(null);
    // Thread onto the latest inbound when there is one; otherwise send fresh to
    // the contact (outbound-only threads, e.g. ones we started).
    const payload = t.latestInboundId
      ? { action: "reply", id: t.latestInboundId, message: draft }
      : { action: "compose", to: t.email, subject: `Re: ${t.messages[t.messages.length - 1]?.subject || "our conversation"}`, message: draft };
    const data = await post(payload);
    setBusy(false);
    if (data.ok) {
      setDraft("");
      setMsg({ tone: "ok", text: "Reply sent." });
      router.refresh();
    } else {
      setMsg({ tone: "err", text: data.error || "Couldn't send." });
    }
  }

  async function sendCompose() {
    if (!toField.trim() || !composeBody.trim()) return;
    setBusy(true);
    setMsg(null);
    const to = toField.trim().toLowerCase();
    const data = await post({ action: "compose", to, subject: subjectField, message: composeBody });
    setBusy(false);
    if (data.ok) {
      setMsg({ tone: "ok", text: "Message sent." });
      setComposing(false);
      setSelectedKey(to); // the new thread will appear on refresh
      router.refresh();
    } else {
      setMsg({ tone: "err", text: data.error || "Couldn't send." });
    }
  }

  const detailOpen = Boolean(selected) || composing;

  return (
    <div className="mt-5 grid h-[70vh] min-h-[460px] overflow-hidden rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] md:grid-cols-[minmax(280px,340px)_1fr]">
      {/* ── Left: thread list ── */}
      <div
        className={`flex min-h-0 flex-col border-[var(--fl-raised)] md:border-r ${
          detailOpen ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="shrink-0 space-y-2 border-b border-[var(--fl-raised)] p-3">
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, message…"
              className="w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
            />
            <button
              type="button"
              onClick={startCompose}
              className="shrink-0 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400"
              title="Start a new conversation"
            >
              + New
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--fl-faint)]">
            <span>{filtered.length} {filtered.length === 1 ? "thread" : "threads"}</span>
            <button
              type="button"
              onClick={() => setUnreadOnly((v) => !v)}
              className={`rounded-full border px-2.5 py-1 font-semibold transition ${
                unreadOnly
                  ? "border-teal-400 bg-teal-500/10 text-[var(--fl-accent-text)]"
                  : "border-[var(--fl-line)] text-[var(--fl-muted)] hover:border-slate-400"
              }`}
            >
              {unreadOnly ? "Unread only ✓" : `Unread (${totalUnread})`}
            </button>
          </div>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-[var(--fl-raised)] overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="p-6 text-center text-sm text-[var(--fl-muted)]">
              {threads.length === 0
                ? "No conversations yet. When someone replies to a FLOW email, the thread opens here."
                : "No threads match."}
            </li>
          ) : (
            filtered.map((t) => {
              const active = t.key === selectedKey;
              const unread = t.unread > 0;
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => selectThread(t)}
                    className={`flex w-full items-start gap-3 p-3 text-left transition ${
                      active ? "bg-teal-500/10" : unread ? "bg-teal-500/5 hover:bg-[var(--fl-surface-2)]" : "hover:bg-[var(--fl-surface-2)]"
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        unread ? "bg-teal-500 text-slate-950" : "bg-[var(--fl-raised)] text-[var(--fl-muted)]"
                      }`}
                      aria-hidden
                    >
                      {initials(t.name, t.email)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-teal-400" aria-label="unread" />}
                        <span className={`truncate text-sm ${unread ? "font-bold text-[var(--fl-text)]" : "font-semibold text-[var(--fl-text)]"}`}>
                          {t.name || t.email}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--fl-muted)]">
                        {t.lastDirection === "out" && <span className="text-[var(--fl-faint)]">You: </span>}
                        {t.lastSnippet || t.email}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--fl-faint)]">{fmtShort(t.lastAt)}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* ── Right: detail / compose ── */}
      <div className={`flex min-h-0 flex-col ${detailOpen ? "flex" : "hidden md:flex"}`}>
        {composing ? (
          <ComposePane
            toField={toField}
            setToField={setToField}
            subjectField={subjectField}
            setSubjectField={setSubjectField}
            composeBody={composeBody}
            setComposeBody={setComposeBody}
            busy={busy}
            msg={msg}
            onSend={sendCompose}
            onBack={backToList}
          />
        ) : selected ? (
          <>
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--fl-raised)] p-4">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" onClick={backToList} className="text-lg text-[var(--fl-muted)] md:hidden" aria-label="Back">
                  ‹
                </button>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--fl-raised)] text-sm font-bold text-[var(--fl-muted)]" aria-hidden>
                  {initials(selected.name, selected.email)}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[var(--fl-text)]">{selected.name || selected.email}</div>
                  <div className="truncate text-xs text-[var(--fl-faint)]">{selected.email}</div>
                  {(selected.matchedName || selected.inspectionId) && (
                    <div className="mt-0.5 text-xs text-[var(--fl-faint)]">
                      {selected.matchedName ? `Re: ${selected.matchedName}` : "Matched inspection"}
                      {selected.inspectionId && (
                        <a href={`/reports/${selected.inspectionId}`} className="ml-2 font-bold text-[var(--fl-accent-text)] underline decoration-dotted">
                          Open inspection
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => markUnread(selected)}
                disabled={busy || !selected.latestInboundId}
                className="shrink-0 rounded-lg border border-[var(--fl-line)] px-2.5 py-1 text-xs font-bold text-[var(--fl-muted)] hover:border-slate-400 disabled:opacity-40"
              >
                Mark unread
              </button>
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {selected.messages.map((m) => {
                const outbound = m.direction === "out";
                return (
                  <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        outbound ? "rounded-br-sm bg-teal-500/15 text-[var(--fl-text)]" : "rounded-bl-sm bg-[var(--fl-surface-2)] text-[var(--fl-text)]"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                        <span>{outbound ? "You" : selected.name || selected.email}</span>
                        <span>·</span>
                        <span>{fmt(m.at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body || "(no text)"}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply box */}
            <div className="shrink-0 space-y-2 border-t border-[var(--fl-raised)] p-4">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className={inputCls}
                placeholder={`Reply to ${selected.name || selected.email}…`}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => sendReply(selected)}
                  disabled={busy || !draft.trim()}
                  className="rounded-xl bg-teal-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
                >
                  {busy ? "Sending…" : "Send reply"}
                </button>
                <span className="text-xs text-[var(--fl-faint)]">Sends from support@flowinspect.app</span>
                {msg && (
                  <span className={`text-sm font-bold ${msg.tone === "ok" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>{msg.text}</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div className="max-w-xs text-[var(--fl-muted)]">
              <div className="text-3xl">💬</div>
              <p className="mt-3 text-sm">Select a conversation to read the full thread and reply — or start a new one.</p>
              <button
                type="button"
                onClick={startCompose}
                className="mt-4 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400"
              >
                + New conversation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ComposePane({
  toField,
  setToField,
  subjectField,
  setSubjectField,
  composeBody,
  setComposeBody,
  busy,
  msg,
  onSend,
  onBack,
}: {
  toField: string;
  setToField: (v: string) => void;
  subjectField: string;
  setSubjectField: (v: string) => void;
  composeBody: string;
  setComposeBody: (v: string) => void;
  busy: boolean;
  msg: { tone: "ok" | "err"; text: string } | null;
  onSend: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--fl-raised)] p-4">
        <button type="button" onClick={onBack} className="text-lg text-[var(--fl-muted)] md:hidden" aria-label="Back">
          ‹
        </button>
        <h3 className="text-lg font-semibold text-[var(--fl-text)]">New conversation</h3>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">To</label>
          <input
            value={toField}
            onChange={(e) => setToField(e.target.value)}
            type="email"
            placeholder="client@email.com"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Subject</label>
          <input
            value={subjectField}
            onChange={(e) => setSubjectField(e.target.value)}
            placeholder="Subject"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Message</label>
          <textarea
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
            rows={8}
            placeholder="Write your message…"
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-[var(--fl-raised)] p-4">
        <button
          type="button"
          onClick={onSend}
          disabled={busy || !toField.trim() || !composeBody.trim()}
          className="rounded-xl bg-teal-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send message"}
        </button>
        <span className="text-xs text-[var(--fl-faint)]">Sends from support@flowinspect.app</span>
        {msg && (
          <span className={`text-sm font-bold ${msg.tone === "ok" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>{msg.text}</span>
        )}
      </div>
    </>
  );
}
