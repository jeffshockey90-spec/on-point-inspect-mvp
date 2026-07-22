import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

const DEFAULT_MONTHLY_PRICE_CENTS = 6900;
const FOUNDING_MEMBER_PRICE_CENTS = 4900;

async function createUserClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

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

function getBaseUrl(req: Request) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  return new URL(req.url).origin;
}

function isActiveStatus(status: any) {
  const value = String(status || "").toLowerCase();
  return value === "active" || value === "trialing";
}

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY." }, { status: 500 });
  }

  const userClient = await createUserClient();
  const admin = createAdminClient();

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  let { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile && user.email) {
    const fallback = await admin
      .from("profiles")
      .select("*")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();
    profile = fallback.data;
  }

  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  if (profile.subscription_exempt === true || profile.subscription_required === false) {
    return NextResponse.json({ error: "This inspector is already exempt from subscription billing." }, { status: 400 });
  }

  if (isActiveStatus(profile.subscription_status)) {
    return NextResponse.json({ error: "Subscription is already active." }, { status: 400 });
  }

  const customPrice = Number(profile.subscription_price_override_cents || 0);
  const priceCents = customPrice > 0
    ? customPrice
    : profile.founding_member
      ? FOUNDING_MEMBER_PRICE_CENTS
      : DEFAULT_MONTHLY_PRICE_CENTS;

  if (!Number.isFinite(priceCents) || priceCents < 50) {
    return NextResponse.json({ error: "Invalid subscription price." }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let customerId = profile.stripe_customer_id || null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || profile.email || undefined,
      name: profile.full_name || profile.name || profile.business_name || undefined,
      metadata: {
        user_id: user.id,
        profile_id: String(profile.id || user.id),
      },
    });

    customerId = customer.id;

    await admin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", profile.id);
  }

  const baseUrl = getBaseUrl(req);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: priceCents,
          recurring: { interval: "month" },
          product_data: {
            name: "FLOW Professional",
            description: "Monthly inspector subscription",
          },
        },
      },
    ],
    subscription_data: {
      metadata: {
        user_id: user.id,
        profile_id: String(profile.id || user.id),
        plan: profile.founding_member ? "founding" : customPrice > 0 ? "custom" : "professional",
      },
    },
    metadata: {
      user_id: user.id,
      profile_id: String(profile.id || user.id),
      billing_type: "inspector_subscription",
    },
    success_url: `${baseUrl}/billing?success=1`,
    cancel_url: `${baseUrl}/billing?cancelled=1`,
  });

  return NextResponse.json({ url: session.url });
}
