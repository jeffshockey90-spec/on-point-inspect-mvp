"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

function initials(name: string | null, email: string) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default function Conversations({ threads }: { threads: Thread[] }) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; tone: "ok" | "err"; text: string } | null>(null);

  async function post(payload: any) {
    const res = await fetch("/api/owner/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json().catch(() => ({}) as any);
  }

  async function openThread(t: Thread) {
    if (openKey === t.key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(t.key);
    setDraft("");
    setMsg(null);
    if (t.unread > 0) {
      await post({ action: "read-thread", email: t.email });
      router.refresh();
    }
  }

  async function markUnread(t: Thread) {
    if (!t.latestInboundId) return;
    setBusyKey(t.key);
    await post({ action: "unread", id: t.latestInboundId });
    setBusyKey(null);
    router.refresh();
  }

  async function sendReply(t: Thread) {
    if (!draft.trim()) return;
    if (!t.latestInboundId) {
      setMsg({ key: t.key, tone: "err", text: "No inbound message to reply to." });
      return;
    }
    setBusyKey(t.key);
    setMsg(null);
    const data = await post({ action: "reply", id: t.latestInboundId, message: draft });
    setBusyKey(null);
    if (data.ok) {
      setDraft("");
      setMsg({ key: t.key, tone: "ok", text: "Reply sent." });
      router.refresh();
    } else {
      setMsg({ key: t.key, tone: "err", text: data.error || "Couldn't send." });
    }
  }

  const inputCls =
    "w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] px-3 py-2.5 text-[var(--fl-text)] outline-none focus:border-teal-400";

  if (threads.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-center text-[var(--fl-muted)]">
        No conversations yet. When a client, agent, or inspector replies to a FLOW email, the thread opens here.
      </div>
    );
  }

  return (
    <ul className="mt-5 space-y-3">
      {threads.map((t) => {
        const open = openKey === t.key;
        const unread = t.unread > 0;
        return (
          <li
            key={t.key}
            className={`overflow-hidden rounded-2xl border transition ${
              unread ? "border-teal-500/50 bg-teal-500/5" : "border-[var(--fl-raised)] bg-[var(--fl-ground)]"
            }`}
          >
            {/* Thread header — click to expand */}
            <button
              type="button"
              onClick={() => openThread(t)}
              className="flex w-full items-start gap-3 p-4 text-left"
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  unread ? "bg-teal-500 text-slate-950" : "bg-[var(--fl-raised)] text-[var(--fl-muted)]"
                }`}
                aria-hidden
              >
                {initials(t.name, t.email)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-teal-400" aria-label="unread" />}
                  <span className="truncate font-semibold text-[var(--fl-text)]">{t.name || t.email}</span>
                  <span className="shrink-0 rounded-full border border-[var(--fl-line)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--fl-faint)]">
                    {t.messages.length}
                  </span>
                </span>
                <span className="block truncate text-xs text-[var(--fl-faint)]">{t.email}</span>
                <span className="mt-1 block truncate text-sm text-[var(--fl-muted)]">
                  {t.lastDirection === "out" && <span className="text-[var(--fl-faint)]">You: </span>}
                  {t.lastSnippet}
                </span>
                {(t.matchedName || t.inspectionId) && (
                  <span className="mt-1 block text-xs text-[var(--fl-faint)]">
                    {t.matchedName ? `Re: ${t.matchedName}` : "Matched inspection"}
                    {t.inspectionId && (
                      <a
                        href={`/reports/${t.inspectionId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="ml-2 font-bold text-[var(--fl-accent-text)] underline decoration-dotted"
                      >
                        Open inspection
                      </a>
                    )}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-[var(--fl-faint)]">{fmt(t.lastAt)}</span>
                <span className="text-lg leading-none text-[var(--fl-faint)]">{open ? "⌄" : "›"}</span>
              </span>
            </button>

            {/* Expanded thread — full back-and-forth + reply box */}
            {open && (
              <div className="border-t border-[var(--fl-raised)] px-4 pb-4 pt-3">
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {t.messages.map((m) => {
                    const outbound = m.direction === "out";
                    return (
                      <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                            outbound
                              ? "rounded-br-sm bg-teal-500/15 text-[var(--fl-text)]"
                              : "rounded-bl-sm bg-[var(--fl-surface-2)] text-[var(--fl-text)]"
                          }`}
                        >
                          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                            <span>{outbound ? "You" : t.name || t.email}</span>
                            <span>·</span>
                            <span>{fmt(m.at)}</span>
                          </div>
                          <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body || "(no text)"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 space-y-2 border-t border-[var(--fl-raised)] pt-3">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={4}
                    className={inputCls}
                    placeholder={`Reply to ${t.name || t.email}…`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => sendReply(t)}
                        disabled={busyKey === t.key || !draft.trim()}
                        className="rounded-xl bg-teal-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
                      >
                        {busyKey === t.key ? "Sending…" : "Send reply"}
                      </button>
                      <span className="text-xs text-[var(--fl-faint)]">Sends from support@flowinspect.app</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => markUnread(t)}
                      disabled={busyKey === t.key || !t.latestInboundId}
                      className="rounded-lg border border-[var(--fl-line)] px-2.5 py-1 text-xs font-bold text-[var(--fl-muted)] hover:border-slate-400 disabled:opacity-50"
                    >
                      Mark unread
                    </button>
                  </div>
                  {msg && msg.key === t.key && (
                    <p className={`text-sm font-bold ${msg.tone === "ok" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>
                      {msg.text}
                    </p>
                  )}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
