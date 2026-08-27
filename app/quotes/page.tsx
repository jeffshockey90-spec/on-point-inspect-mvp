"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "../../components/Card";
import { useAddressAutocomplete } from "../../hooks/useAddressAutocomplete";
import {
  DEFAULT_PRICING_CONFIG,
  calculateServiceFee,
  getBaseService,
  getService,
  type InspectorPricingConfig,
  type PricingService,
} from "../../lib/inspectorPricing";

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

// Maps a dynamic service selection back onto the legacy fixed ServiceMode
// enum that app/inspections/new/page.tsx still uses for its own separate
// estimate field - only possible when the selection is exactly some subset
// of the three default services. Custom services can't be represented
// there, so the New Inspection handoff just omits serviceMode in that case
// and the inspector fills in price manually (same as any other custom quote).
function toLegacyServiceMode(selectedServiceIds: string[]) {
  const set = new Set(selectedServiceIds);
  const hasHome = set.has("home");
  const hasRadon = set.has("radon");
  const hasMold = set.has("mold");
  const onlyDefaults = selectedServiceIds.every((id) => id === "home" || id === "radon" || id === "mold");

  if (!onlyDefaults) return null;
  if (hasHome && hasRadon && hasMold) return "home_radon_mold";
  if (hasHome && hasRadon) return "home_radon";
  if (hasHome && hasMold) return "home_mold";
  if (hasRadon && hasMold) return "radon_mold";
  if (hasHome) return "home";
  if (hasRadon) return "radon_only";
  if (hasMold) return "mold_only";
  return null;
}

type QuoteLineItem = {
  id: string;
  name: string;
  type: PricingService["type"];
  unitLabel?: string;
  units: number;
  fee: number;
};

