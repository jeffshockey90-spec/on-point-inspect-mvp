"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PRICING_CONFIG,
  PRICING_SERVICE_TYPE_OPTIONS,
  createCustomService,
  type InspectorPricingConfig,
  type PricingService,
  type PricingServiceType,
} from "../../../lib/inspectorPricing";

const DEFAULT_SERVICE_IDS = new Set(["home", "radon", "mold"]);

function NumberField({
  label,
  value,
  onChange,
  prefix = "$",
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  prefix?: string;
}) {
  return (
    <label className="block min-w-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-[#232b38] bg-[#0a0e13] px-3">
        {prefix && <span className="text-[#59626f]">{prefix}</span>}
        <input
          type="number"
          step="0.01"
          min="0"
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full min-w-0 bg-transparent p-3 pl-0 text-white outline-none"
        />
      </div>
    </label>
  );
}

export default function PricingEditor({
  endpoint = "/api/pricing",
  mode = "personal",
}: {
  endpoint?: string;
  mode?: "personal" | "company";
} = {}) {
  const [config, setConfig] = useState<InspectorPricingConfig | null>(null);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    fetch(endpoint, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setConfig(data.config || DEFAULT_PRICING_CONFIG);
        setSource(data.source || "");
      })
      .catch(() => setConfig(DEFAULT_PRICING_CONFIG))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  async function handleRevert() {
    setReverting(true);
    setError("");
    try {
      const res = await fetch("/api/pricing", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not reset pricing.");
      setSaved(false);
      load();
    } catch (err: any) {
      setError(err?.message || "Could not reset pricing.");
    } finally {
      setReverting(false);
    }
  }

  function updateService(id: string, patch: Partial<PricingService>) {
    setConfig((current) => {
      if (!current) return current;

      return {
        ...current,
        services: current.services.map((service) =>
          service.id === id ? { ...service, ...patch } : service,
        ),
      };
    });

    setSaved(false);
  }

  function getService(id: string) {
    return config?.services.find((service) => service.id === id) || null;
  }

  function addService(type: PricingServiceType) {
    setConfig((current) => {
      if (!current) return current;
      return { ...current, services: [...current.services, createCustomService(type)] };
    });
    setSaved(false);
  }

  function removeService(id: string) {
    setConfig((current) => {
      if (!current) return current;
      return { ...current, services: current.services.filter((service) => service.id !== id) };
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!config) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save pricing.");

      setSaved(true);
      setSource(mode === "company" ? "company" : "override");
    } catch (err: any) {
      setError(err?.message || "Could not save pricing.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-8 text-center text-[#8a93a3]">
        Loading your pricing...
      </div>
    );
  }

  const home = getService("home");
  const radon = getService("radon");
  const mold = getService("mold");
  const customServices = (config?.services || []).filter(
    (service) => !DEFAULT_SERVICE_IDS.has(service.id),
  );

  return (
    <div className="space-y-6">
      {mode === "company" && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 text-sm text-amber-200">
          This is your <span className="font-semibold">company price sheet</span>. Every
          inspector on your team uses it unless they set their own override.
        </div>
      )}

      {mode === "personal" && source === "override" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-500/40 bg-teal-950/20 p-4 text-sm text-teal-200">
          <span className="font-bold">
            You have a personal price override — these rates apply to your jobs
            instead of the company pricing.
          </span>
          <button
            type="button"
            onClick={handleRevert}
            disabled={reverting}
            className="shrink-0 rounded-lg border border-teal-500/50 px-3 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/10 disabled:opacity-60"
          >
            {reverting ? "Resetting..." : "Use company pricing instead"}
          </button>
        </div>
      )}

      {mode === "personal" && source === "company" && (
        <div className="rounded-xl border border-[#232b38] bg-[#10151e] p-4 text-sm text-[#8a93a3]">
          You're currently using your{" "}
          <span className="font-semibold text-white">company's pricing</span>. Saving here
          creates a personal override that applies only to your jobs.
        </div>
      )}

      {mode === "personal" && source === "default" && (
        <div className="rounded-xl border border-[#232b38] bg-[#10151e] p-4 text-sm text-[#8a93a3]">
          You're using the <span className="font-semibold text-white">default</span> pricing.
          Save to set your own rates.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-4 text-sm font-bold text-red-300">
          {error}
        </div>
      )}

      {saved && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-sm font-bold text-emerald-300">
          Pricing saved. The Quotes calculator will use these rates.
        </div>
      )}

      {home && (
        <section className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-teal-300">Home Inspection</h2>
          <p className="mt-2 text-sm leading-6 text-[#8a93a3]">
            A base price up to a square footage limit, then a step-up amount for every block of
            square footage over that.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Base Price"
              value={home.basePrice}
              onChange={(value) => updateService("home", { basePrice: value })}
            />
            <NumberField
              label="Up To (Sqft)"
              prefix=""
              value={home.baseSqftLimit}
              onChange={(value) => updateService("home", { baseSqftLimit: value })}
            />
            <NumberField
              label="Then Add"
              value={home.incrementPrice}
              onChange={(value) => updateService("home", { incrementPrice: value })}
            />
            <NumberField
              label="Per Every (Sqft)"
              prefix=""
              value={home.incrementSqftBlock}
              onChange={(value) => updateService("home", { incrementSqftBlock: value })}
            />
          </div>

          <p className="mt-4 text-xs text-[#59626f]">
            Example: ${home.basePrice || 0} for up to {home.baseSqftLimit || 0} sqft, then +$
            {home.incrementPrice || 0} for every {home.incrementSqftBlock || 0} sqft over that.
          </p>
        </section>
      )}

      {radon && (
        <section className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-teal-300">Radon Test</h2>
          <p className="mt-2 text-sm leading-6 text-[#8a93a3]">
            A flat fee. You can charge less when radon testing is booked alongside a home
            inspection.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Standalone Price"
              value={radon.flatPrice}
              onChange={(value) => updateService("radon", { flatPrice: value })}
            />
            <NumberField
              label="Price When Paired With Home Inspection"
              value={radon.pairedPrice}
              onChange={(value) => updateService("radon", { pairedPrice: value })}
            />
          </div>
        </section>
      )}

      {mold && (
        <section className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-teal-300">Mold Testing</h2>
          <p className="mt-2 text-sm leading-6 text-[#8a93a3]">
            A setup fee plus a fee per air/surface sample collected. The setup fee can be lower
            when paired with a home inspection.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <NumberField
              label="Standalone Setup Fee"
              value={mold.baseFee}
              onChange={(value) => updateService("mold", { baseFee: value })}
            />
            <NumberField
              label="Setup Fee When Paired"
              value={mold.pairedBaseFee}
              onChange={(value) => updateService("mold", { pairedBaseFee: value })}
            />
            <NumberField
              label="Fee Per Sample"
              value={mold.perUnitFee}
              onChange={(value) => updateService("mold", { perUnitFee: value })}
            />
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-teal-300">Custom Services</h2>
        <p className="mt-2 text-sm leading-6 text-[#8a93a3]">
          Add any service beyond Home, Radon, and Mold - sewer scope, well testing, termite
          inspection, whatever you offer. Each one can be a flat fee, a flat fee plus a per-unit
          fee, or its own square-footage formula.
        </p>

        <div className="mt-5 space-y-5">
          {customServices.map((service) => (
            <CustomServiceCard
              key={service.id}
              service={service}
              onChange={(patch) => updateService(service.id, patch)}
              onRemove={() => removeService(service.id)}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#1a212c] pt-5">
          <span className="text-sm font-bold text-[#8a93a3]">Add a new service:</span>
          {PRICING_SERVICE_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => addService(option.value)}
              className="rounded-xl border border-teal-500/50 px-4 py-2 text-sm font-semibold text-teal-300 hover:bg-teal-500/10"
            >
              + {option.label}
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-xl bg-teal-500 px-8 py-4 font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-60 sm:w-auto"
      >
        {saving ? "Saving..." : "Save Pricing"}
      </button>
    </div>
  );
}

function CustomServiceCard({
  service,
  onChange,
  onRemove,
}: {
  service: PricingService;
  onChange: (patch: Partial<PricingService>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#232b38] bg-[#0a0e13] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <label className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
            Service Name
          </p>
          <input
            type="text"
            value={service.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#10151e] p-3 text-white outline-none focus:border-teal-400"
          />
        </label>

        <button
          type="button"
          onClick={onRemove}
          className="mt-6 shrink-0 rounded-xl border border-red-500/50 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10"
        >
          Remove
        </button>
      </div>

      {service.type === "sqft_formula" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Base Price"
            value={service.basePrice}
            onChange={(value) => onChange({ basePrice: value })}
          />
          <NumberField
            label="Up To (Sqft)"
            prefix=""
            value={service.baseSqftLimit}
            onChange={(value) => onChange({ baseSqftLimit: value })}
          />
          <NumberField
            label="Then Add"
            value={service.incrementPrice}
            onChange={(value) => onChange({ incrementPrice: value })}
          />
          <NumberField
            label="Per Every (Sqft)"
            prefix=""
            value={service.incrementSqftBlock}
            onChange={(value) => onChange({ incrementSqftBlock: value })}
          />
        </div>
      )}

      {service.type === "flat" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Standalone Price"
            value={service.flatPrice}
            onChange={(value) => onChange({ flatPrice: value })}
          />
          <NumberField
            label="Price When Paired With Home Inspection (Optional)"
            value={service.pairedPrice}
            onChange={(value) => onChange({ pairedPrice: value })}
          />
        </div>
      )}

      {service.type === "flat_plus_per_unit" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Standalone Setup Fee"
            value={service.baseFee}
            onChange={(value) => onChange({ baseFee: value })}
          />
          <NumberField
            label="Setup Fee When Paired (Optional)"
            value={service.pairedBaseFee}
            onChange={(value) => onChange({ pairedBaseFee: value })}
          />
          <NumberField
            label="Fee Per Unit"
            value={service.perUnitFee}
            onChange={(value) => onChange({ perUnitFee: value })}
          />
          <label className="block min-w-0 sm:col-span-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
              Unit Label (e.g. "sample", "hour")
            </p>
            <input
              type="text"
              value={service.unitLabel || ""}
              onChange={(e) => onChange({ unitLabel: e.target.value })}
              className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#10151e] p-3 text-white outline-none focus:border-teal-400"
            />
          </label>
        </div>
      )}
    </div>
  );
}
