"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flowAlert } from "../../components/ConfirmProvider";
import Link from "next/link";
import { Card } from "../../components/Card";
import { useAddressAutocomplete } from "../../hooks/useAddressAutocomplete";
import {
  DEFAULT_PRICING_CONFIG,
  calculateServiceFee,
  calculateMultiUnitPrice,
  multiUnitSizeFee,
  hasMultiUnitPricing,
  getBaseService,
  getService,
  type InspectorPricingConfig,
  type PricingService,
} from "../../lib/inspectorPricing";
import { US_STATES, normalizeStateCode } from "../../lib/usStates";

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
  multiUnitApplied?: boolean;
};

function calculateQuote({
  sqft,
  selectedServiceIds,
  serviceUnits,
  travelFee,
  discount,
  pricingConfig,
  multiUnit,
  unitCount,
}: {
  sqft: number;
  selectedServiceIds: string[];
  serviceUnits: Record<string, number>;
  travelFee: number;
  discount: number;
  pricingConfig: InspectorPricingConfig;
  multiUnit: boolean;
  unitCount: number;
}) {
  const baseService = getBaseService(pricingConfig);
  const includesBase = Boolean(baseService && selectedServiceIds.includes(baseService.id));
  const safeUnitCount = Math.max(1, Math.floor(unitCount || 1));

  const lineItems: QuoteLineItem[] = selectedServiceIds
    .map((id) => getService(pricingConfig, id))
    .filter((service): service is PricingService => Boolean(service))
    .map((service) => {
      const isBase = service.id === baseService?.id;
      const paired = includesBase && !isBase;
      const units = Math.max(0, Math.floor(getNumber(serviceUnits[service.id])));
      // Per-door pricing replaces the base service's sqft fee when the quote is
      // marked multi-unit and a per-unit fee is configured.
      const useMultiUnit = isBase && multiUnit && hasMultiUnitPricing(service);
      const fee = useMultiUnit
        ? calculateMultiUnitPrice(service, safeUnitCount, sqft)
        : calculateServiceFee(service, { sqft, units, paired });

      return {
        id: service.id,
        name: service.name,
        type: service.type,
        unitLabel: service.unitLabel,
        units,
        fee,
        multiUnitApplied: useMultiUnit,
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
    multiUnitCount: safeUnitCount,
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
  // Blank until an address is picked or the inspector chooses — quotes work for
  // every state, not just the ones a particular company services.
  const [stateValue, setStateValue] = useState("");
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
  const [multiUnit, setMultiUnit] = useState(false);
  const [unitCount, setUnitCount] = useState(2);
  // Saved quotes (a client booking link that books at this price).
  const [quoteClientName, setQuoteClientName] = useState("");
  const [quoteClientEmail, setQuoteClientEmail] = useState("");
  const [savingQuote, setSavingQuote] = useState(false);
  const [savedLink, setSavedLink] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savedQuotes, setSavedQuotes] = useState<SavedQuoteRow[]>([]);
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
    setStateValue(normalizeStateCode(parsed.state) || parsed.state);
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
        multiUnit,
        unitCount,
      }),
    [sqft, selectedServiceIds, serviceUnits, travelFee, discount, pricingConfig, multiUnit, unitCount]
  );

  // Only offer the multi-unit toggle when the base service is selected and the
  // inspector has configured per-door pricing (a per-unit fee). Otherwise it
  // would do nothing, so we hide it.
  const baseService = getBaseService(pricingConfig);
  const baseHasMultiUnit = hasMultiUnitPricing(baseService);
  const multiUnitBaseFee = Math.max(0, Number(baseService?.multiUnitBaseFee) || 0);
  const multiUnitPerUnitFee = Math.max(0, Number(baseService?.multiUnitPerUnitFee) || 0);
  const quoteMultiUnitSizeFee =
    multiUnit && baseService
      ? multiUnitSizeFee(baseService, sqft, Math.max(1, Math.floor(unitCount || 1)))
      : 0;

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

        const included = Math.max(0, Math.floor(Number(service.includedUnits) || 0));
        const unit = service.unitLabel || "unit";
        const packageText =
          service.pairedBaseFee !== undefined
            ? `$${service.pairedBaseFee} with a home inspection or $${
                service.baseFee ?? 0
              } standalone`
            : `$${service.baseFee ?? 0}`;
        const inclText =
          included > 0 ? ` (includes ${included} ${unit}${included === 1 ? "" : "s"})` : "";

        return `${service.name} is ${packageText}${inclText}, plus $${
          service.perUnitFee ?? 0
        } per additional ${unit}.`;
      })
      .join(" ");
  }, [pricingConfig]);

  const message = `Hi, for this property the quote is $${quote.total}. Services selected: ${
    quote.serviceLabel
  }. This includes a clear digital report for the selected service(s).`;

  async function loadSavedQuotes() {
    try {
      const res = await fetch("/api/quotes", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setSavedQuotes(Array.isArray(data?.quotes) ? data.quotes : []);
    } catch {
      /* list is optional */
    }
  }

  useEffect(() => {
    void loadSavedQuotes();
  }, []);

  async function saveQuote() {
    if (savingQuote) return;
    setSavingQuote(true);
    setSaveError("");
    setSavedLink("");
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: quoteClientName,
          clientEmail: quoteClientEmail,
          propertyAddress,
          city,
          state: stateValue,
          zip,
          squareFeet: quote.includesBase ? sqft : null,
          serviceIds: selectedServiceIds,
          lineItems: quote.lineItems.map((item) => ({ id: item.id, name: item.name, fee: item.fee, units: item.units })),
          travelFee: quote.travelFee,
          discount: quote.discount,
          total: quote.total,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save the quote.");
      setSavedLink(data.link || "");
      void loadSavedQuotes();
    } catch (error: any) {
      setSaveError(error?.message || "Could not save the quote.");
    } finally {
      setSavingQuote(false);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      await flowAlert("Booking link copied");
    } catch {
      await flowAlert("Couldn't copy automatically. Select and copy the link manually.");
    }
  }

  async function deleteSavedQuote(id: string) {
    const res = await fetch(`/api/quotes/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setSavedQuotes((current) => current.filter((q) => q.id !== id));
  }

  async function copyQuote() {
    try {
      await navigator.clipboard.writeText(message);
      await flowAlert("Quote message copied");
    } catch (error) {
      await flowAlert("Couldn't copy automatically. Select and copy the quote message manually.");
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

    // Carry the multi-family selection so New Inspection opens per-door priced.
    if (quote.includesBase && multiUnit && baseHasMultiUnit) {
      params.set("multiUnit", "1");
      params.set("unitCount", String(quote.multiUnitCount));
    }

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
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 pb-24 pt-6 text-[var(--fl-text)] md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-[var(--fl-accent-text)]">
                FLOW
              </p>

              <h1 className="mt-2 text-4xl font-semibold md:text-5xl">
                Quote Calculator
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--fl-muted)] md:text-base">
                Generate pricing for home inspections, radon-only tests, mold-only
                sampling, Radon + Mold, and bundled services.
              </p>
            </div>

            <Link
              href="/settings/pricing"
              className="shrink-0 rounded-xl border border-teal-500/60 px-4 py-2 text-sm font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
            >
              Manage My Pricing →
            </Link>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card title="Build Quote">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-bold text-[var(--fl-text)]">
                  Property Address (optional - auto-fills square footage)
                </span>
                <input
                  ref={addressInputRef}
                  type="text"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                  placeholder="Start typing an address..."
                  className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-[var(--fl-text)]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold text-[var(--fl-text)]">State</span>
                <select
                  value={stateValue}
                  onChange={(e) => setStateValue(e.target.value)}
                  className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-[var(--fl-text)]"
                >
                  <option value="">Select state</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </label>

              {propertyAddress && (
                <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                  <button
                    type="button"
                    onClick={runManualPropertyLookup}
                    disabled={loadingProperty}
                    className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-2 text-sm font-bold text-[var(--fl-text)] transition hover:border-teal-500 disabled:opacity-50"
                  >
                    {loadingProperty ? "Looking Up..." : "Lookup Property Info"}
                  </button>
                  {propertyLookupStatus && (
                    <span className="text-xs text-[var(--fl-muted)]">
                      {propertyLookupStatus}
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <span className="text-sm font-bold text-[var(--fl-text)]">
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
                            : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] hover:border-[var(--fl-line)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleService(service.id)}
                          className="h-4 w-4 shrink-0 accent-teal-500"
                        />
                        <span className="text-sm font-bold text-[var(--fl-text)]">{service.name}</span>
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
                    <p className="text-xs font-bold text-[var(--fl-accent-text)]">
                      Auto-filled — verify before quoting
                    </p>
                  )}
                </div>
              )}

              {quote.includesBase && baseHasMultiUnit && (
                <div className="space-y-2 md:col-span-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3">
                    <input
                      type="checkbox"
                      checked={multiUnit}
                      onChange={(e) => setMultiUnit(e.target.checked)}
                      className="h-4 w-4 shrink-0 accent-teal-500"
                    />
                    <span className="text-sm font-bold text-[var(--fl-text)]">
                      Multi-family (price per door, not by square footage)
                    </span>
                  </label>
                  {multiUnit && (
                    <div className="space-y-1">
                      <Input
                        label="Number of Units"
                        value={unitCount}
                        onChange={(value) => setUnitCount(Math.max(1, Math.floor(value || 1)))}
                      />
                      <p className="text-xs text-[var(--fl-muted)]">
                        Base building fee + a fee for each unit (set in Settings → Pricing).
                        Square footage is ignored for the base fee.
                      </p>
                    </div>
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
            <div className="space-y-3 text-[var(--fl-text)]">
              {quote.lineItems.length === 0 ? (
                <p className="text-sm text-[var(--fl-faint)]">No services selected yet.</p>
              ) : (
                quote.lineItems.map((item) => (
                  <SummaryLine
                    key={item.id}
                    label={
                      item.multiUnitApplied
                        ? `${item.name} ($${multiUnitBaseFee} base + $${multiUnitPerUnitFee} × ${quote.multiUnitCount} units${
                            quoteMultiUnitSizeFee > 0 ? ` + $${quoteMultiUnitSizeFee} size` : ""
                          })`
                        : item.name
                    }
                    value={item.fee}
                  />
                ))
              )}
              <SummaryLine label="Travel Fee" value={quote.travelFee} />
              <SummaryLine label="Discount" value={-quote.discount} />

              <div className="mt-5 rounded-2xl border border-teal-700 bg-teal-500/10 p-5">
                <p className="text-sm font-bold uppercase tracking-wide text-[var(--fl-muted)]">
                  Total Quote
                </p>

                <p className="mt-1 text-5xl font-semibold text-[var(--fl-accent-text)]">
                  ${quote.total}
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-sm leading-6 text-[var(--fl-muted)]">
                <p className="font-bold text-[var(--fl-text)]">Your Pricing Rules</p>
                <p className="mt-2">{pricingRulesSummary}</p>
                <Link href="/settings/pricing" className="mt-2 inline-block font-bold text-[var(--fl-accent-text)] hover:text-[var(--fl-accent-text)]">
                  Edit these rates →
                </Link>
              </div>
            </div>
          </Card>
        </section>

        <Card title="Quote Message">
          <textarea
            className="h-36 w-full rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 text-[var(--fl-text)]"
            value={message}
            readOnly
          />

          <div className="mt-5 flex flex-wrap gap-4">
            <button
              onClick={copyQuote}
              className="rounded-2xl bg-[var(--fl-accent)] px-6 py-4 font-bold text-[var(--fl-accent-text)] transition hover:bg-[var(--fl-accent)]"
            >
              Copy Quote Message
            </button>

            <button
              onClick={convertToInspection}
              className="rounded-2xl bg-[var(--fl-surface-2)] text-[var(--fl-text)] border border-[var(--fl-line)] px-6 py-4 font-bold transition hover:bg-[var(--fl-surface)]"
            >
              Continue in New Inspection
            </button>
          </div>
        </Card>

        <Card title="Save & Send a Booking Link">
          <p className="text-sm leading-6 text-[var(--fl-muted)]">
            Save this quote and send the client a link. It opens your booking form already filled in
            with the address and services and shows this price — when you confirm the booking, the
            job is invoiced at the quoted ${quote.total}. Links stay open for 30 days and book once.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--fl-text)]">Client Name (optional)</span>
              <input
                type="text"
                value={quoteClientName}
                onChange={(e) => setQuoteClientName(e.target.value)}
                className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-[var(--fl-text)]"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-[var(--fl-text)]">Client Email (optional)</span>
              <input
                type="email"
                value={quoteClientEmail}
                onChange={(e) => setQuoteClientEmail(e.target.value)}
                className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-[var(--fl-text)]"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveQuote}
              disabled={savingQuote || quote.lineItems.length === 0 || quote.total <= 0}
              className="rounded-2xl bg-[var(--fl-accent)] px-6 py-4 font-bold text-[var(--fl-accent-text)] transition disabled:opacity-50"
            >
              {savingQuote ? "Saving..." : "Save Quote & Get Link"}
            </button>
            {saveError && <span className="text-sm font-semibold text-[var(--fl-crit-text)]">{saveError}</span>}
          </div>
          {savedLink && (
            <div className="mt-4 rounded-2xl border border-teal-500/40 bg-teal-500/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--fl-accent-text)]">Booking link</p>
              <p className="mt-1 break-all text-sm text-[var(--fl-text)]">{savedLink}</p>
              <button
                type="button"
                onClick={() => copyLink(savedLink)}
                className="mt-3 rounded-xl border border-teal-500 px-4 py-2 text-sm font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
              >
                Copy Link
              </button>
            </div>
          )}

          {savedQuotes.length > 0 && (
            <div className="mt-6 space-y-2">
              <p className="text-sm font-bold text-[var(--fl-text)]">Saved quotes</p>
              {savedQuotes.map((q) => (
                <div
                  key={q.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--fl-text)]">
                      ${q.total} · {q.clientName || q.propertyAddress || "No client name"}
                    </p>
                    <p className="truncate text-xs text-[var(--fl-muted)]">
                      {q.services.join(" + ")}
                      {q.propertyAddress && q.clientName ? ` · ${q.propertyAddress}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase ${
                        q.status === "booked"
                          ? "border-emerald-400/40 text-[var(--fl-good-text)]"
                          : q.status === "expired"
                            ? "border-[var(--fl-line)] text-[var(--fl-faint)]"
                            : "border-teal-500/40 text-[var(--fl-accent-text)]"
                      }`}
                    >
                      {q.status}
                    </span>
                    {q.status === "open" && (
                      <button
                        type="button"
                        onClick={() => copyLink(q.link)}
                        className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-bold text-[var(--fl-accent-text)]"
                      >
                        Copy Link
                      </button>
                    )}
                    {q.status !== "booked" && (
                      <button
                        type="button"
                        onClick={() => deleteSavedQuote(q.id)}
                        className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-bold text-[var(--fl-crit-text)]"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

type SavedQuoteRow = {
  id: string;
  clientName: string | null;
  propertyAddress: string | null;
  total: number;
  services: string[];
  status: "open" | "booked" | "expired";
  link: string;
};

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
      <span className="text-sm font-bold text-[var(--fl-text)]">{label}</span>

      <input
        className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-[var(--fl-text)]"
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
    <div className="flex items-center justify-between border-b border-[var(--fl-line)] pb-2">
      <span>{label}</span>
      <span className="font-bold">
        {value < 0 ? "-" : ""}${Math.abs(value)}
      </span>
    </div>
  );
}
