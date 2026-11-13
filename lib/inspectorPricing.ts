// Per-inspector customizable pricing: a base sqft-formula service (Home
// Inspection) plus add-on services (Radon, Mold) that can each have a
// separate "paired" price used when the base service is also selected -
// e.g. radon testing costs less when bundled with a home inspection than
// booked on its own. Every number here is inspector-editable; the shapes
// below just define what's editable.

export type PricingServiceType = "sqft_formula" | "flat" | "flat_plus_per_unit";

export type PricingService = {
  id: string;
  name: string;
  type: PricingServiceType;
  isBaseService?: boolean;

  // sqft_formula: basePrice up to baseSqftLimit, then +incrementPrice per
  // incrementSqftBlock sqft over that limit.
  basePrice?: number;
  baseSqftLimit?: number;
  incrementPrice?: number;
  incrementSqftBlock?: number;

  // flat: a single fee. pairedPrice (optional) overrides it when the base
  // service is also selected.
  flatPrice?: number;
  pairedPrice?: number;

  // flat_plus_per_unit: a package/base fee plus a per-unit fee for units beyond
  // the included allowance (e.g. mold: a package price that INCLUDES the first
  // `includedUnits` samples, then `perUnitFee` for each additional sample).
  // pairedBaseFee overrides baseFee when paired. includedUnits is the pricing
  // allowance baked into the package price; left unset it is 0, so the package
  // fee + per-unit × every unit (the original behavior) is preserved exactly.
  baseFee?: number;
  pairedBaseFee?: number;
  perUnitFee?: number;
  includedUnits?: number;
  unitLabel?: string;

  // Multi-family (per-door) pricing for the base Home Inspection service: a flat
  // base building fee (roof, exterior, foundation, grounds, shared systems) plus
  // a fee per dwelling unit. When a job is marked multi-unit AND multiUnitPerUnitFee
  // is set (> 0), this REPLACES the sqft formula for the base fee. Left unset, a
  // multi-unit job just falls back to the sqft formula (unchanged behavior).
  multiUnitBaseFee?: number;
  multiUnitPerUnitFee?: number;

  // Optional size step on top of the per-door price, so a large building isn't
  // priced the same as a small one: add multiUnitIncrementPrice for every
  // multiUnitIncrementSqftBlock of TOTAL building sqft over the included
  // allowance. multiUnitSqftLimit is PER UNIT, so the allowance scales with the
  // building (limit × units) — a normal building of any unit count stays flat
  // and only genuinely large units trigger the step. Off unless both the
  // increment price and block are set (> 0).
  multiUnitSqftLimit?: number;
  multiUnitIncrementPrice?: number;
  multiUnitIncrementSqftBlock?: number;
};

export type InspectorPricingConfig = {
  services: PricingService[];
};

export const DEFAULT_PRICING_CONFIG: InspectorPricingConfig = {
  services: [
    {
      id: "home",
      name: "Home Inspection",
      type: "sqft_formula",
      isBaseService: true,
      basePrice: 500,
      baseSqftLimit: 2000,
      incrementPrice: 50,
      incrementSqftBlock: 1000,
    },
    {
      id: "radon",
      name: "Radon Test",
      type: "flat",
      flatPrice: 225,
      pairedPrice: 175,
    },
    {
      id: "mold",
      name: "Mold Testing",
      type: "flat_plus_per_unit",
      baseFee: 225,
      pairedBaseFee: 175,
      perUnitFee: 75,
      unitLabel: "sample",
    },
  ],
};

export function calculateSqftFormulaPrice(service: PricingService, sqft: number) {
  const base = service.basePrice ?? 0;
  const limit = service.baseSqftLimit ?? 0;
  const incrementPrice = service.incrementPrice ?? 0;
  const blockSize = service.incrementSqftBlock || 1;

  if (sqft <= limit) return base;

  return base + Math.ceil((sqft - limit) / blockSize) * incrementPrice;
}

