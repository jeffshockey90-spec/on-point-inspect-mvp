import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-05-27.dahlia",
});

function getSupabaseAdmin() {
  return createClient(
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

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 }
    );
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET." },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error: any) {
    console.error("Stripe webhook signature error:", error.message);

    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 }
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const inspectionId =
        session.metadata?.inspection_id || session.client_reference_id;

      if (!inspectionId) {
        return NextResponse.json(
          { error: "Missing inspection ID on Stripe session." },
          { status: 400 }
        );
      }

      const amountPaid = session.amount_total
        ? session.amount_total / 100
        : 0;

      const supabase = getSupabaseAdmin();

      const { error } = await supabase
        .from("inspections")
        .update({
          payment_status: "Paid",
          invoice_status: "Paid",
          amount_paid: amountPaid,
          balance_due: 0,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
          stripe_checkout_session_id: session.id,
          paid_at: new Date().toISOString(),
        })
        .eq("id", inspectionId);

      if (error) {
        console.error("Supabase payment update error:", error);

        return NextResponse.json(
          { error: "Failed to update inspection payment." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Stripe webhook handler error:", error);

    return NextResponse.json(
      { error: error?.message || "Webhook handler failed." },
      { status: 500 }
    );
  }
}