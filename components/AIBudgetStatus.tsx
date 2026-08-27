"use client";

import { useEffect, useState } from "react";

type BudgetStatus = {
  startingBalanceUsd: number;
  thresholdUsd: number;
  balanceSetAt: string;
  lastAlertSentAt: string | null;
  spentSinceSetUsd: number;
  remainingUsd: number;
  low: boolean;
};

function money(value: number) {
  return value < 0 ? `-$${Math.abs(value).toFixed(2)}` : `$${value.toFixed(2)}`;
}

export default function AIBudgetStatus() {
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("2");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai-budget/status");
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Failed to load AI budget.");
      setStatus(json.status);
      setThresholdInput(String(json.status.thresholdUsd));
    } catch (err: any) {
      setError(err?.message || "Failed to load AI budget.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    const startingBalanceUsd = Number(balanceInput);
    const thresholdUsd = Number(thresholdInput);

    if (!Number.isFinite(startingBalanceUsd) || startingBalanceUsd < 0) {
      setError("Enter a valid balance amount.");
      return;
    }
    if (!Number.isFinite(thresholdUsd) || thresholdUsd < 0) {
      setError("Enter a valid alert threshold.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/ai-budget/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingBalanceUsd, thresholdUsd }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Failed to save.");
      setStatus(json.status);
      setEditing(false);
      setBalanceInput("");
    } catch (err: any) {
      setError(err?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const tone = !status
    ? "border-[var(--fl-line)] bg-[var(--fl-surface)]"
    : status.low
      ? "border-red-500/50 bg-red-950/20"
      : status.remainingUsd < status.thresholdUsd * 2
        ? "border-yellow-500/50 bg-yellow-950/20"
        : "border-teal-500/40 bg-teal-950/20";

  return (
    <section className={`rounded-2xl border p-6 shadow-xl ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            AI Budget (OpenAI Balance)
          </p>

          {loading ? (
            <p className="mt-3 text-lg text-[var(--fl-muted)]">Loading...</p>
          ) : status ? (
            <>
              <p className="mt-3 text-4xl font-semibold text-[var(--fl-text)]">
                {money(status.remainingUsd)}
                <span className="ml-2 text-sm font-bold text-[var(--fl-muted)]">remaining</span>
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--fl-muted)]">
                {money(status.spentSinceSetUsd)} spent since balance was last set &middot; alert threshold {money(status.thresholdUsd)}
              </p>
              {status.low && (
                <p className="mt-2 text-sm font-semibold text-red-300">
                  ⚠️ Balance is at or below your alert threshold.
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-red-300">{error || "Unable to load AI budget."}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setEditing((current) => !current);
            setError("");
          }}
          className="rounded-xl border border-[var(--fl-faint)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)] transition hover:bg-slate-700/30"
        >
          {editing ? "Cancel" : "Update Balance"}
        </button>
      </div>

      {editing && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:items-end">
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
              Current OpenAI balance ($)
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={balanceInput}
              onChange={(event) => setBalanceInput(event.target.value)}
              placeholder="e.g. 25.00"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-[var(--fl-text)] outline-none focus:border-cyan-400"
            />
          </label>

          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
              Alert me when under ($)
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={thresholdInput}
              onChange={(event) => setThresholdInput(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-[var(--fl-text)] outline-none focus:border-cyan-400"
            />
          </label>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-emerald-400 px-4 py-2.5 font-semibold text-black disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}

      {error && !loading && (
        <p className="mt-4 rounded-lg border border-red-500/50 bg-red-950/60 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
