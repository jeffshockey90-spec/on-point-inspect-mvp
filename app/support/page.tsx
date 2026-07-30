"use client";


import { formatAppValue } from "../../lib/app-time";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

type Message = {
  id: string;
  sender_role: string;
  sender_email: string | null;
  message: string;
  created_at: string;
};

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
  new: "border-cyan-400/40 bg-cyan-500/10 text-cyan-300",
  planned: "border-purple-400/40 bg-purple-500/10 text-purple-300",
  in_progress: "border-amber-400/40 bg-amber-500/10 text-amber-300",
  shipped: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
  declined: "border-slate-500/40 bg-slate-500/10 text-slate-400",
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

  async function sendMessage() {
    const clean = message.trim();
    if (!clean || sending) return;

    try {
      setSending(true);
      setError("");

      const res = await fetch("/api/support/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Message failed to send.");

      setMessage("");
      setThread(data.thread || null);
    } catch (err: any) {
      setError(err?.message || "Message failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-3xl border border-teal-500/40 bg-[#0f172a] p-6 shadow-2xl md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-400">Support Chat</p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">Contact Owner</h1>
          <p className="mt-4 max-w-2xl text-slate-300">
            Send Jeff a message if you need help with reports, billing, payments, agreements, or app setup.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-xl">
          {loading ? (
            <p className="text-slate-400">Loading support chat...</p>
          ) : (
            <>
              <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-[#020817] p-4">
                {(thread?.messages || []).length === 0 ? (
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 text-center text-slate-400">
                    No messages yet. Send your first support message below.
                  </div>
                ) : (
                  thread?.messages?.map((item) => {
                    const isOwner = item.sender_role === "owner";
                    return (
                      <div key={item.id} className={`flex ${isOwner ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[85%] rounded-2xl border p-4 ${isOwner ? "border-teal-500/30 bg-teal-950/20" : "border-blue-500/30 bg-blue-950/20"}`}>
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            {isOwner ? "Owner Reply" : "You"} · {formatDate(item.created_at)}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white">{item.message}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {error && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm font-bold text-red-300">{error}</p>}

              <div className="mt-4 space-y-3">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Type your message to Jeff..."
                  className="w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !message.trim()}
                  className="w-full rounded-xl bg-teal-500 px-5 py-4 font-black text-black hover:bg-teal-400 disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send Message"}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-xl">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-400">Suggestion Box</p>
          <h2 className="mt-2 text-2xl font-black text-white">Suggest a Feature or Report a Bug</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Jeff gets notified the moment you submit this. Good ones get built - and you get credited when they ship.
          </p>

          {suggestionSent && (
            <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-sm font-bold text-emerald-300">
              Sent! Jeff was notified right away.
            </p>
          )}

          {suggestionError && (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm font-bold text-red-300">
              {suggestionError}
            </p>
          )}

          <div className="mt-4 space-y-3">
            <textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              rows={4}
              placeholder="What feature would make FLOW better for you? Or what's broken?"
              className="w-full rounded-xl border border-slate-700 bg-black px-4 py-3 text-white outline-none focus:border-teal-400"
            />
            <button
              onClick={sendSuggestion}
              disabled={suggestionSending || !suggestion.trim()}
              className="w-full rounded-xl border border-teal-500 bg-teal-500/10 px-5 py-4 font-black text-teal-300 hover:bg-teal-500/20 disabled:opacity-50"
            >
              {suggestionSending ? "Sending..." : "Submit Suggestion"}
            </button>
          </div>

          {!myRequestsLoading && myRequests.length > 0 && (
            <div className="mt-6 space-y-3 border-t border-slate-800 pt-6">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Your Suggestions</p>
              {myRequests.map((request) => (
                <div key={request.id} className="rounded-xl border border-slate-800 bg-[#020817] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm leading-6 text-slate-200">{request.message}</p>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black uppercase ${STATUS_STYLES[request.status] || STATUS_STYLES.new}`}>
                      {STATUS_LABELS[request.status] || request.status}
                    </span>
                  </div>
                  {request.owner_note && (
                    <div className="mt-3 rounded-lg border border-teal-500/30 bg-teal-950/20 p-3">
                      <p className="text-xs font-black uppercase tracking-wide text-teal-400">Reply from Jeff</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-200">{request.owner_note}</p>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">{formatDate(request.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
