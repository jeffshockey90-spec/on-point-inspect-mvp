"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Volume2, VolumeX } from "lucide-react";

type CopilotIssue = {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  section?: string;
  reason: string;
  recommendation: string;
};

type RelatedFindingCluster = {
  id: string;
  title: string;
  confidence: number;
  findings: Array<{
    id?: string | number;
    title: string;
    section?: string;
    severity?: string;
  }>;
  explanation: string;
  recommendation: string;
};

type CopilotResult = {
  score: number;
  confidence: number;
  status: "Monitoring" | "Needs Review" | "Ready";
  completedSystems: string[];
  missingSystems: string[];
  priorityIssues: CopilotIssue[];
  contradictions: CopilotIssue[];
  relatedFindings: RelatedFindingCluster[];
  suggestions: string[];
  answer?: string;
  findingCount: number;
  equipmentCount: number;
  photoCount: number;
};

function scoreTone(score?: number) {
  const value = Number(score || 0);
  if (value >= 90) return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  if (value >= 75) return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
  return "border-red-500/50 bg-red-500/10 text-red-300";
}

function issueTone(severity?: string) {
  if (severity === "critical") return "border-red-500/50 bg-red-500/10 text-red-200";
  if (severity === "warning") return "border-yellow-500/50 bg-yellow-500/10 text-yellow-100";
  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-100";
}

