"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { inspectionTypeLabels } from "../lib/inspectionTypeLabels";

const BUILT_IN_OPTIONS = [
  { value: "home", label: "Home Inspection" },
  { value: "radon_only", label: "Radon Only" },
  { value: "mold_only", label: "Mold Only" },
  { value: "radon_mold", label: "Radon + Mold" },
  { value: "home_radon", label: "Home + Radon" },
  { value: "home_mold", label: "Home + Mold" },
  { value: "home_radon_mold", label: "Home + Radon + Mold" },
];

function serviceKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Report builder: change an existing job's service (e.g. a job created before
// the matching service existed), optionally re-picking the agreement while no
// one has signed.
export default function ChangeServicePanel({
  inspectionId,
  currentServiceMode,
}: {
  inspectionId: string;
  currentServiceMode?: string | null;
}) {
  const router = useRouter();
  const [custom, setCustom] = useState<{ value: string; label: string }[]>([]);
  const [value, setValue] = useState(serviceKey(currentServiceMode || "") || "home");
  const [swapAgreement, setSwapAgreement] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/pricing", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const services = Array.isArray(data?.config?.services) ? data.config.services : Array.isArray(data?.services) ? data.services : [];
        setCustom(
          services
            .filter((s: any) => !["home", "radon", "mold"].includes(String(s?.id)))
            .map((s: any) => ({ value: serviceKey(s?.name) || String(s?.id), label: String(s?.name || s?.id) }))
            .filter((s: any) => s.value),
        );
      })
      .catch(() => {});
  }, [open]);

  const options = useMemo(() => {
    const all = [...BUILT_IN_OPTIONS, ...custom];
    const current = serviceKey(currentServiceMode || "");
    if (current && !all.some((o) => o.value === current)) {
      all.push({ value: current, label: inspectionTypeLabels({ service_mode: current }).join(" + ") || current });
    }
    return all;
  }, [custom, currentServiceMode]);

  const currentLabel = inspectionTypeLabels({ service_mode: currentServiceMode || "home" }).join(" + ") || "Home Inspection";

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/inspections/change-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, serviceMode: value, swapAgreement }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not change the service.");
      const parts = ["Service updated."];
      if (data.agreementSwapped) parts.push(`Agreement switched to: ${(data.agreementTitles || []).join(", ")}.`);
      if (data.agreementNote) parts.push(data.agreementNote);
      parts.push("Check the price on the invoice if it should change.");
      setMessage({ tone: "ok", text: parts.join(" ") });
      router.refresh();
    } catch (error: any) {
      setMessage({ tone: "err", text: error?.message || "Could not change the service." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Service</p>
          <p className="mt-0.5 font-semibold text-[var(--fl-text)]">{currentLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-semibold text-[var(--fl-accent-text)]"
        >
          {open ? "Cancel" : "Change service"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm text-[var(--fl-text)]"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="flex items-start gap-2 text-sm text-[var(--fl-muted)]">
            <input
              type="checkbox"
              checked={swapAgreement}
              onChange={(e) => setSwapAgreement(e.target.checked)}
              className="mt-1 h-4 w-4 accent-teal-500"
            />
            <span>Also switch the agreement to match this service (only if the client hasn&apos;t signed yet)</span>
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="w-full rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save service"}
          </button>
        </div>
      )}
      {message && (
        <p className={`mt-3 text-sm font-semibold ${message.tone === "ok" ? "text-[var(--fl-good-text)]" : "text-[var(--fl-crit-text)]"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
