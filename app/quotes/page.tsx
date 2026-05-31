"use client";

import { useMemo, useState } from "react";
import { Card } from "../../components/Card";

type ServiceMode =
  | "home"
  | "radon_only"
  | "mold_only"
  | "radon_mold"
  | "home_radon"
  | "home_mold"
  | "home_radon_mold";

const serviceOptions: { value: ServiceMode; label: string }[] = [
  { value: "home", label: "Home Inspection" },
  { value: "radon_only", label: "Radon Only" },
  { value: "mold_only", label: "Mold Only" },
  { value: "radon_mold", label: "Radon + Mold" },
  { value: "home_radon", label: "Home + Radon" },
  { value: "home_mold", label: "Home + Mold" },
  { value: "home_radon_mold", label: "Home + Radon + Mold" },
];

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function calculateHomeInspectionPrice(squareFeet: number) {
  const sqft = getNumber(squareFeet);

  if (!sqft || sqft <= 0) return 500;
  if (sqft <= 2000) return 500;

  return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
}

function hasHomeInspection(serviceMode: ServiceMode) {
  return (
    serviceMode === "home" ||
    serviceMode === "home_radon" ||
    serviceMode === "home_mold" ||
    serviceMode === "home_radon_mold"
  );
}

function hasRadon(serviceMode: ServiceMode) {
  return (
    serviceMode === "radon_only" ||
    serviceMode === "radon_mold" ||
    serviceMode === "home_radon" ||
    serviceMode === "home_radon_mold"
  );
}

function hasMold(serviceMode: ServiceMode) {
  return (
    serviceMode === "mold_only" ||
    serviceMode === "radon_mold" ||
    serviceMode === "home_mold" ||
    serviceMode === "home_radon_mold"
  );
}

function getServiceLabel(serviceMode: ServiceMode) {
  return (
    serviceOptions.find((option) => option.value === serviceMode)?.label ||
    "Home Inspection"
  );
}

function calculateQuote({
  sqft,
  serviceMode,
  moldAirSamples,
  moldSurfaceSamples,
  travelFee,
  discount,
}: {
  sqft: number;
  serviceMode: ServiceMode;
  moldAirSamples: number;
  moldSurfaceSamples: number;
  travelFee: number;
  discount: number;
}) {
  const includesHome = hasHomeInspection(serviceMode);
  const includesRadon = hasRadon(serviceMode);
  const includesMold = hasMold(serviceMode);

  const base = includesHome ? calculateHomeInspectionPrice(sqft) : 0;
  const radonFee = includesRadon ? (includesHome ? 175 : 225) : 0;

  const airSamples = includesMold
    ? Math.max(0, Math.floor(getNumber(moldAirSamples)))
    : 0;
  const surfaceSamples = includesMold
    ? Math.max(0, Math.floor(getNumber(moldSurfaceSamples)))
    : 0;

  const totalMoldSamples = airSamples + surfaceSamples;

  const moldSetupFee = includesMold ? (includesHome ? 175 : 225) : 0;
  const moldAirFee = airSamples * 75;
  const moldSurfaceFee = surfaceSamples * 75;
  const moldFee = moldSetupFee + moldAirFee + moldSurfaceFee;

  const safeTravelFee = Math.max(0, getNumber(travelFee));
  const safeDiscount = Math.max(0, getNumber(discount));

  const subtotal = base + radonFee + moldFee + safeTravelFee;
  const total = Math.max(0, subtotal - safeDiscount);

  return {
    base,
    radonFee,
    moldSetupFee,
    moldAirFee,
    moldSurfaceFee,
    moldFee,
    airSamples,
    surfaceSamples,
    totalMoldSamples,
    travelFee: safeTravelFee,
    discount: safeDiscount,
    subtotal,
    total,
    includesHome,
    includesRadon,
    includesMold,
    serviceLabel: getServiceLabel(serviceMode),
  };
}

