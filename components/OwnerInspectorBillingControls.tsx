"use client";

import { useState } from "react";

type Props = {
  userId: string;
  email?: string;
  subscriptionStatus?: string | null;
  subscriptionRequired?: boolean | null;
  subscriptionExempt?: boolean | null;
  subscriptionExemptReason?: string | null;
  subscriptionPriceOverrideCents?: number | null;
  subscriptionPriceOverrideReason?: string | null;
  freeInspectionLimit?: number | null;
  freeInspectionsUsed?: number | null;
  foundingMember?: boolean | null;
};

const DEFAULT_MONTHLY_PRICE = 69;

export default function OwnerInspectorBillingControls({
  userId,
  subscriptionStatus,
  subscriptionRequired,
  subscriptionExempt,
  subscriptionExemptReason,
  subscriptionPriceOverrideCents,
  subscriptionPriceOverrideReason,
  freeInspectionLimit,
  freeInspectionsUsed,
  foundingMember,
}: Props) {
  const [required, setRequired] = useState(subscriptionRequired ?? true);
  const [exempt, setExempt] = useState(subscriptionExempt ?? false);
  const [founding, setFounding] = useState(foundingMember ?? false);
  const [customPrice, setCustomPrice] = useState(
    subscriptionPriceOverrideCents ? String(subscriptionPriceOverrideCents / 100) : ""
  );
  const [reason, setReason] = useState(subscriptionExemptReason || "");
  const [priceReason, setPriceReason] = useState(subscriptionPriceOverrideReason || "");
  const [limit, setLimit] = useState(String(freeInspectionLimit ?? 3));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/owner/users/action/inspectors/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          subscription_required: required,
          subscription_exempt: exempt,
          subscription_exempt_reason: reason,
          subscription_price_override_cents: customPrice
            ? Math.round(Number(customPrice) * 100)
            : null,
          subscription_price_override_reason: priceReason,
          free_inspection_limit: Number(limit || 3),
          founding_member: founding,
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || "Could not save.");

      setMessage("Saved");
    } catch (err: any) {
      setMessage(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const displayPrice = exempt
    ? "Free"
    : customPrice
      ? `$${customPrice}/mo`
      : founding
        ? "$49/mo founding"
        : `$${DEFAULT_MONTHLY_PRICE}/mo`;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
      <div>
        <p className="text-xs font-black uppercase text-slate-400">Billing</p>
        <p className="text-sm font-black text-white">{displayPrice}</p>
        <p className="text-xs text-slate-400">
          Status: {subscriptionStatus || "inactive"} · Free used:{" "}
          {freeInspectionsUsed ?? 0}/{limit || 3}
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        Subscription required after free inspections
      </label>

      <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
        <input
          type="checkbox"
          checked={exempt}
          onChange={(e) => setExempt(e.target.checked)}
        />
        Free / exempt inspector
      </label>

      <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
        <input
          type="checkbox"
          checked={founding}
          onChange={(e) => setFounding(e.target.checked)}
        />
        Founding member $49/month
      </label>

      <input
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        placeholder="Custom monthly price, example: 59"
        value={customPrice}
        onChange={(e) => setCustomPrice(e.target.value)}
      />

      <input
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        placeholder="Free inspection limit"
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
      />

      <input
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        placeholder="Exempt reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      <input
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        placeholder="Custom price reason"
        value={priceReason}
        onChange={(e) => setPriceReason(e.target.value)}
      />

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-lg bg-teal-500 px-3 py-2 text-sm font-black text-slate-950 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save Billing"}
      </button>

      {message && <p className="text-xs font-bold text-teal-300">{message}</p>}
    </div>
  );
}