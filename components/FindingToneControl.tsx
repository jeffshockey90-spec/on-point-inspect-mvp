"use client";

import { useState } from "react";

type Fields = {
  title?: string;
  severity?: string;
  observation?: string;
  implication?: string;
  recommendation?: string;
};

type Applied = { observation: string; implication: string; recommendation: string };

// Inline "adjust how the AI wrote this finding" control. One-tap presets plus a
// free-text instruction. Rewrites wording/tone only — the endpoint refuses to
// downplay genuine safety issues. Used on the field tool + live camera review.
export default function FindingToneControl({
  fields,
  inspectionId,
  onApply,
  className = "",
}: {
  fields: Fields;
  inspectionId?: string | number | null;
  onApply: (f: Applied) => void;
  className?: string;
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [custom, setCustom] = useState("");

  async function run(preset: string, instruction = "") {
    if (busy) return;
    setBusy(preset || "custom");
    setErr("");
    try {
      const res = await fetch("/api/adjust-finding-tone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, preset, instruction, inspectionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not adjust.");
      } else {
        onApply({
          observation: data.observation ?? fields.observation ?? "",
          implication: data.implication ?? fields.implication ?? "",
          recommendation: data.recommendation ?? fields.recommendation ?? "",
        });
        setShowCustom(false);
        setCustom("");
      }
    } catch {
      setErr("Could not adjust — check your connection.");
    } finally {
      setBusy("");
    }
  }

  const chip =
    "rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-[var(--fl-accent-text)] transition active:scale-95 disabled:opacity-50";

  const presets: { key: string; label: string }[] = [
    { key: "calmer", label: "🫸 Less alarming" },
    { key: "shorter", label: "✂️ Shorter" },
    { key: "detailed", label: "➕ More detail" },
    { key: "simpler", label: "💬 Simpler" },
  ];

  return (
    <div className={`rounded-xl border border-teal-500/30 bg-teal-500/10 p-3 ${className}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
        Adjust the tone
      </p>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => run(p.key)}
            className={chip}
          >
            {busy === p.key ? "Rewriting…" : p.label}
          </button>
        ))}
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => setShowCustom((s) => !s)}
          className={chip}
        >
          ✍️ Tell it how…
        </button>
      </div>

      {showCustom && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder='e.g. "less scary but keep the safety note" or "mention it may be older"'
            className="flex-1 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface)] px-3 py-2 text-sm font-semibold text-[var(--fl-text)] placeholder:text-[var(--fl-faint)]"
          />
          <button
            type="button"
            disabled={Boolean(busy) || !custom.trim()}
            onClick={() => run("", custom.trim())}
            className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:opacity-50"
          >
            {busy === "custom" ? "Rewriting…" : "Apply"}
          </button>
        </div>
      )}

      {err && <p className="mt-2 text-xs font-bold text-[var(--fl-crit-text)]">{err}</p>}
      <p className="mt-2 text-[11px] leading-4 text-[var(--fl-faint)]">
        Rewrites wording only — it won’t downplay a real safety issue.
      </p>
    </div>
  );
}
