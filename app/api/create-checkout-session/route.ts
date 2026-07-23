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

function getValidEmail(value: any) {
  const email = String(value || "").trim().toLowerCase();

  if (!email || !email.includes("@") || !email.includes(".")) {
    return undefined;
  }

  return email;
}

function getCompanyDisplayName(company: any) {
  return company?.display_name || company?.name || "Inspection Company";
}

async function getCompanyForInspection(supabase: any, inspection: any) {
  if (inspection?.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("id", inspection.company_id)
      .maybeSingle();

    if (data) return data;
  }

  if (inspection?.inspector_id) {
    const { data: companyUser } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", inspection.inspector_id)
      .maybeSingle();

    if (companyUser?.company_id) {
      const { data } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyUser.company_id)
        .maybeSingle();

      if (data) return data;
    }
  }

  return null;
}

function getStripeConnectBlocker(company: any) {
  if (!company) return "This inspection is not connected to a company profile.";
  if (!company.stripe_account_id) return "This inspector has not connected a Stripe account yet.";
  if (company.stripe_onboarding_complete !== true) return "This inspector has not completed Stripe onboarding yet.";
  if (company.stripe_charges_enabled !== true) return "This inspector is not approved to accept Stripe charges yet.";
  return "";
}

function getPortalProcessingFee(balanceDue: number, company: any) {
  if (!balanceDue || balanceDue <= 0) return 0;
  if (company?.online_payment_fee_enabled === false) return 0;

  const amount = getNumber(company?.online_payment_fee_amount);
  return amount > 0 ? amount : 0;
}

async function logStripeEvent(supabase: any, payload: any) {
  try {
    await supabase.from("stripe_logs").insert({
      inspection_id: Number(payload.inspectionId),
      payment_intent_id: payload.paymentIntentId || null,
      amount: payload.amount ?? null,
      status: payload.status,
      metadata: payload.metadata || {},
    });
  } catch (error) {
    console.error("Stripe log insert failed:", error);
  }
}

export async function POST(req: Request) {
  try {
    const stripe = getStripe();
    const { inspectionId } = await req.json();

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: inspection, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (error || !inspection) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    const company = await getCompanyForInspection(supabase, inspection);
    const stripeBlocker = getStripeConnectBlocker(company);

    if (stripeBlocker) {
      return NextResponse.json(
        {
          error: "Online payment is not available until this inspector connects their own Stripe account.",
          details: stripeBlocker,
        },
        { status: 403 }
      );
    }

    const connectedStripeAccountId = String(company.stripe_account_id);
    const companyName = getCompanyDisplayName(company);

    const balanceDue = getBalanceDue(inspection);
    const portalProcessingFee = getPortalProcessingFee(balanceDue, company);
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
      "https://app.flowinspect.app";

    const property = inspection.property_address || inspection.address || "Inspection";
    const clientEmail = getValidEmail(inspection.client_email);

    const metadata: Record<string, string> = {
      inspection_id: String(inspectionId),
      property_address: String(property),
      invoice_balance_due: String(balanceDue),
      portal_processing_fee: String(portalProcessingFee),
      total_online_payment: String(totalOnlinePayment),
      company_id: String(company.id),
      company_name: String(companyName),
      stripe_connect_account: connectedStripeAccountId,
      charge_type: "direct_charge",
    };

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: clientEmail,
        client_reference_id: String(inspectionId),
        metadata,
        payment_intent_data: {
          metadata,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(balanceDue * 100),
              product_data: {
                name: "Inspection Balance Due",
                description: `${companyName} - ${property}`,
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
                        "Optional online card payment fee set by the inspector.",
                    },
                  },
                },
              ]
            : []),
        ],
        success_url: `${appUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&stripe_account=${connectedStripeAccountId}`,
        cancel_url: `${appUrl}/payment-cancelled?inspection_id=${inspectionId}`,
      },
      {
        stripeAccount: connectedStripeAccountId,
      }
    );

    await supabase
      .from("inspections")
      .update({
        invoice_status: "Pending",
        payment_status: "Pending",
        stripe_checkout_session_id: session.id,
        payment_notes: `Stripe checkout opened as direct charge. Balance due: $${balanceDue.toFixed(
          2
        )}. Online payment fee: $${portalProcessingFee.toFixed(
          2
        )}. Total online checkout: $${totalOnlinePayment.toFixed(
          2
        )}. Stripe account: ${connectedStripeAccountId}.`,
      })
      .eq("id", inspectionId);

    await logStripeEvent(supabase, {
      inspectionId,
      paymentIntentId: session.payment_intent ? String(session.payment_intent) : null,
      amount: totalOnlinePayment,
      status: "checkout_created",
      metadata: {
        sessionId: session.id,
        balanceDue,
        portalProcessingFee,
        totalOnlinePayment,
        property,
        clientEmail,
        companyId: company?.id || null,
        companyName,
        stripeConnectAccount: connectedStripeAccountId,
        chargeType: "direct_charge",
      },
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      balanceDue,
      portalProcessingFee,
      totalOnlinePayment,
      stripeConnectEnabled: true,
      chargeType: "direct_charge",
    });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