function quickQuestions() {
  return [
    "What did I miss?",
    "Is this ready to publish?",
    "Any contradictions?",
    "Show related findings",
    "Why did confidence drop?",
  ];
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[#232b38] bg-[#131923] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a93a3]">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function IssueCard({ issue }: { issue: CopilotIssue }) {
  return (
    <div className={`rounded-xl border p-3 ${issueTone(issue.severity)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold">{issue.title}</p>
        {issue.section && (
          <span className="rounded-full border border-current/30 px-2 py-1 text-[10px] font-semibold opacity-90">
            {issue.section}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 opacity-90">{issue.reason}</p>
      <p className="mt-2 text-xs font-bold leading-5">{issue.recommendation}</p>
      <button
        type="button"
        onClick={() => jumpToIssue(issue)}
        className="mt-3 rounded-lg border border-current/40 px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98] hover:bg-white/10"
      >
        Open Section
      </button>
    </div>
  );
}

function jumpToIssue(issue: CopilotIssue) {
  if (typeof window === "undefined") return;

  const section = String(issue?.section || "").trim();
  const slug = section
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  window.dispatchEvent(
    new CustomEvent("opi:command-center-jump", {
      detail: {
        targetAnchor: slug ? `report-section-${slug}` : "report-findings",
      },
    }),
  );
}

function usePanelActive() {
  const rootRef = useRef<HTMLElement | null>(null);
  const isIntersecting = useRef(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setActive(document.visibilityState === "visible");
      return;
    }

    const updateVisibility = () => {
      setActive(isIntersecting.current && document.visibilityState === "visible");
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isIntersecting.current = entry.isIntersecting;
        setActive(entry.isIntersecting && document.visibilityState === "visible");
      },
      { rootMargin: "300px 0px", threshold: 0.01 },
    );

    observer.observe(node);
    document.addEventListener("visibilitychange", updateVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  return { rootRef, active };
}

export default function InspectionCopilotPanel({
  inspectionId,
  compact = false,
}: {
  inspectionId: string;
  compact?: boolean;
}) {
  const { rootRef, active } = usePanelActive();
  const inFlight = useRef(false);
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Voice copilot: talk to it, and (optionally) have it talk back.
  const [listening, setListening] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceSupported =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) &&
    "speechSynthesis" in window;

  useEffect(() => {
    try {
      setVoiceReplies(localStorage.getItem("copilot-voice-replies") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const clean = String(text || "").trim();
    if (!clean) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.03;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* speech synthesis can throw on some devices; ignore */
    }
  }, []);

  const loadCopilot = useCallback(
    async (nextQuestion = "") => {
      if (!inspectionId || !active || inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      setMessage("");

      try {
        const res = await fetch("/api/ai/inspection-copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            inspectionId,
            inspection_id: inspectionId,
            question: nextQuestion,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setMessage(data?.error || "Inspection Copilot failed.");
          return;
        }

        setResult(data);
        return data as CopilotResult;
      } catch (error: any) {
        setMessage(error?.message || "Inspection Copilot failed.");
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [inspectionId, active]
  );

  useEffect(() => {
    if (!active) return;
    loadCopilot();

    const interval = window.setInterval(() => {
      loadCopilot();
    }, 20000);

    return () => window.clearInterval(interval);
  }, [loadCopilot]);

  const topIssues = useMemo(() => {
    if (!result) return [];
    return [...(result.priorityIssues || []), ...(result.contradictions || [])].slice(0, compact ? 4 : 8);
  }, [result, compact]);

  async function askCopilot(nextQuestion?: string, viaVoice = false) {
    const cleanQuestion = String(nextQuestion ?? question).trim();
    if (!cleanQuestion && result) return;
    setQuestion(cleanQuestion);
    const data = await loadCopilot(cleanQuestion);
    // Speak the answer if voice replies are on, or the question came in by voice.
    if ((voiceReplies || viaVoice) && data?.answer) speak(data.answer);
  }

  function toggleListening() {
    if (!voiceSupported) return;
    if (listening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      setListening(false);
      return;
    }
    try {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = "en-US";
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || "";
        setQuestion(transcript);
        if (transcript.trim()) void askCopilot(transcript, true);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  function toggleVoiceReplies() {
    setVoiceReplies((current) => {
      const next = !current;
      try {
        localStorage.setItem("copilot-voice-replies", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (!next && typeof window !== "undefined") window.speechSynthesis?.cancel();
      return next;
    });
  }

  async function reviewMyInspection() {
    setQuestion("Review my inspection before I leave. Give me a prioritized punch list of missing systems, photos, equipment data plates, limitations, weak findings, and contradictions.");
    await loadCopilot(
      "Review my inspection before I leave. Give me a prioritized punch list of missing systems, photos, equipment data plates, limitations, weak findings, and contradictions.",
    );
  }

  const score = result?.score ?? 0;

  return (
    <section ref={rootRef} className="rounded-2xl border border-indigo-500/40 bg-indigo-950/20 p-4 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">
            Inspection Copilot
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-white">
            Live AI Inspector Assistant
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#8a93a3]">
            Watches the full inspection for missing items, contradictions, related findings, confidence changes, and publish readiness.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reviewMyInspection}
            disabled={loading || !inspectionId}
            className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black transition active:scale-[0.98] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Reviewing..." : "Review My Inspection"}
          </button>

          <button
            type="button"
            onClick={() => loadCopilot(question)}
            disabled={loading || !inspectionId}
            className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Checking..." : "Refresh Copilot"}
          </button>
        </div>
      </div>

      {message && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-200">
          {message}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`rounded-xl border p-4 ${result ? scoreTone(score) : "border-[#232b38] bg-[#131923] text-[#8a93a3]"}`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
            Copilot Score
          </p>
          <p className="mt-1 text-3xl font-semibold">
            {result ? score : "—"}
            {result && <span className="text-base opacity-80"> / 100</span>}
          </p>
          <p className="mt-1 text-xs font-bold opacity-90">
            {result?.status || "Monitoring"}
          </p>
        </div>

        <SmallStat label="AI Confidence" value={result ? `${result.confidence}%` : "—"} />
        <SmallStat label="Findings" value={result?.findingCount ?? "—"} />
        <SmallStat label="Equipment" value={result?.equipmentCount ?? "—"} />
      </div>

      <div className="mt-5 rounded-xl border border-[#232b38] bg-[#131923] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
            Ask Copilot
          </p>
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleVoiceReplies}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                voiceReplies
                  ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                  : "border-[#232b38] text-[#8a93a3] hover:text-[#e8ecf3]"
              }`}
            >
              {voiceReplies ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              Voice replies {voiceReplies ? "on" : "off"}
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickQuestions().map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => askCopilot(item)}
              disabled={loading || !inspectionId}
              className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:opacity-60"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void askCopilot();
              }
            }}
            placeholder="Ask (or tap the mic): what still needs inspected, any contradictions, is it ready to publish..."
            className="min-w-0 flex-1 rounded-xl border border-[#232b38] bg-black px-3 py-3 text-sm text-white outline-none focus:border-indigo-400"
          />
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleListening}
              aria-label={listening ? "Stop listening" : "Ask by voice"}
              className={`shrink-0 rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${
                listening
                  ? "animate-pulse bg-red-500 hover:bg-red-400"
                  : "bg-indigo-500 hover:bg-indigo-400"
              }`}
            >
              {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => askCopilot()}
            disabled={loading || !inspectionId}
            className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:opacity-60"
          >
            Ask
          </button>
        </div>

        {result?.answer && (
          <div className="mt-3 whitespace-pre-line rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm leading-6 text-indigo-100">
            {result.answer}
          </div>
        )}
      </div>

      {result && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#232b38] bg-[#131923] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[#8a93a3]">
                Things To Review
              </h3>
              <span className="rounded-full border border-[#232b38] bg-black/30 px-2 py-1 text-xs font-semibold text-[#8a93a3]">
                {topIssues.length}
              </span>
            </div>

            {topIssues.length === 0 ? (
              <p className="mt-3 text-sm font-bold text-emerald-300">
                No major copilot review items detected.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {topIssues.map((item) => (
                  <IssueCard key={item.id} issue={item} />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#232b38] bg-[#131923] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[#8a93a3]">
                Missing Systems
              </h3>
              <span className="rounded-full border border-[#232b38] bg-black/30 px-2 py-1 text-xs font-semibold text-[#8a93a3]">
                {result.missingSystems.length}
              </span>
            </div>

            {result.missingSystems.length === 0 ? (
              <p className="mt-3 text-sm font-bold text-emerald-300">
                Core systems appear represented in saved data.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {result.missingSystems.map((system) => (
                  <span
                    key={system}
                    className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-200"
                  >
                    {system}
                  </span>
                ))}
              </div>
            )}

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-[#8a93a3]">
              Suggestions
            </h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#8a93a3]">
              {result.suggestions.map((item, index) => (
                <li key={index}>✓ {item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {result?.relatedFindings?.length ? (
        <div className="mt-5 rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-300">
            Possible Related Findings
          </h3>

          <div className="mt-3 grid gap-3">
            {result.relatedFindings.map((cluster) => (
              <div key={cluster.id} className="rounded-xl border border-[#232b38] bg-[#131923] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-white">{cluster.title}</p>
                  <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-200">
                    {cluster.confidence}% confidence
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#8a93a3]">{cluster.explanation}</p>
                <div className="mt-3 grid gap-2">
                  {cluster.findings.map((finding, index) => (
                    <div key={`${cluster.id}-${finding.id || index}`} className="rounded-lg border border-[#232b38] bg-black/30 px-3 py-2 text-xs text-[#8a93a3]">
                      <span className="font-semibold text-cyan-200">{finding.section || "General"}</span>
                      {" — "}
                      {finding.title}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs font-bold leading-5 text-cyan-100">
                  {cluster.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
