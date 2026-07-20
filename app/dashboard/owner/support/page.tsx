"use client";


import { formatAppValue } from "../../../../lib/app-time";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Message = {
  id: string;
  sender_role: string;
  sender_email: string | null;
  message: string;
  created_at: string;
};

type Thread = {
  id: string;
  inspector_id: string;
  inspector_email: string | null;
  inspector_name: string | null;
  status: string;
  last_message: string | null;
  last_message_at: string | null;
  messages?: Message[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OwnerSupportPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => threads.find((thread) => thread.id === selectedId) || threads[0] || null,
    [threads, selectedId]
  );

  useEffect(() => {
    loadThreads();
    const timer = setInterval(loadThreads, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId && threads[0]) setSelectedId(threads[0].id);
  }, [threads, selectedId]);

  async function loadThreads() {
    try {
      setError("");
      const res = await fetch("/api/owner/support/threads", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load support threads.");
      setThreads(data.threads || []);
    } catch (err: any) {
      setError(err?.message || "Could not load support threads.");
    } finally {
      setLoading(false);
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim() || sending) return;

    try {
      setSending(true);
      setError("");
      const res = await fetch("/api/owner/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selected.id, message: reply.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not send reply.");

      setReply("");
      await loadThreads();
    } catch (err: any) {
      setError(err?.message || "Could not send reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-teal-500/40 bg-[#0f172a] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-400">Owner Support Chat</p>
              <h1 className="mt-3 text-4xl font-black md:text-5xl">Inspector Messages</h1>
              <p className="mt-4 text-slate-300">Read and reply to inspector support messages.</p>
            </div>
            <Link href="/dashboard/owner" className="rounded-xl border border-teal-500 px-5 py-3 font-black text-teal-300 hover:bg-teal-500/10">
              Owner Dashboard
            </Link>
          </div>
        </section>

        {error && <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm font-bold text-red-300">{error}</div>}

        <section className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-4">
            <h2 className="text-xl font-black text-teal-300">Threads</h2>
            <div className="mt-4 space-y-3">
              {loading ? (
                <p className="text-slate-400">Loading...</p>
              ) : threads.length === 0 ? (
                <p className="rounded-xl border border-slate-700 bg-[#020817] p-4 text-slate-400">No support messages yet.</p>
              ) : (
                threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => setSelectedId(thread.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === thread.id ? "border-teal-400 bg-teal-500/10" : "border-slate-700 bg-[#020817] hover:bg-slate-900"}`}
                  >
                    <p className="truncate font-black text-white">{thread.inspector_name || thread.inspector_email || "Inspector"}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">{thread.inspector_email || "No email"}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-300">{thread.last_message || "No messages"}</p>
                    <p className="mt-2 text-xs font-bold text-teal-300">{formatDate(thread.last_message_at)}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-4">
            {selected ? (
              <>
                <div className="border-b border-slate-800 pb-4">
                  <h2 className="text-2xl font-black text-white">{selected.inspector_name || "Inspector"}</h2>
                  <p className="mt-1 text-sm text-slate-400">{selected.inspector_email || "No email"}</p>
                </div>

                <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-[#020817] p-4">
                  {(selected.messages || []).map((item) => {
                    const isOwner = item.sender_role === "owner";
                    return (
                      <div key={item.id} className={`flex ${isOwner ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl border p-4 ${isOwner ? "border-teal-500/30 bg-teal-950/20" : "border-blue-500/30 bg-blue-950/20"}`}>
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            {isOwner ? "You" : selected.inspector_name || "Inspector"} · {formatDate(item.created_at)}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white">{item.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 space-y-3">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={4}
                    placeholder="Reply to inspector..."
                    className="w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="w-full rounded-xl bg-teal-500 px-5 py-4 font-black text-black hover:bg-teal-400 disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </>
            ) : (
              <p className="rounded-xl border border-slate-700 bg-[#020817] p-5 text-slate-400">Select a support thread.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
