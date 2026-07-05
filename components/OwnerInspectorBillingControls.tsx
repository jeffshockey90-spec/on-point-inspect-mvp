"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

function toBool(value: any, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function toDollars(cents: any) {
  const number = Number(cents || 0);
  if (!Number.isFinite(number) || number <= 0) return "";
  return String(Math.round(number / 100));
}

function dollarsToCents(value: string) {
  const number = Number(String(value || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number * 100);
}

type Props = {
  userId: string;
  email?: string;
  subscriptionStatus?: any;
  subscriptionRequired?: any;
  subscriptionExempt?: any;
  subscriptionExemptReason?: any;
  subscriptionPriceOverrideCents?: any;
  subscriptionPriceOverrideReason?: any;
  freeInspectionLimit?: any;
  freeInspectionsUsed?: any;
  foundingMember?: any;
};

export default function OwnerInspectorBillingControls({
  userId,
  email,
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [required, setRequired] = useState(() => toBool(subscriptionRequired, true));
  const [exempt, setExempt] = useState(() => toBool(subscriptionExempt, false));
  const [founding, setFounding] = useState(() => toBool(foundingMember, false));
  const [customPrice, setCustomPrice] = useState(() => toDollars(subscriptionPriceOverrideCents));
  const [freeLimit, setFreeLimit] = useState(() => String(Number(freeInspectionLimit ?? 3) || 3));
  const [exemptReason, setExemptReason] = useState(() => String(subscriptionExemptReason || ""));
  const [customPriceReason, setCustomPriceReason] = useState(() => String(subscriptionPriceOverrideReason || ""));

  const busy = saving || isPending;
  const statusText = String(subscriptionStatus || "inactive");
  const used = Number(freeInspectionsUsed ?? 0) || 0;
  const limit = Number(freeLimit || 3) || 3;
  const priceCents = exempt ? 0 : dollarsToCents(customPrice) || (founding ? 4900 : 6900);
  const priceLabel = exempt ? "Free" : `$${Math.round(priceCents / 100)}/month`;

  async function saveBilling() {
    if (busy) return;

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/owner/users/action/inspectors/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          email,
          subscriptionRequired: required,
          subscriptionExempt: exempt,
          foundingMember: founding,
          subscriptionPriceOverrideCents: dollarsToCents(customPrice),
          subscriptionPriceOverrideReason: customPriceReason.trim(),
          freeInspectionLimit: limit,
          subscriptionExemptReason: exemptReason.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save billing.");

      setMessage(data.message || "Billing saved.");
      startTransition(() => router.refresh());
    } catch (error: any) {
      setMessage(error?.message || "Failed to save billing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-auto min-h-0 w-full min-w-0 overflow-hidden rounded-2xl border border-slate-700 bg-[#020617]/70 p-4">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Billing</p>
        <p className="mt-1 break-words text-xl font-black text-white">{priceLabel}</p>
        <p className="mt-1 break-words text-sm font-bold leading-6 text-slate-400">
          Status: {statusText} · Free used: {used}/{limit}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <ToggleRow
          checked={required}
          onChange={setRequired}
          title="Subscription required"
          helper="Require paid subscription after free inspections."
          disabled={busy}
        />

        <ToggleRow
          checked={exempt}
          onChange={setExempt}
          title="Free / exempt inspector"
          helper="Inspector can use the app without subscription billing."
          disabled={busy}
        />

        <ToggleRow
          checked={founding}
          onChange={setFounding}
          title="Founding member"
          helper="$49/month instead of the standard plan."
          disabled={busy || exempt}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Input
          value={customPrice}
          onChange={setCustomPrice}
          placeholder="Custom monthly price, example: 59"
          inputMode="decimal"
          disabled={busy || exempt}
        />

        <Input
          value={freeLimit}
          onChange={setFreeLimit}
          placeholder="Free inspection limit"
          inputMode="numeric"
          disabled={busy}
        />

        <Input
          value={exemptReason}
          onChange={setExemptReason}
          placeholder="Exempt reason"
          disabled={busy || !exempt}
        />

        <Input
          value={customPriceReason}
          onChange={setCustomPriceReason}
          placeholder="Custom price reason"
          disabled={busy || exempt || !customPrice.trim()}
        />
      </div>

      <button
        type="button"
        onClick={saveBilling}
        disabled={busy}
        className="mt-4 min-h-[48px] w-full rounded-xl bg-teal-500 px-4 py-3 text-center font-black text-slate-950 transition hover:bg-teal-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Saving Billing..." : "Save Billing"}
      </button>

      {message ? <p className="mt-3 break-words text-xs font-bold text-slate-400">{message}</p> : null}
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  title,
  helper,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  helper: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-left transition hover:border-teal-400/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm font-black ${
          checked
            ? "border-teal-400 bg-teal-400 text-slate-950"
            : "border-slate-500 bg-white text-transparent"
        }`}
      >
        {checked ? "✓" : ""}
      </span>

      <span className="block min-w-0">
        <span className="block break-words text-sm font-black leading-5 text-white">
          {title}
        </span>

        <span className="mt-1 block break-words text-xs font-bold leading-5 text-slate-400">
          {helper}
        </span>
      </span>
    </button>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  inputMode,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "text" | "numeric" | "decimal";
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      inputMode={inputMode || "text"}
      disabled={disabled}
      className="min-h-[46px] w-full min-w-0 rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-base font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
