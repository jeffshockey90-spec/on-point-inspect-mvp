import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdmin } from "@supabase/supabase-js";
import Stripe from "stripe";
import { OWNER_EMAILS } from "../../../../../lib/ownerEmails";
import { getSubscriptionPricing } from "../../../../../lib/subscriptionPricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only tool: move EXISTING active subscribers onto their current effective
// price (their per-inspector override, else the global standard/founding price).
// Stripe locks the price into each subscription at signup, so this is the
// deliberate, explicit way to re-price people who are already paying.
//
// POST { dryRun?: boolean, proration?: "none" | "immediate" }
//   dryRun (default true): report who WOULD change, touch nothing.
//   proration "none" (default): new price starts next invoice, no mid-cycle
//     charge/credit. "immediate": create prorations now.

function activeLike(status: any) {
  const s = String(status || "").toLowerCase();
  return s === "active" || s === "trialing" || s === "past_due";
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!OWNER_EMAILS.includes(String(user.email || "").toLowerCase())) {
      return NextResponse.json({ error: "Owner only." }, { status: 403 });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!stripeKey || !url || !key) {
      return NextResponse.json({ error: "Server not configured." }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false; // default true — preview unless told otherwise
    const prorationBehavior =
      body?.proration === "immediate" ? "create_prorations" : "none";

    const admin = createAdmin(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const stripe = new Stripe(stripeKey);
    const pricing = await getSubscriptionPricing();

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name, name, business_name, subscription_status, stripe_subscription_id, subscription_price_override_cents, founding_member");

    const subs = (profiles || []).filter(
      (p: any) => p.stripe_subscription_id && activeLike(p.subscription_status)
    );

    const results: any[] = [];
    let changed = 0;
    let unchanged = 0;
    let failed = 0;

    for (const p of subs) {
      const override = Number(p.subscription_price_override_cents || 0);
      const targetCents = override > 0
        ? override
        : p.founding_member
          ? pricing.foundingMemberPriceCents
          : pricing.standardPriceCents;

      const label = p.full_name || p.name || p.business_name || p.email || p.id;

      try {
        const sub: any = await stripe.subscriptions.retrieve(p.stripe_subscription_id);
        const item = sub?.items?.data?.[0];
        if (!item) {
          failed += 1;
          results.push({ label, email: p.email, status: "error", error: "No subscription item." });
          continue;
        }

        const currentCents = Number(item.price?.unit_amount || 0);

        if (currentCents === targetCents) {
          unchanged += 1;
          results.push({ label, email: p.email, status: "unchanged", fromCents: currentCents, toCents: targetCents });
          continue;
        }

        if (dryRun) {
          results.push({ label, email: p.email, status: "would_change", fromCents: currentCents, toCents: targetCents });
          continue;
        }

        // Create a new price on the SAME product, then swap the item onto it.
        const productId =
          typeof item.price?.product === "string"
            ? item.price.product
            : item.price?.product?.id;

        const newPrice = await stripe.prices.create({
          currency: "usd",
          unit_amount: targetCents,
          recurring: { interval: "month" },
          ...(productId
            ? { product: productId }
            : { product_data: { name: "FLOW Professional" } }),
        });

        await stripe.subscriptions.update(p.stripe_subscription_id, {
          items: [{ id: item.id, price: newPrice.id }],
          proration_behavior: prorationBehavior as any,
          cancel_at_period_end: false,
        });

        changed += 1;
        results.push({ label, email: p.email, status: "changed", fromCents: currentCents, toCents: targetCents });
      } catch (err: any) {
        failed += 1;
        results.push({ label, email: p.email, status: "error", error: err?.message || "Stripe error." });
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      proration: prorationBehavior,
      totalActive: subs.length,
      changed,
      unchanged,
      failed,
      results,
      pricing: {
        standardCents: pricing.standardPriceCents,
        foundingCents: pricing.foundingMemberPriceCents,
      },
    });
  } catch (error: any) {
    console.error("Reprice subscribers route error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to re-price subscribers." },
      { status: 500 }
    );
  }
}
