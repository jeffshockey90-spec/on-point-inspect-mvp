"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "../../components/Card";
import { useAddressAutocomplete } from "../../hooks/useAddressAutocomplete";
import {
  DEFAULT_PRICING_CONFIG,
  calculateServiceFee,
  getService,
  type InspectorPricingConfig,
} from "../../lib/inspectorPricing";

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
  pricingConfig,
}: {
  sqft: number;
  serviceMode: ServiceMode;
  moldAirSamples: number;
  moldSurfaceSamples: number;
  travelFee: number;
  discount: number;
  pricingConfig: InspectorPricingConfig;
}) {
  const includesHome = hasHomeInspection(serviceMode);
  const includesRadon = hasRadon(serviceMode);
  const includesMold = hasMold(serviceMode);

  const homeService = getService(pricingConfig, "home");
  const radonService = getService(pricingConfig, "radon");
  const moldService = getService(pricingConfig, "mold");

  const base =
    includesHome && homeService ? calculateServiceFee(homeService, { sqft }) : 0;

  const radonFee =
    includesRadon && radonService
      ? calculateServiceFee(radonService, { paired: includesHome })
      : 0;

  const airSamples = includesMold
    ? Math.max(0, Math.floor(getNumber(moldAirSamples)))
    : 0;
  const surfaceSamples = includesMold
    ? Math.max(0, Math.floor(getNumber(moldSurfaceSamples)))
    : 0;

  const totalMoldSamples = airSamples + surfaceSamples;

  const moldSetupFee =
    includesMold && moldService
      ? calculateServiceFee(moldService, { paired: includesHome, units: 0 })
      : 0;
  const moldAirFee = airSamples * (moldService?.perUnitFee ?? 0);
  const moldSurfaceFee = surfaceSamples * (moldService?.perUnitFee ?? 0);
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
  const [propertyAddress, setPropertyAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateValue, setStateValue] = useState("MD");
  const [zip, setZip] = useState("");
  const [sqft, setSqft] = useState(2500);
  const [sqftAutoFilled, setSqftAutoFilled] = useState(false);
  const [loadingProperty, setLoadingProperty] = useState(false);
  const [propertyLookupStatus, setPropertyLookupStatus] = useState("");
  const propertyLookupRequestId = useRef(0);
  const [serviceMode, setServiceMode] = useState<ServiceMode>("home");
  const [travelFee, setTravelFee] = useState(0);
  const [moldAirSamples, setMoldAirSamples] = useState(0);
  const [moldSurfaceSamples, setMoldSurfaceSamples] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [pricingConfig, setPricingConfig] = useState<InspectorPricingConfig>(
    DEFAULT_PRICING_CONFIG,
  );

  useEffect(() => {
    fetch("/api/pricing", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.config) setPricingConfig(data.config);
      })
      .catch(() => {});
  }, []);

  async function lookupPropertySqft(
    address: string,
    cityName: string,
    stateName: string,
    zipCode: string
  ) {
    if (!address.trim()) {
      setPropertyLookupStatus("Enter an address first.");
      return;
    }

    const lookupId = propertyLookupRequestId.current + 1;
    propertyLookupRequestId.current = lookupId;

    try {
      setLoadingProperty(true);
      setPropertyLookupStatus("Looking up property info...");

      const res = await fetch("/api/property-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          city: cityName,
          state: stateName,
          zip: zipCode,
        }),
      });

      if (!res.ok) return;

      const data = await res.json();
      if (lookupId !== propertyLookupRequestId.current) return;

      const foundSqft =
        data.square_feet || data.squareFeet || data.livingArea || data.living_area;

      if (foundSqft) {
        setSqft(Number(foundSqft));
        setSqftAutoFilled(true);
        setPropertyLookupStatus(
          data.source === "rentcast_active_listing"
            ? "Square footage pulled from an active market listing - the freshest source available."
            : "Property info found. Please verify before quoting."
        );
      } else {
        setPropertyLookupStatus(
          "No property data found for that address. Enter square footage manually."
        );
      }
    } catch (error) {
      console.log("Property lookup skipped:", error);
      setPropertyLookupStatus(
        "Property lookup was skipped. Enter square footage manually."
      );
    } finally {
      if (lookupId === propertyLookupRequestId.current) {
        setLoadingProperty(false);
      }
    }
  }

  const addressInputRef = useAddressAutocomplete((parsed) => {
    setPropertyAddress(parsed.address);
    setCity(parsed.city);
    setStateValue(parsed.state);
    setZip(parsed.zip);
    void lookupPropertySqft(parsed.address, parsed.city, parsed.state, parsed.zip);
  });

  async function runManualPropertyLookup() {
    await lookupPropertySqft(propertyAddress, city, stateValue, zip);
  }

  const quote = useMemo(
    () =>
      calculateQuote({
        sqft,
        serviceMode,
        moldAirSamples,
        moldSurfaceSamples,
        travelFee,
        discount,
        pricingConfig,
      }),
    [sqft, serviceMode, moldAirSamples, moldSurfaceSamples, travelFee, discount, pricingConfig]
  );

  const pricingRulesSummary = useMemo(() => {
    const home = getService(pricingConfig, "home");
    const radon = getService(pricingConfig, "radon");
    const mold = getService(pricingConfig, "mold");

    const homeText = home
      ? `Home inspection is $${home.basePrice ?? 0} up to ${home.baseSqftLimit ?? 0} sq ft, then +$${
          home.incrementPrice ?? 0
        } per additional ${home.incrementSqftBlock ?? 0} sq ft or portion.`
      : "";

    const radonText = radon
      ? ` Radon is $${radon.pairedPrice ?? radon.flatPrice ?? 0} with a home inspection or $${
          radon.flatPrice ?? 0
        } standalone.`
      : "";

    const moldText = mold
      ? ` Mold is $${mold.pairedBaseFee ?? mold.baseFee ?? 0} setup/admin with a home inspection or $${
          mold.baseFee ?? 0
        } standalone, plus $${mold.perUnitFee ?? 0} per sample.`
      : "";

    return `${homeText}${radonText}${moldText}`.trim();
  }, [pricingConfig]);

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

  const message = `Hi, for this property the quote is $${quote.total}. Services selected: ${
    selectedAddOns.length > 0 ? selectedAddOns.join(", ") : quote.serviceLabel
  }. This includes a clear digital report for the selected service(s).`;

  async function copyQuote() {
    try {
      await navigator.clipboard.writeText(message);
      alert("Quote message copied");
    } catch (error) {
      alert("Couldn't copy automatically. Select and copy the quote message manually.");
    }
  }

  function convertToInspection() {
    // Quotes never collects a client name, inspection date, or the other
    // fields a real inspection needs - rather than creating an incomplete
    // record directly, hand off to the full New Inspection form (same
    // pricing logic, same field names) with everything Quotes does know
    // already filled in, so the user only has to add what's missing.
    const params = new URLSearchParams();

    if (propertyAddress) params.set("address", propertyAddress);
    if (city) params.set("city", city);
    if (stateValue) params.set("state", stateValue);
    if (zip) params.set("zip", zip);
    if (quote.includesHome) params.set("squareFeet", String(sqft));
    params.set("serviceMode", serviceMode);
    if (travelFee) params.set("travelFee", String(travelFee));
    if (discount) params.set("discount", String(discount));
    if (quote.includesMold) {
      if (moldAirSamples) params.set("moldAirSamples", String(moldAirSamples));
      if (moldSurfaceSamples)
        params.set("moldSurfaceSamples", String(moldSurfaceSamples));
    }

    window.location.href = `/inspections/new?${params.toString()}`;
  }

  return (
    <main className="min-h-screen bg-[#050816] px-4 pb-24 pt-6 text-white md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-zinc-800 bg-[#0b1220] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-teal-400">
                FLOW
              </p>

              <h1 className="mt-2 text-4xl font-black md:text-5xl">
                Quote Calculator
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                Generate pricing for home inspections, radon-only tests, mold-only
                sampling, Radon + Mold, and bundled services.
              </p>
            </div>

            <Link
              href="/settings/pricing"
              className="shrink-0 rounded-xl border border-teal-500/60 px-4 py-2 text-sm font-black text-teal-300 hover:bg-teal-500/10"
            >
              Manage My Pricing →
            </Link>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card title="Build Quote">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-bold text-zinc-300">
                  Property Address (optional - auto-fills square footage)
                </span>
                <input
                  ref={addressInputRef}
                  type="text"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                  placeholder="Start typing an address..."
                  className="w-full rounded-xl border border-zinc-700 bg-black p-3 text-white"
                />
              </label>

              {propertyAddress && (
                <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                  <button
                    type="button"
                    onClick={runManualPropertyLookup}
                    disabled={loadingProperty}
                    className="rounded-xl border border-zinc-700 bg-black px-4 py-2 text-sm font-bold text-white transition hover:border-teal-500 disabled:opacity-50"
                  >
                    {loadingProperty ? "Looking Up..." : "Lookup Property Info"}
                  </button>
                  {propertyLookupStatus && (
                    <span className="text-xs text-zinc-400">
                      {propertyLookupStatus}
                    </span>
                  )}
                </div>
              )}

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
                <div className="space-y-1">
                  <Input
                    label="Square Footage"
                    value={sqft}
                    onChange={(value) => {
                      setSqft(value);
                      setSqftAutoFilled(false);
                    }}
                  />
                  {sqftAutoFilled && (
                    <p className="text-xs font-bold text-teal-400">
                      Auto-filled — verify before quoting
                    </p>
                  )}
                </div>
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
                <p className="font-bold text-white">Your Pricing Rules</p>
                <p className="mt-2">{pricingRulesSummary}</p>
                <Link href="/settings/pricing" className="mt-2 inline-block font-bold text-teal-400 hover:text-teal-300">
                  Edit these rates →
                </Link>
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
              className="rounded-2xl bg-white px-6 py-4 font-bold text-black transition hover:bg-zinc-200"
            >
              Continue in New Inspection
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
