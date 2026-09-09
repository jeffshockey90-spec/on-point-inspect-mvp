"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Is anything broken right now?",
  "Any security probes in the last day?",
  "How's email + payments looking?",
  "What should I improve this week?",
  "Give me a feature idea worth building",
];

function renderMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (line: string) =>
    esc(line)
      .replace(/\[([^\]]+)\]\((\/[^)\s]+)\)/g, '<a href="$2" class="text-[var(--fl-accent-text)] underline decoration-dotted">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, '<code class="rounded bg-[var(--fl-surface-2)] px-1 text-[0.85em]">$1</code>');
  const lines = src.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (!inList) { out.push('<ul class="my-1 ml-4 list-disc space-y-1">'); inList = true; }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      if (line.trim() === "") out.push("<div class='h-2'></div>");
      else out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function Orb({ size = "h-9 w-9", text = "text-base" }: { size?: string; text?: string }) {
  return (
    <span className={`relative grid ${size} shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-300 via-teal-500 to-cyan-700 shadow-[0_0_18px_-2px_rgba(45,212,191,0.6)]`}>
      <span className={`${text} leading-none`}>🤖</span>
    </span>
  );
}

export default function JarvisChat() {
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
      const res = await fetch("/api/owner/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json().catch(() => ({}) as any);
      if (res.ok && data.answer) setMessages((m) => [...m, { role: "assistant", content: data.answer }]);
      else setError(data.error || "Something went wrong.");
    } catch {
      setError("Couldn't reach the server.");
    }
    setLoading(false);
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-[70vh] min-h-[460px] flex-col overflow-hidden rounded-3xl border border-teal-500/25 bg-[var(--fl-surface)] shadow-[0_20px_60px_-25px_rgba(45,212,191,0.35)]">
      {/* Header — Jarvis identity + live status */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--fl-raised)] bg-gradient-to-r from-teal-500/10 via-transparent to-transparent px-4 py-3">
        <span className="relative">
          <Orb />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-[var(--fl-surface)] bg-emerald-400" />
          </span>
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-[var(--fl-text)]">Jarvis</span>
            <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--fl-accent-text)]">Synthetic Intelligence</span>
          </div>
          <div className="text-xs text-[var(--fl-muted)]">Online · watching FLOW</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollerRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {empty ? (
          <div className="mx-auto max-w-lg py-8 text-center">
            <div className="mx-auto mb-4 w-fit">
              <span className="relative grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-teal-300 via-teal-500 to-cyan-700 text-3xl shadow-[0_0_40px_-4px_rgba(45,212,191,0.7)]">
                🤖
                <span className="absolute inset-0 animate-ping rounded-full border border-teal-400/40" />
              </span>
            </div>
            <h2 className="text-xl font-semibold text-[var(--fl-text)]">I&apos;ve got eyes on the whole platform</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--fl-muted)]">
              Ask me what&apos;s broken, what&apos;s being probed, where we can improve, or what to build next. I check the live signals before I answer — and I&apos;ll never touch anything without your say-so.
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
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-teal-500 px-4 py-3 text-sm leading-relaxed text-slate-950">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2.5">
                <Orb size="h-8 w-8" text="text-sm" />
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-teal-500/20 bg-[var(--fl-ground)] px-4 py-3 text-sm leading-relaxed text-[var(--fl-text)]">
                  <div className="jarvis-md space-y-1" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                </div>
              </div>
            ),
          )
        )}

        {loading && (
          <div className="flex items-start gap-2.5">
            <Orb size="h-8 w-8" text="text-sm" />
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-teal-500/20 bg-[var(--fl-ground)] px-4 py-3 text-sm text-[var(--fl-muted)]">
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400" />
              <span className="ml-1">Reading the signals…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5">
            <Orb size="h-8 w-8" text="text-sm" />
            <div className="rounded-2xl rounded-tl-sm border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-[var(--fl-crit-text)]">{error}</div>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="shrink-0 border-t border-[var(--fl-raised)] bg-[var(--fl-surface)] p-3 sm:p-4"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-1.5 focus-within:border-teal-400">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); }
            }}
            rows={1}
            placeholder="Ask Jarvis about the platform…"
            className="max-h-32 min-h-[40px] w-full resize-none bg-transparent px-3 py-2 text-sm text-[var(--fl-text)] outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:brightness-110 disabled:opacity-50"
          >
            Ask
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-[var(--fl-faint)]">
          Jarvis reads live platform signals and can hand a fix to your dev — but never changes anything without your say-so.
        </p>
      </form>
    </div>
  );
}
