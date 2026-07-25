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

  // flat_plus_per_unit: a setup fee plus a per-unit fee (e.g. mold: setup +
  // per air/surface sample). pairedBaseFee overrides baseFee when paired.
  baseFee?: number;
  pairedBaseFee?: number;
  perUnitFee?: number;
  unitLabel?: string;
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

  // flat_plus_per_unit
  const paired = opts.paired && service.pairedBaseFee !== undefined;
  const base = paired ? Number(service.pairedBaseFee) : Number(service.baseFee ?? 0);
  const units = Math.max(0, Math.floor(opts.units ?? 0));
  return base + units * Number(service.perUnitFee ?? 0);
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
