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
  read_by_inspector?: boolean;
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

type Inspector = {
  id: string;
  name: string;
  email: string | null;
  companyName: string | null;
};

export default function OwnerSupportChat() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [showNewMessage, setShowNewMessage] = useState(false);
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [inspectorsLoading, setInspectorsLoading] = useState(false);
  const [inspectorQuery, setInspectorQuery] = useState("");
  const [selectedInspectorId, setSelectedInspectorId] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [startingThread, setStartingThread] = useState(false);
  const [newMessageError, setNewMessageError] = useState("");

  const selected = useMemo(
    () => threads.find((thread) => thread.id === selectedId) || threads[0] || null,
    [threads, selectedId]
  );

  const filteredInspectors = useMemo(() => {
    const q = inspectorQuery.trim().toLowerCase();
    if (!q) return inspectors;
    return inspectors.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.email || "").toLowerCase().includes(q) ||
        (i.companyName || "").toLowerCase().includes(q)
    );
  }, [inspectors, inspectorQuery]);

  useEffect(() => {
    loadThreads();
    const timer = setInterval(loadThreads, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId && threads[0]) setSelectedId(threads[0].id);
  }, [threads, selectedId]);

  async function openNewMessage() {
    setShowNewMessage(true);
    setNewMessageError("");
    if (inspectors.length > 0) return;

    try {
      setInspectorsLoading(true);
      const res = await fetch("/api/owner/support/inspectors", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load inspectors.");
      setInspectors(data.inspectors || []);
    } catch (err: any) {
      setNewMessageError(err?.message || "Could not load inspectors.");
    } finally {
      setInspectorsLoading(false);
    }
  }

  async function startNewThread() {
    if (!selectedInspectorId || !newMessage.trim() || startingThread) return;

    try {
      setStartingThread(true);
      setNewMessageError("");
      const res = await fetch("/api/owner/support/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectorId: selectedInspectorId, message: newMessage.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not send message.");

      setNewMessage("");
      setSelectedInspectorId("");
      setInspectorQuery("");
      setShowNewMessage(false);
      await loadThreads();
      if (data.threadId) setSelectedId(data.threadId);
    } catch (err: any) {
      setNewMessageError(err?.message || "Could not send message.");
    } finally {
      setStartingThread(false);
    }
  }

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
    <main className="min-h-screen bg-[#0a0e13] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border border-teal-500/40 bg-[#10151e] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-400">Owner Support Chat</p>
              <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Inspector Messages</h1>
              <p className="mt-4 text-[#8a93a3]">Read and reply to inspector support messages.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openNewMessage}
                className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-black hover:bg-teal-400"
              >
                + New Message
              </button>
              <Link href="/dashboard/owner" className="rounded-xl border border-teal-500 px-5 py-3 font-semibold text-teal-300 hover:bg-teal-500/10">
                Owner Dashboard
              </Link>
            </div>
          </div>
        </section>

        {showNewMessage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-lg rounded-2xl border border-teal-500/40 bg-[#10151e] p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-white">Message an Inspector</h2>
                <button
                  type="button"
                  onClick={() => setShowNewMessage(false)}
                  className="rounded-lg border border-[#232b38] px-3 py-1 text-sm font-bold text-[#8a93a3] hover:bg-[#1a212c]"
                >
                  Close
                </button>
              </div>

              {newMessageError && (
                <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 p-2 text-xs font-bold text-red-300">
                  {newMessageError}
                </p>
              )}

              <input
                value={inspectorQuery}
                onChange={(e) => setInspectorQuery(e.target.value)}
                placeholder="Search inspectors by name, email, or company..."
                className="mt-4 w-full rounded-xl border border-[#232b38] bg-black px-4 py-2.5 text-sm text-white outline-none focus:border-teal-400"
              />

              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {inspectorsLoading ? (
                  <p className="text-sm text-[#8a93a3]">Loading inspectors...</p>
                ) : filteredInspectors.length === 0 ? (
                  <p className="text-sm text-[#8a93a3]">No inspectors match.</p>
                ) : (
                  filteredInspectors.map((inspector) => (
                    <button
                      key={inspector.id}
                      type="button"
                      onClick={() => setSelectedInspectorId(inspector.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedInspectorId === inspector.id
                          ? "border-teal-400 bg-teal-500/10"
                          : "border-[#232b38] bg-[#0a0e13] hover:bg-[#131923]"
                      }`}
                    >
                      <p className="truncate text-sm font-semibold text-white">{inspector.name}</p>
                      <p className="truncate text-xs text-[#8a93a3]">
                        {inspector.email || "No email"}
                        {inspector.companyName ? ` · ${inspector.companyName}` : ""}
                      </p>
                    </button>
                  ))
                )}
              </div>

              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={4}
                placeholder="Write your message..."
                className="mt-4 w-full rounded-xl border border-[#232b38] bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
              />

              <button
                type="button"
                onClick={startNewThread}
                disabled={!selectedInspectorId || !newMessage.trim() || startingThread}
                className="mt-4 w-full rounded-xl bg-teal-500 px-5 py-3 font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
              >
                {startingThread ? "Sending..." : "Send Message"}
              </button>
            </div>
          </div>
        )}

        {error && <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm font-bold text-red-300">{error}</div>}

        <section className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <div className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-4">
            <h2 className="text-xl font-semibold text-teal-300">Threads</h2>
            <div className="mt-4 space-y-3">
              {loading ? (
                <p className="text-[#8a93a3]">Loading...</p>
              ) : threads.length === 0 ? (
                <p className="rounded-xl border border-[#232b38] bg-[#0a0e13] p-4 text-[#8a93a3]">No support messages yet.</p>
              ) : (
                threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => setSelectedId(thread.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === thread.id ? "border-teal-400 bg-teal-500/10" : "border-[#232b38] bg-[#0a0e13] hover:bg-[#131923]"}`}
                  >
                    <p className="truncate font-semibold text-white">{thread.inspector_name || thread.inspector_email || "Inspector"}</p>
                    <p className="mt-1 truncate text-xs text-[#8a93a3]">{thread.inspector_email || "No email"}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-[#8a93a3]">{thread.last_message || "No messages"}</p>
                    <p className="mt-2 text-xs font-bold text-teal-300">{formatDate(thread.last_message_at)}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-4">
            {selected ? (
              <>
                <div className="border-b border-[#1a212c] pb-4">
                  <h2 className="text-2xl font-semibold text-white">{selected.inspector_name || "Inspector"}</h2>
                  <p className="mt-1 text-sm text-[#8a93a3]">{selected.inspector_email || "No email"}</p>
                </div>

                <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto rounded-2xl border border-[#1a212c] bg-[#0a0e13] p-4">
                  {(selected.messages || []).map((item) => {
                    const isOwner = item.sender_role === "owner";
                    return (
                      <div key={item.id} className={`flex ${isOwner ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl border p-4 ${isOwner ? "border-teal-500/30 bg-teal-950/20" : "border-blue-500/30 bg-blue-950/20"}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                            {isOwner ? "You" : selected.inspector_name || "Inspector"} · {formatDate(item.created_at)}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white">{item.message}</p>
                          {isOwner && (
                            <p
                              className={`mt-2 text-[11px] font-semibold ${
                                item.read_by_inspector ? "text-teal-300" : "text-[#59626f]"
                              }`}
                            >
                              {item.read_by_inspector ? "✓✓ Read" : "✓ Sent · not read yet"}
                            </p>
                          )}
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
                    className="w-full rounded-xl border border-[#232b38] bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="w-full rounded-xl bg-teal-500 px-5 py-4 font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </>
            ) : (
              <p className="rounded-xl border border-[#232b38] bg-[#0a0e13] p-5 text-[#8a93a3]">Select a support thread.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
