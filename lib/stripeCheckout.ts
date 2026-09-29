import Stripe from "stripe";
import { getOnlineProcessingFee } from "./onlinePaymentFee";

// Single source of truth for creating an inspection payment checkout. BOTH the
// client portal "Pay Now" and the invoice payment reminder go through here so a
// client always pays the SAME way: a Stripe Connect DIRECT CHARGE on the
// inspector's own connected account, with the online processing fee, and the
// metadata the reconciliation webhook expects. Never create an inspection
// checkout off the raw platform account — that sends the money to the wrong
// place and skips the fee.

export function getStripe() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }
  return new Stripe(stripeSecretKey, {});
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

export function getBalanceDue(inspection: any) {
  if (inspection?.balance_due !== null && inspection?.balance_due !== undefined) {
    const stored = getNumber(inspection.balance_due);
    // The portal treats any non-null balance_due as authoritative; the reminder
    // only trusted it when > 0. Use the > 0 guard so a stale 0 doesn't block a
    // real balance derived from the invoice amount.
    if (stored > 0) return stored;
  }
  return Math.max(0, getInvoiceAmount(inspection) - getAmountPaid(inspection));
}

function getValidEmail(value: any) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@") || !email.includes(".")) return undefined;
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

export type InspectionCheckoutResult =
  | {
      ok: true;
      url: string | null;
      sessionId: string;
      balanceDue: number;
      portalProcessingFee: number;
      totalOnlinePayment: number;
      connectedStripeAccountId: string;
    }
  | { ok: false; error: string; details?: string; status: number };

// Creates the connected-account checkout for an inspection and records it the
// same way the portal always has. `supabase` must be a service-role client.
export async function createInspectionCheckoutSession({
  supabase,
  inspection,
  appUrl,
}: {
  supabase: any;
  inspection: any;
  appUrl: string;
}): Promise<InspectionCheckoutResult> {
  const stripe = getStripe();
  const inspectionId = inspection.id;

  // Carry the share token onto the Stripe return URLs so an anonymous, just-paid
  // client lands back on their token portal instead of a raw-id link.
  const portalReturnToken = String(inspection.public_share_token || "");

  const company = await getCompanyForInspection(supabase, inspection);
  const stripeBlocker = getStripeConnectBlocker(company);
  if (stripeBlocker) {
    return {
      ok: false,
      error:
        "Online payment is not available until this inspector connects their own Stripe account.",
      details: stripeBlocker,
      status: 403,
    };
  }

  const connectedStripeAccountId = String(company.stripe_account_id);
  const companyName = getCompanyDisplayName(company);

  const balanceDue = getBalanceDue(inspection);
  const portalProcessingFee = getOnlineProcessingFee(balanceDue, company);
  const totalOnlinePayment = balanceDue + portalProcessingFee;

  if (!balanceDue || balanceDue <= 0) {
    return { ok: false, error: "This inspection has no balance due.", status: 400 };
  }

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
                      company?.online_payment_fee_type === "stripe_fee"
                        ? "Covers the card processing fee for this payment."
                        : "Optional online card payment fee set by the inspector.",
                  },
                },
              },
            ]
          : []),
      ],
      success_url: `${appUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&stripe_account=${connectedStripeAccountId}${
        portalReturnToken ? `&portal_token=${encodeURIComponent(portalReturnToken)}` : ""
      }`,
      cancel_url: `${appUrl}/payment-cancelled?inspection_id=${inspectionId}${
        portalReturnToken ? `&portal_token=${encodeURIComponent(portalReturnToken)}` : ""
      }`,
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

  return {
    ok: true,
    url: session.url,
    sessionId: session.id,
    balanceDue,
    portalProcessingFee,
    totalOnlinePayment,
    connectedStripeAccountId,
  };
}