export default function QuotePage() {
  const [sqft, setSqft] = useState(2500);
  const [serviceMode, setServiceMode] = useState<ServiceMode>("home");
  const [travelFee, setTravelFee] = useState(0);
  const [moldAirSamples, setMoldAirSamples] = useState(0);
  const [moldSurfaceSamples, setMoldSurfaceSamples] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [creating, setCreating] = useState(false);

  const quote = useMemo(
    () =>
      calculateQuote({
        sqft,
        serviceMode,
        moldAirSamples,
        moldSurfaceSamples,
        travelFee,
        discount,
      }),
    [sqft, serviceMode, moldAirSamples, moldSurfaceSamples, travelFee, discount]
  );

  const selectedAddOns = [
    quote.includesHome ? "Home inspection" : "",
    quote.includesRadon ? "Radon testing" : "",
    quote.includesMold && quote.airSamples > 0
      ? `${quote.airSamples} mold air sample${quote.airSamples === 1 ? "" : "s"}`
      : "",
    quote.includesMold && quote.surfaceSamples > 0
      ? `${quote.surfaceSamples} mold surface sample${
          quote.surfaceSamples === 1 ? "" : "s"
        }`
      : "",
  ].filter(Boolean);

  const message = `Hi, this is Jeff with On Point Home Inspections. For this property, the quote is $${quote.total}. Services selected: ${
    selectedAddOns.length > 0 ? selectedAddOns.join(", ") : quote.serviceLabel
  }. This includes a clear digital report for the selected service(s).`;

  async function copyQuote() {
    await navigator.clipboard.writeText(message);
    alert("Quote message copied");
  }

  async function convertToInspection() {
    try {
      setCreating(true);

      const services = quote.serviceLabel;

      const res = await fetch("/api/create-inspection-from-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          square_feet: quote.includesHome ? sqft : null,
          sqft: quote.includesHome ? sqft : null,
          price: quote.total,
          invoice_amount: quote.total,
          balance_due: quote.total,
          amount_paid: 0,
          service_mode: serviceMode,
          radon: quote.includesRadon,
          radon_fee: quote.radonFee,
          mold: quote.includesMold,
          mold_air_samples: quote.airSamples,
          mold_surface_samples: quote.surfaceSamples,
          mold_setup_fee: quote.moldSetupFee,
          mold_fee: quote.moldFee,
          travel_fee: quote.travelFee,
          discount: quote.discount,
          services,
          inspection_type: services,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to create inspection");
        return;
      }

      window.location.href = `/inspections/${data.id}`;
    } catch (err) {
      console.error(err);
      alert("Error creating inspection");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050816] px-4 pb-24 pt-6 text-white md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-zinc-800 bg-[#0b1220] p-6 md:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-teal-400">
            On Point Home Inspections
          </p>

          <h1 className="mt-2 text-4xl font-black md:text-5xl">
            Quote Calculator
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
            Generate pricing for home inspections, radon-only tests, mold-only
            sampling, Radon + Mold, and bundled services.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card title="Build Quote">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-bold text-zinc-300">
                  Service Type
                </span>
                <select
                  value={serviceMode}
                  onChange={(e) => setServiceMode(e.target.value as ServiceMode)}
                  className="w-full rounded-xl border border-zinc-700 bg-black p-3 text-white"
                >
                  {serviceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {quote.includesHome && (
                <Input
                  label="Square Footage"
                  value={sqft}
                  onChange={setSqft}
                />
              )}

              <Input
                label="Travel Fee"
                value={travelFee}
                onChange={setTravelFee}
              />

              {quote.includesMold && (
                <div className="rounded-2xl border border-zinc-700 bg-black p-4 md:col-span-2">
                  <div className="mb-4">
                    <p className="font-bold text-white">Mold Sampling</p>
                    <p className="text-sm leading-6 text-zinc-400">
                      {quote.includesHome
                        ? "$175 setup/admin fee with inspection"
                        : "$225 standalone setup/admin fee"}
                      , plus $75 per air sample and $75 per
                      surface/tape/swab sample.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      label="Mold Air Samples"
                      value={moldAirSamples}
                      onChange={setMoldAirSamples}
                    />

                    <Input
                      label="Mold Surface / Tape / Swab Samples"
                      value={moldSurfaceSamples}
                      onChange={setMoldSurfaceSamples}
                    />
                  </div>
                </div>
              )}

              <div className="md:col-span-2">
                <Input
                  label="Discount"
                  value={discount}
                  onChange={setDiscount}
                />
              </div>
            </div>
          </Card>

          <Card title="Quote Summary">
            <div className="space-y-3 text-zinc-300">
              <SummaryLine label="Home Inspection" value={quote.base} />
              <SummaryLine label="Radon" value={quote.radonFee} />
              <SummaryLine label="Mold Setup/Admin" value={quote.moldSetupFee} />
              <SummaryLine label="Mold Air Samples" value={quote.moldAirFee} />
              <SummaryLine
                label="Mold Surface Samples"
                value={quote.moldSurfaceFee}
              />
              <SummaryLine label="Travel Fee" value={quote.travelFee} />
              <SummaryLine label="Discount" value={-quote.discount} />

              <div className="mt-5 rounded-2xl border border-teal-700 bg-teal-500/10 p-5">
                <p className="text-sm font-bold uppercase tracking-wide text-zinc-400">
                  Total Quote
                </p>

                <p className="mt-1 text-5xl font-black text-teal-400">
                  ${quote.total}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4 text-sm leading-6 text-zinc-400">
                <p className="font-bold text-white">Pricing Rules</p>
                <p className="mt-2">
                  Home inspection is $500 up to 2,000 sq ft, then +$50 per
                  additional 1,000 sq ft or portion. Radon is $175 with a home
                  inspection or $225 standalone. Mold is $175 setup/admin with a
                  home inspection or $225 standalone, plus $75 per sample.
                </p>
              </div>
            </div>
          </Card>
        </section>

        <Card title="Quote Message">
          <textarea
            className="h-36 w-full rounded-2xl border border-zinc-700 bg-black p-4 text-white"
            value={message}
            readOnly
          />

          <div className="mt-5 flex flex-wrap gap-4">
            <button
              onClick={copyQuote}
              className="rounded-2xl bg-teal-500 px-6 py-4 font-bold text-black transition hover:bg-teal-400"
            >
              Copy Quote Message
            </button>

            <button
              onClick={convertToInspection}
              disabled={creating}
              className="rounded-2xl bg-white px-6 py-4 font-bold text-black transition hover:bg-zinc-200 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Convert To Inspection"}
            </button>
          </div>
        </Card>
      </div>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-zinc-300">{label}</span>

      <input
        className="w-full rounded-xl border border-zinc-700 bg-black p-3 text-white"
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
      <span>{label}</span>
      <span className="font-bold">
        {value < 0 ? "-" : ""}${Math.abs(value)}
      </span>
    </div>
  );
}
