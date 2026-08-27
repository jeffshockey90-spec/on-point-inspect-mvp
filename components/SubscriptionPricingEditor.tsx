"use client";

import { useEffect, useState } from "react";

type Pricing = {
  standardPriceCents: number;
  foundingMemberPriceCents: number;
  updatedAt: string | null;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function SubscriptionPricingEditor() {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [standardInput, setStandardInput] = useState("");
  const [foundingInput, setFoundingInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/subscription-pricing/status");
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Failed to load pricing.");
      setPricing(json.pricing);
      setStandardInput((json.pricing.standardPriceCents / 100).toFixed(2));
      setFoundingInput((json.pricing.foundingMemberPriceCents / 100).toFixed(2));
    } catch (err: any) {
      setError(err?.message || "Failed to load pricing.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    const standardPriceCents = Math.round(Number(standardInput) * 100);
    const foundingMemberPriceCents = Math.round(Number(foundingInput) * 100);

    if (!Number.isFinite(standardPriceCents) || standardPriceCents < 50) {
      setError("Enter a valid standard price (at least $0.50).");
      return;
    }
    if (!Number.isFinite(foundingMemberPriceCents) || foundingMemberPriceCents < 50) {
      setError("Enter a valid founding-member price (at least $0.50).");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/subscription-pricing/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ standardPriceCents, foundingMemberPriceCents }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Failed to save.");
      setPricing(json.pricing);
      setEditing(false);
    } catch (err: any) {
      setError(err?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-6 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
            Subscription Pricing
          </p>

          {loading ? (
            <p className="mt-3 text-lg text-[var(--fl-muted)]">Loading...</p>
          ) : pricing ? (
            <>
              <p className="mt-3 text-3xl font-semibold text-[var(--fl-text)]">
                {money(pricing.standardPriceCents)}
                <span className="ml-2 text-sm font-bold text-[var(--fl-muted)]">/mo standard</span>
              </p>
              <p className="mt-2 text-sm text-[var(--fl-muted)]">
                {money(pricing.foundingMemberPriceCents)}/mo founding-member rate
              </p>
              <p className="mt-2 text-xs text-[var(--fl-faint)]">
                Live on /pricing and the actual Stripe checkout - changing this changes what new
                subscribers get charged.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-red-300">{error || "Unable to load pricing."}</p>
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
          {editing ? "Cancel" : "Edit Pricing"}
        </button>
      </div>

      {editing && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:items-end">
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
              Standard price ($/mo)
            </span>
            <input
              type="number"
              min="0.50"
              step="0.01"
              value={standardInput}
              onChange={(event) => setStandardInput(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-[var(--fl-text)] outline-none focus:border-cyan-400"
            />
          </label>

          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
              Founding-member price ($/mo)
            </span>
            <input
              type="number"
              min="0.50"
              step="0.01"
              value={foundingInput}
              onChange={(event) => setFoundingInput(event.target.value)}
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
