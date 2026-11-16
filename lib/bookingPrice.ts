// Prices a booking request from the confirming inspector's OWN pricing, resolved
// the same way /api/pricing does: personal override → company sheet → platform
// default. Booking confirmation used to hardcode the platform default numbers
// ($500 + $50/1000 sqft, $175/$225 add-ons), so every company's booked jobs were
// invoiced at those rates regardless of what they set in Settings → Pricing.

import {
  DEFAULT_PRICING_CONFIG,
  calculateServiceFee,
  ensureBuiltInServices,
  getService,
  type InspectorPricingConfig,
} from "./inspectorPricing";

type Db = { from: (t: string) => any };

const isConfig = (c: any): c is InspectorPricingConfig => Boolean(c && Array.isArray(c.services));

export async function loadEffectivePricing(db: Db, userId: string): Promise<InspectorPricingConfig> {
  try {
    const { data: own } = await db
      .from("inspector_pricing")
      .select("config")
      .eq("user_id", userId)
      .maybeSingle();
    if (isConfig(own?.config)) return ensureBuiltInServices(own.config);

    const { data: membership } = await db
      .from("company_users")
      .select("company_id")
      .eq("user_id", userId)
      .not("company_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (membership?.company_id) {
      const { data: sheet } = await db
        .from("company_pricing")
        .select("config")
        .eq("company_id", membership.company_id)
        .maybeSingle();
      if (isConfig(sheet?.config)) return ensureBuiltInServices(sheet.config);
    }
  } catch {
    // fall through to the platform default
  }
  return ensureBuiltInServices(DEFAULT_PRICING_CONFIG);
}

/**
 * Fee for the services a booking requested. Radon/mold use their "paired" price
 * when booked with a home inspection; mold sample counts aren't known at booking
 * (the inspector adjusts later), so only the base/package fee is charged.
 */
export function priceBooking(
  config: InspectorPricingConfig,
  opts: { sqft: number; home: boolean; radon: boolean; mold: boolean },
): { home: number; radon: number; mold: number; total: number } {
  const fee = (id: string, args: { sqft?: number; units?: number; paired?: boolean }) => {
    const service = getService(config, id);
    return service ? Math.max(0, Number(calculateServiceFee(service, args)) || 0) : 0;
  };
  const home = opts.home ? fee("home", { sqft: opts.sqft }) : 0;
  const radon = opts.radon ? fee("radon", { paired: opts.home }) : 0;
  const mold = opts.mold ? fee("mold", { paired: opts.home, units: 0 }) : 0;
  return { home, radon, mold, total: home + radon + mold };
}
