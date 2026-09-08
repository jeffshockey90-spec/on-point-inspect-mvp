"use client";

import { useEffect, useRef, useState } from "react";

type PendingAction = {
  kind: string;
  inspection_id: string;
  address?: string | null;
  client_name?: string | null;
  human_summary?: string;
  params?: any;
};
type Msg = {
  role: "user" | "assistant";
  content: string;
  pendingAction?: PendingAction | null;
  actionState?: "idle" | "busy" | "done" | "error" | "cancelled";
  actionMsg?: string;
};

const STARTERS = [
  "How many inspections did I do this week?",
  "Which upcoming jobs aren't paid yet?",
  "Which upcoming inspections have no signed agreement?",
  "What reports are still drafts?",
  "What slots are open in the next 3 days?",
  "Show me safety concerns from this month",
];

// Minimal, safe Markdown → HTML for chat answers. Escapes everything first,
// then linkifies ONLY internal /paths, bolds **text**, and renders - bullets.
function renderMarkdown(src: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const inline = (line: string) =>
    esc(line)
      .replace(/\[([^\]]+)\]\((\/[^)\s]+)\)/g, '<a href="$2" class="text-[var(--fl-accent-text)] underline decoration-dotted">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, '<code class="rounded bg-[var(--fl-surface-2)] px-1">$1</code>');

  const lines = src.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        out.push('<ul class="my-1 ml-4 list-disc space-y-1">');
        inList = true;
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (line.trim() === "") out.push("<div class='h-2'></div>");
      else out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

export default function AskFlow() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ask-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (res.ok && data.answer) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data.answer,
            pendingAction: data.pendingAction || null,
            actionState: data.pendingAction ? "idle" : undefined,
          },
        ]);
      } else {
        setError(data.error || "Something went wrong. Try again.");
      }
    } catch {
      setError("Couldn't reach the server.");
    }
    setLoading(false);
  }

  function patchMsg(index: number, patch: Partial<Msg>) {
    setMessages((m) => m.map((msg, i) => (i === index ? { ...msg, ...patch } : msg)));
  }

  // Confirm executes the staged action. Reminders reuse the existing, tested
  // routes; reschedule/note hit the narrow /api/ask-flow/act endpoint. Only the
  // inspection id + validated params are sent — recipients/scope are resolved
  // server-side, so a tampered client can't redirect a send.
  async function confirmAction(index: number, a: PendingAction) {
    patchMsg(index, { actionState: "busy" });
    try {
      let res: Response;
      if (a.kind === "send_agreement_reminder") {
        res = await fetch("/api/send-agreement-reminder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inspectionId: a.inspection_id }),
        });
      } else if (a.kind === "send_payment_reminder") {
        res = await fetch("/api/send-invoice-reminder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inspectionId: a.inspection_id }),
        });
      } else {
        // reschedule | add_note
        res = await fetch("/api/ask-flow/act", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: a.kind,
            inspection_id: a.inspection_id,
            date: a.params?.date,
            time: a.params?.time,
            note: a.params?.note,
          }),
        });
      }
      const data = await res.json().catch(() => ({}) as any);
      if (res.ok && (data.ok || data.success)) {
        patchMsg(index, { actionState: "done", actionMsg: data.message || "Done." });
      } else {
        patchMsg(index, { actionState: "error", actionMsg: data.error || "Couldn't complete that." });
      }
    } catch {
      patchMsg(index, { actionState: "error", actionMsg: "Couldn't reach the server." });
    }
  }

  const ACTION_VERB: Record<string, string> = {
    send_agreement_reminder: "Send agreement reminder",
    send_payment_reminder: "Send payment reminder",
    reschedule: "Reschedule",
    add_note: "Add note",
  };

  const empty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-160px)] min-h-[440px] flex-col overflow-hidden rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] shadow-xl">
      {/* Messages */}
      <div ref={scrollerRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {empty ? (
          <div className="mx-auto max-w-xl py-6 text-center">
            <div className="text-4xl">💬</div>
            <h2 className="mt-3 text-xl font-semibold text-[var(--fl-text)]">Ask FLOW anything about your business</h2>
            <p className="mt-2 text-sm text-[var(--fl-muted)]">
              Inspections, payments, agreements, schedule, findings — just ask in plain English. FLOW reads your live data to answer.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-full border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-1.5 text-sm text-[var(--fl-muted)] transition hover:border-teal-400 hover:text-[var(--fl-text)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="space-y-2">
              <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-teal-500 text-slate-950"
                      : "rounded-bl-sm border border-[var(--fl-raised)] bg-[var(--fl-ground)] text-[var(--fl-text)]"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="ask-flow-md space-y-1" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                  ) : (
                    m.content
                  )}
                </div>
              </div>

              {m.pendingAction && (
                <div className="flex justify-start">
                  <div className="w-full max-w-[85%] rounded-2xl border border-teal-500/40 bg-teal-500/5 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
                      <span>⚡ Confirm action</span>
                      <span className="rounded-full border border-[var(--fl-line)] px-2 py-0.5 text-[10px] text-[var(--fl-muted)]">
                        {ACTION_VERB[m.pendingAction.kind] || m.pendingAction.kind}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--fl-text)]">{m.pendingAction.human_summary}</p>

                    {m.actionState === "done" ? (
                      <p className="mt-3 text-sm font-bold text-[var(--fl-good-text)]">✓ {m.actionMsg}</p>
                    ) : m.actionState === "cancelled" ? (
                      <p className="mt-3 text-sm font-semibold text-[var(--fl-muted)]">Cancelled.</p>
                    ) : (
                      <>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => confirmAction(i, m.pendingAction!)}
                            disabled={m.actionState === "busy"}
                            className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60"
                          >
                            {m.actionState === "busy" ? "Working…" : "Confirm"}
                          </button>
                          <button
                            type="button"
                            onClick={() => patchMsg(i, { actionState: "cancelled" })}
                            disabled={m.actionState === "busy"}
                            className="rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold text-[var(--fl-muted)] hover:border-slate-400 disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                        {m.actionState === "error" && (
                          <p className="mt-2 text-sm font-bold text-[var(--fl-crit-text)]">{m.actionMsg}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-[var(--fl-raised)] bg-[var(--fl-ground)] px-4 py-3 text-sm text-[var(--fl-muted)]">
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400" />
              <span className="ml-1">Checking your data…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-[var(--fl-crit-text)]">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="shrink-0 border-t border-[var(--fl-raised)] p-3 sm:p-4"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            placeholder="Ask about inspections, payments, schedule, findings…"
            className="max-h-32 min-h-[46px] w-full resize-none rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-sm text-[var(--fl-text)] outline-none focus:border-teal-400"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:opacity-50"
          >
            Ask
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-[var(--fl-faint)]">
          Ask FLOW reads your live data to answer. It can look things up but can’t make changes yet.
        </p>
      </form>
    </div>
  );
}
