import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY." },
        { status: 500 }
      );
    }

    const userClient = await createUserClient();
    const admin = createAdminClient();

    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    let { data: profile } = await admin
      .from("profiles")
      .select("id,email,stripe_customer_id,stripe_subscription_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile && user.email) {
      const fallback = await admin
        .from("profiles")
        .select("id,email,stripe_customer_id,stripe_subscription_id")
        .eq("email", user.email.toLowerCase())
        .maybeSingle();

      profile = fallback.data;
    }

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No active Stripe customer found for this account." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const wantsCancelFlow = body?.flow === "cancel";

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      });

    const baseUrl = getBaseUrl(req);

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${baseUrl}/billing`,
      ...(wantsCancelFlow && profile.stripe_subscription_id
        ? {
            flow_data: {
              type: "subscription_cancel" as const,
              subscription_cancel: {
                subscription: profile.stripe_subscription_id,
              },
            },
          }
        : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe customer portal error:", error);

    return NextResponse.json(
      { error: error?.message || "Could not open billing portal." },
      { status: 500 }
    );
  }
}
