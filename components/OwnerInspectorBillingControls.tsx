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
  const dollars = number / 100;
  // Preserve cents (e.g. 3999 -> "39.99"), only drop them when whole (69).
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

function dollarsToCents(value: string) {
  const number = Number(String(value || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number * 100);
}

// "$39.99" when there are cents, "$69" when whole — never rounds 39.99 to 40.
function formatDollars(cents: any) {
  const dollars = (Number(cents) || 0) / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
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
  standardPriceCents?: any;
  foundingMemberPriceCents?: any;
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
  standardPriceCents,
  foundingMemberPriceCents,
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
  // Defaults come from the owner's GLOBAL subscription pricing, not a hardcoded
  // $69/$49, so a new inspector with no override shows (and is charged) the
  // current plan price.
  const standardCents = Number(standardPriceCents) || 6900;
  const foundingCents = Number(foundingMemberPriceCents) || 4900;
  const priceCents = exempt
    ? 0
    : dollarsToCents(customPrice) || (founding ? foundingCents : standardCents);
  const priceLabel = exempt ? "Free" : `${formatDollars(priceCents)}/month`;

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
    <div className="h-auto min-h-0 w-full min-w-0 overflow-hidden rounded-2xl border border-[#232b38] bg-[#131923] p-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#59626f]">Billing</p>
        <p className="mt-1 break-words text-xl font-semibold text-white">{priceLabel}</p>
        <p className="mt-1 break-words text-sm font-bold leading-6 text-[#8a93a3]">
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
          helper={`${formatDollars(foundingCents)}/month instead of the standard plan.`}
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
        className="mt-4 min-h-[48px] w-full rounded-xl bg-teal-500 px-4 py-3 text-center font-semibold text-slate-950 transition hover:bg-teal-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Saving Billing..." : "Save Billing"}
      </button>

      {message ? <p className="mt-3 break-words text-xs font-bold text-[#8a93a3]">{message}</p> : null}
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
      className="flex w-full items-center gap-3 rounded-xl border border-[#232b38] bg-[#131923] p-3 text-left transition hover:border-teal-400/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm font-semibold ${
          checked
            ? "border-teal-400 bg-teal-400 text-slate-950"
            : "border-[#59626f] bg-white text-transparent"
        }`}
      >
        {checked ? "✓" : ""}
      </span>

      <span className="block min-w-0">
        <span className="block break-words text-sm font-semibold leading-5 text-white">
          {title}
        </span>

        <span className="mt-1 block break-words text-xs font-bold leading-5 text-[#8a93a3]">
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
      className="min-h-[46px] w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] px-4 py-3 text-base font-bold text-white outline-none transition placeholder:text-[#59626f] focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
