"use client";


import { formatAppValue } from "../../lib/app-time";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

type Message = {
  id: string;
  sender_role: string;
  sender_email: string | null;
  message: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  created_at: string;
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
  status: string;
  last_message: string | null;
  last_message_at: string | null;
  messages?: Message[];
};

type FeatureRequest = {
  id: number;
  message: string;
  status: string;
  owner_note: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  planned: "Planned",
  in_progress: "In Progress",
  shipped: "Shipped",
  declined: "Declined",
};

const STATUS_STYLES: Record<string, string> = {
  new: "border-cyan-400/40 bg-cyan-500/10 text-[var(--fl-info-text)]",
  planned: "border-purple-400/40 bg-purple-500/10 text-[var(--fl-purple-text)]",
  in_progress: "border-amber-400/40 bg-amber-500/10 text-[var(--fl-warn-text)]",
  shipped: "border-emerald-400/40 bg-emerald-500/10 text-[var(--fl-good-text)]",
  declined: "border-[var(--fl-faint)] bg-slate-500/10 text-[var(--fl-muted)]",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SupportPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState("");

  const [suggestion, setSuggestion] = useState("");
  const [suggestionSending, setSuggestionSending] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionSent, setSuggestionSent] = useState(false);

  const [myRequests, setMyRequests] = useState<FeatureRequest[]>([]);
  const [myRequestsLoading, setMyRequestsLoading] = useState(true);

  async function loadMyRequests() {
    try {
      const res = await fetch("/api/feature-requests/mine", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setMyRequests(data.requests || []);
    } catch {
      // Non-critical - the submit form still works without this list.
    } finally {
      setMyRequestsLoading(false);
    }
  }

  useEffect(() => {
    loadMyRequests();
  }, []);

  async function sendSuggestion() {
    const clean = suggestion.trim();
    if (!clean || suggestionSending) return;

    try {
      setSuggestionSending(true);
      setSuggestionError("");
      setSuggestionSent(false);

      const res = await fetch("/api/feature-requests/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not submit suggestion.");

      setSuggestion("");
      setSuggestionSent(true);
      await loadMyRequests();
    } catch (err: any) {
      setSuggestionError(err?.message || "Could not submit suggestion.");
    } finally {
      setSuggestionSending(false);
    }
  }

  useEffect(() => {
    loadThread();
    const timer = setInterval(loadThread, 15000);
    return () => clearInterval(timer);
  }, []);

  async function loadThread() {
    try {
      setError("");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const res = await fetch("/api/support/threads", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Could not load support chat.");

      setThread(data.thread || null);
    } catch (err: any) {
      setError(err?.message || "Could not load support chat.");
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

  async function sendMessage() {
    const clean = message.trim();
    if ((!clean && !attachment) || sending || uploading) return;

    try {
      setSending(true);
      setError("");

      const res = await fetch("/api/support/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          attachmentUrl: attachment?.url || "",
          attachmentName: attachment?.name || "",
          attachmentType: attachment?.type || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Message failed to send.");

      setMessage("");
      setAttachment(null);
      setThread(data.thread || null);
    } catch (err: any) {
      setError(err?.message || "Message failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[var(--fl-ground)] px-4 pt-8 pb-28 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-6 shadow-2xl md:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">Support Chat</p>
          <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Contact Owner</h1>
          <p className="mt-4 max-w-2xl text-[var(--fl-muted)]">
            Send Jeff a message if you need help with reports, billing, payments, agreements, or app setup.
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-xl">
          {loading ? (
            <p className="text-[var(--fl-muted)]">Loading support chat...</p>
          ) : (
            <>
              <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4">
                {(thread?.messages || []).length === 0 ? (
                  <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 text-center text-[var(--fl-muted)]">
                    No messages yet. Send your first support message below.
                  </div>
                ) : (
                  thread?.messages?.map((item) => {
                    const isOwner = item.sender_role === "owner";
                    return (
                      <div key={item.id} className={`flex ${isOwner ? "justify-start" : "justify-end"}`}>
                        <div className={`min-w-0 max-w-[85%] break-words [overflow-wrap:anywhere] rounded-2xl border p-4 ${isOwner ? "border-teal-500/30 bg-teal-500/10" : "border-blue-500/30 bg-blue-500/10"}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                            {isOwner ? "Owner Reply" : "You"} · {formatDate(item.created_at)}
                          </p>
                          {item.message && (
                            <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-[var(--fl-text)]">{item.message}</p>
                          )}
                          {item.attachment_url && (
                            <AttachmentView url={item.attachment_url} name={item.attachment_name} type={item.attachment_type} />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {error && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-[var(--fl-crit-text)]">{error}</p>}

              <div className="mt-4 space-y-3">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Type your message to Jeff..."
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
                    onClick={sendMessage}
                    disabled={sending || uploading || (!message.trim() && !attachment)}
                    className="w-full rounded-xl bg-teal-500 px-5 py-4 font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send Message"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">Suggestion Box</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--fl-text)]">Suggest a Feature or Report a Bug</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fl-muted)]">
            Jeff gets notified the moment you submit this. Good ones get built - and you get credited when they ship.
          </p>

          {suggestionSent && (
            <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-bold text-[var(--fl-good-text)]">
              Sent! Jeff was notified right away.
            </p>
          )}

          {suggestionError && (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-[var(--fl-crit-text)]">
              {suggestionError}
            </p>
          )}

          <div className="mt-4 space-y-3">
            <textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              rows={4}
              placeholder="What feature would make FLOW better for you? Or what's broken?"
              className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
            />
            <button
              onClick={sendSuggestion}
              disabled={suggestionSending || !suggestion.trim()}
              className="w-full rounded-xl border border-teal-500 bg-teal-500/10 px-5 py-4 font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/20 disabled:opacity-50"
            >
              {suggestionSending ? "Sending..." : "Submit Suggestion"}
            </button>
          </div>

          {!myRequestsLoading && myRequests.length > 0 && (
            <div className="mt-6 space-y-3 border-t border-[var(--fl-raised)] pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">Your Suggestions</p>
              {myRequests.map((request) => (
                <div key={request.id} className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm leading-6 text-[var(--fl-text)]">{request.message}</p>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${STATUS_STYLES[request.status] || STATUS_STYLES.new}`}>
                      {STATUS_LABELS[request.status] || request.status}
                    </span>
                  </div>
                  {request.owner_note && (
                    <div className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/10 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">Reply from Jeff</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--fl-text)]">{request.owner_note}</p>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-[var(--fl-faint)]">{formatDate(request.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
