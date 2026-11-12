import { deriveServiceFees, canonicalServiceKey } from "./agreementTemplates";

// Automatic add-on cancellation / clawback math.
//
// Add-ons are discounted because they ride with a home inspection (the agreement
// discloses this — see buildAddOnPairingDisclosure). When a client cancels a
// bundled service, the pairing discount is forfeited: the service(s) they KEEP
// revert to their standard standalone price, and the refund is whatever is left
// over. So the refund is NOT simply the canceled service's bundled price — it is
// amountPaid minus the full standalone price of everything kept.

const SERVICE_LABELS: Record<string, string> = {
  home: "Home Inspection",
  home_inspection: "Home Inspection",
  radon: "Radon Testing",
  mold: "Mold Testing",
  water: "Water Testing",
  well_water: "Well Water Testing",
  sewer_scope: "Sewer Scope",
  termite: "Termite / WDO",
  termite_wdo: "Termite / WDO",
  wdo: "Termite / WDO",
  pool: "Pool & Spa",
  pool_spa: "Pool & Spa",
  pre_drywall: "Pre-Drywall",
  mechanical_and_structural: "Mechanical & Structural",
  structural: "Structural & Mechanical",
};

export function serviceLabelForKey(key: string): string {
  const k = canonicalServiceKey(key) || key;
  if (SERVICE_LABELS[k]) return SERVICE_LABELS[k];
  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function num(value: any): number {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export type ServiceLine = { key: string; label: string; standalone: number };

// The inspection's services at their CLEAN standalone prices (deriveServiceFees),
// home first then by price, zero-priced lines dropped.
export function inspectionServiceLines(inspection: any): ServiceLine[] {
  const fees = deriveServiceFees(inspection) || {};
  const isHome = (k: string) => k === "home" || k === "home_inspection";
  return Object.entries(fees)
    .map(([key, v]) => ({ key, label: serviceLabelForKey(key), standalone: num(v) }))
    .filter((l) => l.standalone > 0)
    .sort((a, b) => {
      const ha = isHome(a.key) ? 0 : 1;
      const hb = isHome(b.key) ? 0 : 1;
      return ha - hb || b.standalone - a.standalone;
    });
}

export type ClawbackResult = {
  amountPaid: number;
  standaloneAll: number;
  keptStandaloneTotal: number;
  canceledStandaloneTotal: number;
  /** What the client saved by bundling (standalone total − paid). */
  bundleDiscount: number;
  /** The portion of the bundle discount charged back by this cancellation. */
  forfeitedDiscount: number;
  /** Suggested refund for the cancellation (clawback applied). */
  refund: number;
  canceledLabels: string[];
  keptLabels: string[];
};

// Suggested refund when `canceledKeys` services are canceled. Clawback applied:
// refund = amountPaid − standalone price of everything kept, clamped to
// [0, amountPaid]. Canceling everything returns the full amount paid.
export function computeAddOnCancellationRefund(
  inspection: any,
  canceledKeys: string[],
): ClawbackResult {
  const lines = inspectionServiceLines(inspection);
  const canceledSet = new Set(canceledKeys.map((k) => canonicalServiceKey(k) || k));

  const standaloneAll = round2(lines.reduce((s, l) => s + l.standalone, 0));
  const invoice = num(inspection?.invoice_amount) || standaloneAll;
  const amountPaidRaw = num(inspection?.amount_paid);
  const amountPaid = amountPaidRaw > 0 ? amountPaidRaw : invoice;

  const kept = lines.filter((l) => !canceledSet.has(l.key));
  const canceled = lines.filter((l) => canceledSet.has(l.key));
  const keptStandaloneTotal = round2(kept.reduce((s, l) => s + l.standalone, 0));
  const canceledStandaloneTotal = round2(canceled.reduce((s, l) => s + l.standalone, 0));

  const bundleDiscount = Math.max(0, round2(standaloneAll - amountPaid));

  // Keeping services at their standalone price claws back the bundle discount.
  const refund = Math.min(amountPaid, Math.max(0, round2(amountPaid - keptStandaloneTotal)));

  // Nothing kept = full refund, so no discount is forfeited.
  const forfeitedDiscount =
    kept.length === 0 ? 0 : Math.max(0, round2(canceledStandaloneTotal - refund));

  return {
    amountPaid,
    standaloneAll,
    keptStandaloneTotal,
    canceledStandaloneTotal,
    bundleDiscount,
    forfeitedDiscount,
    refund,
    canceledLabels: canceled.map((l) => l.label),
    keptLabels: kept.map((l) => l.label),
  };
}
