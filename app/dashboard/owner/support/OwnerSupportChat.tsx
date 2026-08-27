"use client";


import { formatAppValue } from "../../../../lib/app-time";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Message = {
  id: string;
  sender_role: string;
  sender_email: string | null;
  message: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  created_at: string;
  read_by_inspector?: boolean;
};

function AttachmentView({
  url,
  name,
  type,
}: {
  url: string;
  name?: string | null;
  type?: string | null;
}) {
  const isImage = (type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(url);
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
        <img src={url} alt={name || "attachment"} className="max-h-52 rounded-lg border border-[var(--fl-line)]" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-3 py-2 text-sm font-semibold text-[var(--fl-accent-text)] hover:border-teal-400"
    >
      📎 {name || "Download attachment"}
    </a>
  );
}

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
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  async function uploadAttachment(file: File) {
    try {
      setUploading(true);
      setError("");
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/support/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed.");
      setAttachment({ url: data.url, name: data.name, type: data.type || "" });
    } catch (err: any) {
      setError(err?.message || "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendReply() {
    if (!selected || (!reply.trim() && !attachment) || sending || uploading) return;

    try {
      setSending(true);
      setError("");
      const res = await fetch("/api/owner/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: selected.id,
          message: reply.trim(),
          attachmentUrl: attachment?.url || "",
          attachmentName: attachment?.name || "",
          attachmentType: attachment?.type || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not send reply.");

      setReply("");
      setAttachment(null);
      await loadThreads();
    } catch (err: any) {
      setError(err?.message || "Could not send reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[var(--fl-ground)] px-4 pt-8 pb-28 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-6 shadow-2xl md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">Owner Support Chat</p>
              <h1 className="mt-3 text-3xl font-semibold sm:text-4xl md:text-5xl">Inspector Messages</h1>
              <p className="mt-4 text-[var(--fl-muted)]">Read and reply to inspector support messages.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openNewMessage}
                className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-black hover:bg-teal-400"
              >
                + New Message
              </button>
              <Link href="/dashboard/owner" className="rounded-xl border border-teal-500 px-5 py-3 font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10">
                Owner Dashboard
              </Link>
            </div>
          </div>
        </section>

        {showNewMessage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-lg rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-[var(--fl-text)]">Message an Inspector</h2>
                <button
                  type="button"
                  onClick={() => setShowNewMessage(false)}
                  className="rounded-lg border border-[var(--fl-line)] px-3 py-1 text-sm font-bold text-[var(--fl-muted)] hover:bg-[var(--fl-raised)]"
                >
                  Close
                </button>
              </div>

              {newMessageError && (
                <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs font-bold text-[var(--fl-crit-text)]">
                  {newMessageError}
                </p>
              )}

              <input
                value={inspectorQuery}
                onChange={(e) => setInspectorQuery(e.target.value)}
                placeholder="Search inspectors by name, email, or company..."
                className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-2.5 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
              />

              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {inspectorsLoading ? (
                  <p className="text-sm text-[var(--fl-muted)]">Loading inspectors...</p>
                ) : filteredInspectors.length === 0 ? (
                  <p className="text-sm text-[var(--fl-muted)]">No inspectors match.</p>
                ) : (
                  filteredInspectors.map((inspector) => (
                    <button
                      key={inspector.id}
                      type="button"
                      onClick={() => setSelectedInspectorId(inspector.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedInspectorId === inspector.id
                          ? "border-teal-400 bg-teal-500/10"
                          : "border-[var(--fl-line)] bg-[var(--fl-ground)] hover:bg-[var(--fl-surface-2)]"
                      }`}
                    >
                      <p className="truncate text-sm font-semibold text-[var(--fl-text)]">{inspector.name}</p>
                      <p className="truncate text-xs text-[var(--fl-muted)]">
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
                className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
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

        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-[var(--fl-crit-text)]">{error}</div>}

        <section className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <div className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4">
            <h2 className="text-xl font-semibold text-[var(--fl-accent-text)]">Threads</h2>
            <div className="mt-4 space-y-3">
              {loading ? (
                <p className="text-[var(--fl-muted)]">Loading...</p>
              ) : threads.length === 0 ? (
                <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-muted)]">No support messages yet.</p>
              ) : (
                threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => setSelectedId(thread.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === thread.id ? "border-teal-400 bg-teal-500/10" : "border-[var(--fl-line)] bg-[var(--fl-ground)] hover:bg-[var(--fl-surface-2)]"}`}
                  >
                    <p className="truncate font-semibold text-[var(--fl-text)]">{thread.inspector_name || thread.inspector_email || "Inspector"}</p>
                    <p className="mt-1 truncate text-xs text-[var(--fl-muted)]">{thread.inspector_email || "No email"}</p>
                    <p className="mt-2 line-clamp-2 break-words [overflow-wrap:anywhere] text-sm text-[var(--fl-muted)]">{thread.last_message || "No messages"}</p>
                    <p className="mt-2 text-xs font-bold text-[var(--fl-accent-text)]">{formatDate(thread.last_message_at)}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4">
            {selected ? (
              <>
                <div className="border-b border-[var(--fl-raised)] pb-4">
                  <h2 className="text-2xl font-semibold text-[var(--fl-text)]">{selected.inspector_name || "Inspector"}</h2>
                  <p className="mt-1 text-sm text-[var(--fl-muted)]">{selected.inspector_email || "No email"}</p>
                </div>

                <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4">
                  {(selected.messages || []).map((item) => {
                    const isOwner = item.sender_role === "owner";
                    return (
                      <div key={item.id} className={`flex ${isOwner ? "justify-end" : "justify-start"}`}>
                        <div className={`min-w-0 max-w-[85%] break-words [overflow-wrap:anywhere] rounded-2xl border p-4 ${isOwner ? "border-teal-500/30 bg-teal-500/10" : "border-blue-500/30 bg-blue-500/10"}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                            {isOwner ? "You" : selected.inspector_name || "Inspector"} · {formatDate(item.created_at)}
                          </p>
                          {item.message && (
                            <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-[var(--fl-text)]">{item.message}</p>
                          )}
                          {item.attachment_url && (
                            <AttachmentView url={item.attachment_url} name={item.attachment_name} type={item.attachment_type} />
                          )}
                          {isOwner && (
                            <p
                              className={`mt-2 text-[11px] font-semibold ${
                                item.read_by_inspector ? "text-[var(--fl-accent-text)]" : "text-[var(--fl-faint)]"
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
                    className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                  />

                  {attachment && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-3 py-2 text-sm">
                      <span className="truncate text-[var(--fl-text)]">📎 {attachment.name}</span>
                      <button type="button" onClick={() => setAttachment(null)} className="shrink-0 text-[var(--fl-crit-text)] hover:underline">
                        Remove
                      </button>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadAttachment(f);
                    }}
                  />

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || sending}
                      className="shrink-0 rounded-xl border border-[var(--fl-line)] px-4 py-4 font-semibold text-[var(--fl-text)] hover:border-teal-400 disabled:opacity-50"
                    >
                      {uploading ? "Uploading..." : "📎 Attach"}
                    </button>
                    <button
                      onClick={sendReply}
                      disabled={sending || uploading || (!reply.trim() && !attachment)}
                      className="w-full rounded-xl bg-teal-500 px-5 py-4 font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
                    >
                      {sending ? "Sending..." : "Send Reply"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-5 text-[var(--fl-muted)]">Select a support thread.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