function calculateQuote({
  sqft,
  selectedServiceIds,
  serviceUnits,
  travelFee,
  discount,
  pricingConfig,
}: {
  sqft: number;
  selectedServiceIds: string[];
  serviceUnits: Record<string, number>;
  travelFee: number;
  discount: number;
  pricingConfig: InspectorPricingConfig;
}) {
  const baseService = getBaseService(pricingConfig);
  const includesBase = Boolean(baseService && selectedServiceIds.includes(baseService.id));

  const lineItems: QuoteLineItem[] = selectedServiceIds
    .map((id) => getService(pricingConfig, id))
    .filter((service): service is PricingService => Boolean(service))
    .map((service) => {
      const paired = includesBase && service.id !== baseService?.id;
      const units = Math.max(0, Math.floor(getNumber(serviceUnits[service.id])));
      const fee = calculateServiceFee(service, { sqft, units, paired });

      return {
        id: service.id,
        name: service.name,
        type: service.type,
        unitLabel: service.unitLabel,
        units,
        fee,
      };
    });

  const servicesSubtotal = lineItems.reduce((sum, item) => sum + item.fee, 0);
  const safeTravelFee = Math.max(0, getNumber(travelFee));
  const safeDiscount = Math.max(0, getNumber(discount));
  const subtotal = servicesSubtotal + safeTravelFee;
  const total = Math.max(0, subtotal - safeDiscount);

  return {
    lineItems,
    includesBase,
    baseServiceId: baseService?.id || null,
    travelFee: safeTravelFee,
    discount: safeDiscount,
    subtotal,
    total,
    serviceLabel: lineItems.map((item) => item.name).join(" + ") || "No services selected",
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
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(["home"]);
  const [travelFee, setTravelFee] = useState(0);
  const [serviceUnits, setServiceUnits] = useState<Record<string, number>>({});
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

  function toggleService(id: string) {
    setSelectedServiceIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    );
  }

  function setUnitsForService(id: string, units: number) {
    setServiceUnits((current) => ({ ...current, [id]: units }));
  }

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
        selectedServiceIds,
        serviceUnits,
        travelFee,
        discount,
        pricingConfig,
      }),
    [sqft, selectedServiceIds, serviceUnits, travelFee, discount, pricingConfig]
  );

  const pricingRulesSummary = useMemo(() => {
    return pricingConfig.services
      .map((service) => {
        if (service.type === "sqft_formula") {
          return `${service.name} is $${service.basePrice ?? 0} up to ${
            service.baseSqftLimit ?? 0
          } sq ft, then +$${service.incrementPrice ?? 0} per additional ${
            service.incrementSqftBlock ?? 0
          } sq ft or portion.`;
        }

        if (service.type === "flat") {
          return service.pairedPrice !== undefined
            ? `${service.name} is $${service.pairedPrice} with a home inspection or $${
                service.flatPrice ?? 0
              } standalone.`
            : `${service.name} is $${service.flatPrice ?? 0}.`;
        }

        const setupText =
          service.pairedBaseFee !== undefined
            ? `$${service.pairedBaseFee} setup with a home inspection or $${
                service.baseFee ?? 0
              } standalone`
            : `$${service.baseFee ?? 0} setup`;

        return `${service.name} is ${setupText}, plus $${service.perUnitFee ?? 0} per ${
          service.unitLabel || "unit"
        }.`;
      })
      .join(" ");
  }, [pricingConfig]);

  const message = `Hi, for this property the quote is $${quote.total}. Services selected: ${
    quote.serviceLabel
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
    // already filled in, so the user only has to add what's missing. New
    // Inspection has its own separate legacy service-mode estimate field
    // that only knows about the three default services - custom services
    // aren't representable there, so serviceMode is omitted when a custom
    // service is part of the selection and the inspector fills price in
    // manually on that page instead.
    const params = new URLSearchParams();

    if (propertyAddress) params.set("address", propertyAddress);
    if (city) params.set("city", city);
    if (stateValue) params.set("state", stateValue);
    if (zip) params.set("zip", zip);
    if (quote.includesBase) params.set("squareFeet", String(sqft));

    const legacyServiceMode = toLegacyServiceMode(selectedServiceIds);
    if (legacyServiceMode) params.set("serviceMode", legacyServiceMode);

    if (travelFee) params.set("travelFee", String(travelFee));
    if (discount) params.set("discount", String(discount));

    const moldUnits = serviceUnits["mold"];
    if (selectedServiceIds.includes("mold") && moldUnits) {
      params.set("moldAirSamples", String(moldUnits));
    }

    window.location.href = `/inspections/new?${params.toString()}`;
  }

  return (
    <main className="min-h-screen bg-[#050816] px-4 pb-24 pt-6 text-white md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-zinc-800 bg-[#10151e] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-teal-400">
                FLOW
              </p>

              <h1 className="mt-2 text-4xl font-semibold md:text-5xl">
                Quote Calculator
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                Generate pricing for home inspections, radon-only tests, mold-only
                sampling, Radon + Mold, and bundled services.
              </p>
            </div>

            <Link
              href="/settings/pricing"
              className="shrink-0 rounded-xl border border-teal-500/60 px-4 py-2 text-sm font-semibold text-teal-300 hover:bg-teal-500/10"
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

              <div className="space-y-2 md:col-span-2">
                <span className="text-sm font-bold text-zinc-300">
                  Services
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {pricingConfig.services.map((service) => {
                    const checked = selectedServiceIds.includes(service.id);

                    return (
                      <label
                        key={service.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                          checked
                            ? "border-teal-500 bg-teal-500/10"
                            : "border-zinc-700 bg-black hover:border-zinc-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleService(service.id)}
                          className="h-4 w-4 shrink-0 accent-teal-500"
                        />
                        <span className="text-sm font-bold text-white">{service.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {quote.includesBase && (
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

              {quote.lineItems
                .filter((item) => item.type === "flat_plus_per_unit")
                .map((item) => (
                  <Input
                    key={item.id}
                    label={`${item.name} - # of ${item.unitLabel || "unit"}s`}
                    value={serviceUnits[item.id] ?? 0}
                    onChange={(value) => setUnitsForService(item.id, value)}
                  />
                ))}

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
              {quote.lineItems.length === 0 ? (
                <p className="text-sm text-zinc-500">No services selected yet.</p>
              ) : (
                quote.lineItems.map((item) => (
                  <SummaryLine key={item.id} label={item.name} value={item.fee} />
                ))
              )}
              <SummaryLine label="Travel Fee" value={quote.travelFee} />
              <SummaryLine label="Discount" value={-quote.discount} />

              <div className="mt-5 rounded-2xl border border-teal-700 bg-teal-500/10 p-5">
                <p className="text-sm font-bold uppercase tracking-wide text-zinc-400">
                  Total Quote
                </p>

                <p className="mt-1 text-5xl font-semibold text-teal-400">
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
