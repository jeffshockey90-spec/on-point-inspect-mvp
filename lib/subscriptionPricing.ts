import { createClient as createServiceClient } from "@supabase/supabase-js";

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export type SubscriptionPricing = {
  standardPriceCents: number;
  foundingMemberPriceCents: number;
  updatedAt: string | null;
};

const DEFAULT_PRICING: SubscriptionPricing = {
  standardPriceCents: 6900,
  foundingMemberPriceCents: 4900,
  updatedAt: null,
};

export async function getSubscriptionPricing(): Promise<SubscriptionPricing> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscription_pricing")
    .select("standard_price_cents,founding_member_price_cents,updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (!data) return DEFAULT_PRICING;

  return {
    standardPriceCents: Number(data.standard_price_cents) || DEFAULT_PRICING.standardPriceCents,
    foundingMemberPriceCents:
      Number(data.founding_member_price_cents) || DEFAULT_PRICING.foundingMemberPriceCents,
    updatedAt: data.updated_at || null,
  };
}

export async function setSubscriptionPricing(input: {
  standardPriceCents: number;
  foundingMemberPriceCents: number;
}): Promise<SubscriptionPricing> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("subscription_pricing")
    .update({
      standard_price_cents: input.standardPriceCents,
      founding_member_price_cents: input.foundingMemberPriceCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) throw error;

  return getSubscriptionPricing();
}