export function calculateServiceFee(
  service: PricingService,
  opts: { sqft?: number; units?: number; paired?: boolean },
) {
  if (service.type === "sqft_formula") {
    return calculateSqftFormulaPrice(service, opts.sqft ?? 0);
  }

  if (service.type === "flat") {
    const paired = opts.paired && service.pairedPrice !== undefined;
    return paired ? Number(service.pairedPrice) : Number(service.flatPrice ?? 0);
  }

  // flat_plus_per_unit: the package price already includes `includedUnits`
  // units; only units beyond that allowance add the per-unit fee. Count every
  // collected unit (e.g. all mold samples, outdoor controls included) in
  // `opts.units`. includedUnits unset/0 reproduces the original behavior
  // (package + per-unit × every unit).
  const paired = opts.paired && service.pairedBaseFee !== undefined;
  const base = paired ? Number(service.pairedBaseFee) : Number(service.baseFee ?? 0);
  const units = Math.max(0, Math.floor(opts.units ?? 0));
  const included = Math.max(0, Math.floor(Number(service.includedUnits) || 0));
  const billableUnits = Math.max(0, units - included);
  return base + billableUnits * Number(service.perUnitFee ?? 0);
}

// True when the base service has a usable multi-family rate configured (a
// per-unit fee > 0). The base building fee may legitimately be 0, so only the
// per-unit fee gates whether per-door pricing is "set up".
export function hasMultiUnitPricing(
  service: PricingService | null | undefined,
): boolean {
  return !!service && Number(service.multiUnitPerUnitFee) > 0;
}

// Optional size step for per-door pricing: add the increment price for every
// block of TOTAL building sqft over the included allowance, where the allowance
// is multiUnitSqftLimit PER UNIT (× units) — so a normal building of any unit
// count stays flat and only genuinely large units trigger it. Returns 0 (off)
// unless both the increment price and block size are configured (> 0), so
// existing per-door configs that never set these keep pricing purely by door.
export function multiUnitSizeFee(
  service: PricingService,
  sqft: number,
  units: number,
): number {
  const incrementPrice = Math.max(0, Number(service.multiUnitIncrementPrice) || 0);
  const blockSize = Math.max(0, Number(service.multiUnitIncrementSqftBlock) || 0);
  const perUnitLimit = Math.max(0, Number(service.multiUnitSqftLimit) || 0);
  const safeUnits = Math.max(1, Math.floor(Number(units) || 1));
  const allowance = perUnitLimit * safeUnits;
  const size = Math.max(0, Number(sqft) || 0);
  if (incrementPrice <= 0 || blockSize <= 0 || size <= allowance) return 0;
  return Math.ceil((size - allowance) / blockSize) * incrementPrice;
}

// Per-door price: base building fee + per-unit fee × units, plus an optional
// size step for large buildings (see multiUnitSizeFee). Units is floored to a
// sane minimum of 1 so a malformed count never zeroes the base building fee.
export function calculateMultiUnitPrice(
  service: PricingService,
  units: number,
  sqft = 0,
): number {
  const base = Math.max(0, Number(service.multiUnitBaseFee) || 0);
  const perUnit = Math.max(0, Number(service.multiUnitPerUnitFee) || 0);
  const safeUnits = Math.max(1, Math.floor(Number(units) || 1));
  return base + perUnit * safeUnits + multiUnitSizeFee(service, sqft, safeUnits);
}

export function getService(config: InspectorPricingConfig, id: string) {
  return config.services.find((service) => service.id === id) || null;
}

export function getBaseService(config: InspectorPricingConfig) {
  return config.services.find((service) => service.isBaseService) || null;
}

export const PRICING_SERVICE_TYPE_OPTIONS: { value: PricingServiceType; label: string }[] = [
  { value: "flat", label: "Flat Fee" },
  { value: "flat_plus_per_unit", label: "Flat Fee + Per-Unit Fee" },
  { value: "sqft_formula", label: "Square-Footage Formula" },
];

export function createCustomService(type: PricingServiceType): PricingService {
  const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  if (type === "sqft_formula") {
    return {
      id,
      name: "New Service",
      type,
      basePrice: 0,
      baseSqftLimit: 0,
      incrementPrice: 0,
      incrementSqftBlock: 1000,
    };
  }

  if (type === "flat_plus_per_unit") {
    return {
      id,
      name: "New Service",
      type,
      baseFee: 0,
      perUnitFee: 0,
      includedUnits: 0,
      unitLabel: "unit",
    };
  }

  return {
    id,
    name: "New Service",
    type: "flat",
    flatPrice: 0,
  };
}
