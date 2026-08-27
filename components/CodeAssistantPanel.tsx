"use client";

import { useRef, useState } from "react";

type QAItem = {
  id: string;
  question: string;
  answer: string;
};

type Props = {
  // When true, renders the tighter layout used inside the field tool tab.
  compact?: boolean;
  // Optional inspection context passed through to the API (e.g. current section).
  context?: string;
};

const EXAMPLE_QUESTIONS = [
  "What's the required handrail height on stairs?",
  "Minimum guard height on a deck?",
  "Where is GFCI protection required?",
  "When are AFCI receptacles required?",
  "Water heater TPR discharge pipe requirements?",
  "Minimum egress window size for a bedroom?",
];

// Very light markdown → safe React nodes: **bold** and simple bullet lines.
// Intentionally minimal (no dangerouslySetInnerHTML) since the answer is model
// output. Everything else renders as plain text with preserved line breaks.
function renderAnswer(answer: string) {
  const lines = answer.split("\n");

  return lines.map((line, index) => {
    const trimmed = line.trim();
    const isBullet = /^[-*•]\s+/.test(trimmed);
    const content = isBullet ? trimmed.replace(/^[-*•]\s+/, "") : line;

    const parts = content.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    const rendered = parts.map((part, partIndex) => {
      const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
      if (boldMatch) {
        return (
          <strong key={partIndex} className="font-semibold text-[var(--fl-text)]">
            {boldMatch[1]}
          </strong>
        );
      }
      return <span key={partIndex}>{part}</span>;
    });

    if (isBullet) {
      return (
        <div key={index} className="flex gap-2">
          <span className="mt-[2px] shrink-0 text-[var(--fl-accent-text)]">•</span>
          <span className="min-w-0">{rendered}</span>
        </div>
      );
    }

    if (trimmed === "") {
      return <div key={index} className="h-2" />;
    }

    return <p key={index}>{rendered}</p>;
  });
}

export default function CodeAssistantPanel({ compact = false, context }: Props) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QAItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  async function ask(rawQuestion: string) {
    const trimmed = rawQuestion.trim();
    if (!trimmed || loading) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ai/code-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ question: trimmed, context: context || "" }),
      });

      const data = await response.json().catch(() => ({}));

      if (requestIdRef.current !== requestId) return;

      if (!response.ok || !data?.answer) {
        setError(data?.error || "Code Assistant could not answer that. Try again.");
        return;
      }

      setHistory((current) => [
        {
          id: `${Date.now()}-${requestId}`,
          question: trimmed,
          answer: String(data.answer),
        },
        ...current,
      ]);
      setQuestion("");
    } catch (err: any) {
      if (requestIdRef.current === requestId) {
        setError(err?.message || "Code Assistant is unavailable right now.");
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <section
      className={`rounded-2xl border border-teal-500/40 bg-teal-500/5 text-white ${
        compact ? "p-3" : "p-5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fl-accent-text)]">
            Code Assistant
          </p>
          {!compact && (
            <h2 className="mt-1 text-xl font-semibold">
              Building-code &amp; standards helper
            </h2>
          )}
          <p className={`text-[var(--fl-muted)] ${compact ? "mt-1 text-xs" : "mt-2 text-sm leading-6"}`}>
            Ask a plain-language code question. Answers reference general model-code
            (IRC) context — always verify with the local AHJ.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void ask(question);
            }
          }}
          placeholder="e.g. What's the required handrail height?"
          rows={compact ? 2 : 3}
          className="w-full resize-none rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3 text-sm font-medium text-[var(--fl-text)] placeholder:text-[var(--fl-faint)] focus:border-teal-400 focus:outline-none"
        />

        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--fl-faint)]">
            {loading ? "Thinking…" : "Ctrl/⌘ + Enter to ask"}
          </span>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="min-h-11 rounded-xl bg-teal-400 px-6 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 active:scale-[0.98] disabled:opacity-40"
          >
            {loading ? "Asking…" : "Ask"}
          </button>
        </div>
      </form>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--fl-muted)]">
          Try one
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuestion(example);
                void ask(example);
              }}
              disabled={loading}
              className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-bold text-teal-100 transition hover:border-teal-400 hover:bg-teal-500/20 active:scale-[0.98] disabled:opacity-40"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-100">
          {error}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-5 space-y-3">
          {history.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4"
            >
              <p className="flex gap-2 text-sm font-semibold text-[var(--fl-accent-text)]">
                <span className="shrink-0 text-[var(--fl-accent-text)]">Q</span>
                <span className="min-w-0">{item.question}</span>
              </p>
              <div className="mt-3 space-y-1.5 text-sm leading-6 text-[var(--fl-text)]">
                {renderAnswer(item.answer)}
              </div>
            </article>
          ))}
        </div>
      )}

      {history.length === 0 && !error && (
        <p className="mt-5 rounded-xl border border-dashed border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-center text-xs font-bold text-[var(--fl-faint)]">
          Answers are general model-code guidance for inspectors, not legal advice.
          Adopted editions and local amendments vary — confirm with the AHJ.
        </p>
      )}
    </section>
  );
}
