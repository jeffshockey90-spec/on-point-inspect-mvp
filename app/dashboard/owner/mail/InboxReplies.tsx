"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type Reply = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  received_at: string | null;
  inspection_id: string | null;
  matched_name: string | null;
  is_read: boolean;
  replied_at: string | null;
};

function fmt(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function cleanSubject(s: string | null) {
  return String(s || "").replace(/^\s*(re:\s*)+/i, "").trim() || "(no subject)";
}

export default function InboxReplies({ replies }: { replies: Reply[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; tone: "ok" | "err"; text: string } | null>(null);

  async function post(payload: any) {
    const res = await fetch("/api/owner/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json().catch(() => ({}) as any);
  }

  async function toggleRead(r: Reply) {
    setBusyId(r.id);
    await post({ action: r.is_read ? "unread" : "read", id: r.id });
    setBusyId(null);
    router.refresh();
  }

  async function openReply(r: Reply) {
    if (openId === r.id) {
      setOpenId(null);
      return;
    }
    setOpenId(r.id);
    setDraft("");
    setMsg(null);
    if (!r.is_read) {
      await post({ action: "read", id: r.id });
      router.refresh();
    }
  }

  async function sendReply(r: Reply) {
    if (!draft.trim()) return;
    setBusyId(r.id);
    setMsg(null);
    const data = await post({ action: "reply", id: r.id, message: draft });
    setBusyId(null);
    if (data.ok) {
      setMsg({ id: r.id, tone: "ok", text: "Reply sent." });
      setDraft("");
      setOpenId(null);
      router.refresh();
    } else {
      setMsg({ id: r.id, tone: "err", text: data.error || "Couldn't send." });
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-700 bg-[#0b1220] px-3 py-2.5 text-white outline-none focus:border-teal-400";

  if (replies.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-slate-700 bg-[#020817]/70 p-6 text-center text-slate-400">
        No replies yet. When a client or inspector replies to a FLOW email, it lands here.
      </div>
    );
  }

  return (
    <ul className="mt-5 space-y-3">
      {replies.map((r) => {
        const unread = !r.is_read;
        return (
          <li
            key={r.id}
            className={`rounded-2xl border p-4 transition ${
              unread ? "border-teal-500/50 bg-teal-500/5" : "border-slate-800 bg-[#020817]/50"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-teal-400" aria-label="unread" />}
                  <span className="truncate font-black text-white">{r.from_name || r.from_email}</span>
                  {r.replied_at && (
                    <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-200">
                      REPLIED
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-slate-500">{r.from_email}</div>
                <div className="mt-1 font-bold text-slate-200">{cleanSubject(r.subject)}</div>
                <p className="mt-1 text-sm text-slate-400">{r.snippet}</p>
                {(r.matched_name || r.inspection_id) && (
                  <div className="mt-2 text-xs text-slate-500">
                    {r.matched_name ? `Re: ${r.matched_name}` : "Matched inspection"}
                    {r.inspection_id && (
                      <a
                        href={`/reports/${r.inspection_id}`}
                        className="ml-2 font-bold text-teal-300 underline decoration-dotted"
                      >
                        Open inspection
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="text-xs text-slate-500">{fmt(r.received_at)}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleRead(r)}
                    disabled={busyId === r.id}
                    className="rounded-lg border border-slate-600 px-2.5 py-1 text-xs font-bold text-slate-300 hover:border-slate-400 disabled:opacity-50"
                  >
                    {r.is_read ? "Mark unread" : "Mark read"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openReply(r)}
                    className="rounded-lg bg-teal-500 px-3 py-1 text-xs font-black text-slate-950 hover:bg-teal-400"
                  >
                    {openId === r.id ? "Cancel" : "Reply"}
                  </button>
                </div>
              </div>
            </div>

            {openId === r.id && (
              <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={5}
                  className={inputCls}
                  placeholder={`Reply to ${r.from_name || r.from_email}…`}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => sendReply(r)}
                    disabled={busyId === r.id || !draft.trim()}
                    className="rounded-xl bg-teal-500 px-5 py-2 text-sm font-black text-slate-950 hover:bg-teal-400 disabled:opacity-60"
                  >
                    {busyId === r.id ? "Sending…" : "Send reply"}
                  </button>
                  <span className="text-xs text-slate-500">Sends from support@flowinspect.app</span>
                </div>
              </div>
            )}

            {msg && msg.id === r.id && (
              <p className={`mt-2 text-sm font-bold ${msg.tone === "ok" ? "text-emerald-300" : "text-red-300"}`}>
                {msg.text}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
