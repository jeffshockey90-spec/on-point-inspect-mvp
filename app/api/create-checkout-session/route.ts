import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: "2026-05-27.dahlia",
  });
}

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function calculatePriceFromSqft(squareFeet: any) {
  const sqft = getNumber(squareFeet);

  if (!sqft || sqft <= 0) return 0;
  if (sqft <= 2000) return 500;

  return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
}

function getInvoiceAmount(inspection: any) {
  return (
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.total_price) ||
    getNumber(inspection?.total) ||
    getNumber(inspection?.price) ||
    getNumber(inspection?.inspection_price) ||
    getNumber(inspection?.inspection_fee) ||
    calculatePriceFromSqft(inspection?.square_feet || inspection?.sqft) ||
    0
  );
}

function getAmountPaid(inspection: any) {
  return getNumber(inspection?.amount_paid);
}

function getBalanceDue(inspection: any) {
  if (
    inspection?.balance_due !== null &&
    inspection?.balance_due !== undefined
  ) {
    return getNumber(inspection.balance_due);
  }

  return Math.max(0, getInvoiceAmount(inspection) - getAmountPaid(inspection));
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const PORTAL_PROCESSING_FEE_DOLLARS = 15;

function getPortalProcessingFee(balanceDue: number) {
  if (!balanceDue || balanceDue <= 0) return 0;

  return PORTAL_PROCESSING_FEE_DOLLARS;
}

function getValidEmail(value: any) {
  const email = String(value || "").trim().toLowerCase();

  if (!email || !email.includes("@") || !email.includes(".")) {
    return undefined;
  }

  return email;
}

export async function POST(req: Request) {
  try {
    const stripe = getStripe();
    const { inspectionId } = await req.json();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: inspection, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (error || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const balanceDue = getBalanceDue(inspection);
    const portalProcessingFee = getPortalProcessingFee(balanceDue);
    const totalOnlinePayment = balanceDue + portalProcessingFee;

    if (!balanceDue || balanceDue <= 0) {
      return NextResponse.json(
        { error: "This inspection has no balance due." },
        { status: 400 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "https://on-point-inspect-mvp.vercel.app";

    const property =
      inspection.property_address ||
      inspection.address ||
      "Inspection";

    const clientEmail = getValidEmail(inspection.client_email);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: clientEmail,
      client_reference_id: String(inspectionId),
      metadata: {
        inspection_id: String(inspectionId),
        property_address: String(property),
        invoice_balance_due: String(balanceDue),
        portal_processing_fee: String(portalProcessingFee),
        total_online_payment: String(totalOnlinePayment),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(balanceDue * 100),
            product_data: {
              name: "Inspection Balance Due",
              description: `On Point Home Inspections - ${property}`,
            },
          },
        },
        ...(portalProcessingFee > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "usd",
                  unit_amount: Math.round(portalProcessingFee * 100),
                  product_data: {
                    name: "Online Payment Processing Fee",
                    description:
                      "Small portal fee for using online card checkout.",
                  },
                },
              },
            ]
          : []),
      ],
      success_url: `${appUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/payment-cancelled?inspection_id=${inspectionId}`,
    });

    await supabase
      .from("inspections")
      .update({
        invoice_status: "Pending",
        payment_status: "Pending",
        stripe_checkout_session_id: session.id,
        payment_notes: `Stripe checkout opened. Balance due: $${balanceDue.toFixed(
          2
        )}. Online payment fee: $${portalProcessingFee.toFixed(
          2
        )}. Total online checkout: $${totalOnlinePayment.toFixed(2)}.`,
      })
      .eq("id", inspectionId);

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      balanceDue,
      portalProcessingFee,
      totalOnlinePayment,
    });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
