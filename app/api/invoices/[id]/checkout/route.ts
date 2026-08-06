import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminClient } from "../../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY.");
  return new Stripe(key, {});
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://flowinspect.app"
  );
}

function getValidEmail(value: any) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@") || !email.includes(".")) return undefined;
  return email;
}

// Reuses the EXACT Stripe Connect direct-charge model from
// create-checkout-session: the session is created ON the connected account via
// the `{ stripeAccount }` second argument, so funds land in the inspector's
// account. Do not add transfer_data/on_behalf_of.
function getStripeConnectBlocker(company: any) {
  if (!company) return "No company profile is connected to this invoice.";
  if (!company.stripe_account_id) return "This inspector has not connected a Stripe account yet.";
  if (company.stripe_onboarding_complete !== true) return "This inspector has not completed Stripe onboarding yet.";
  if (company.stripe_charges_enabled !== true) return "This inspector is not approved to accept Stripe charges yet.";
  return "";
}

// GET /api/invoices/[id]/checkout?token=<public_token>
// Public pay link (authorized by the invoice's unguessable public_token). Builds
// a FRESH Connect checkout session for the invoice's line items each time it's
// clicked (so the emailed link never expires) and redirects to Stripe.
export async function GET(req: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const token = new URL(req.url).searchParams.get("token") || "";
    const appUrl = getAppUrl();

    const admin = getAdminClient();
    const { data: invoice } = await admin
      .from("invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!invoice || !token || invoice.public_token !== token) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    if (String(invoice.status).toLowerCase() === "paid") {
      return NextResponse.redirect(
        `${appUrl}/invoices/payment-success?invoice=${encodeURIComponent(token)}&already=1`,
        303
      );
    }

    let company: any = null;
    if (invoice.company_id) {
      const { data } = await admin
        .from("companies")
        .select("*")
        .eq("id", invoice.company_id)
        .maybeSingle();
      company = data;
    }

    const blocker = getStripeConnectBlocker(company);
    if (blocker) return NextResponse.json({ error: blocker }, { status: 403 });

    const connectedStripeAccountId = String(company.stripe_account_id);
    const companyName = company?.display_name || company?.name || "Invoice";

    const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
    const stripeLineItems = lineItems
      .filter((li: any) => Number(li?.unitPrice) > 0 && Number(li?.quantity) > 0)
      .map((li: any) => ({
        quantity: Math.max(1, Math.round(Number(li.quantity) || 1)),
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(li.unitPrice) * 100),
          product_data: {
            name: String(li.description || "Invoice item").slice(0, 250) || "Invoice item",
          },
        },
      }));

    if (stripeLineItems.length === 0) {
      return NextResponse.json(
        { error: "This invoice has no payable line items." },
        { status: 400 }
      );
    }

    const metadata: Record<string, string> = {
      invoice_id: String(invoice.id),
      company_id: String(company.id),
      company_name: String(companyName),
      stripe_connect_account: connectedStripeAccountId,
      charge_type: "direct_charge",
      invoice_total: String(invoice.total || 0),
    };
    if (invoice.inspection_id) metadata.inspection_id = String(invoice.inspection_id);

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: getValidEmail(invoice.client_email),
        client_reference_id: String(invoice.id),
        metadata,
        payment_intent_data: { metadata },
        line_items: stripeLineItems,
        success_url: `${appUrl}/invoices/payment-success?session_id={CHECKOUT_SESSION_ID}&invoice=${encodeURIComponent(token)}`,
        cancel_url: `${appUrl}/invoices/payment-success?invoice=${encodeURIComponent(token)}&cancelled=1`,
      },
      { stripeAccount: connectedStripeAccountId }
    );

    // Record the session and mark the invoice sent (if it was still a draft).
    await admin
      .from("invoices")
      .update({
        stripe_checkout_session_id: session.id,
        status: invoice.status === "draft" ? "sent" : invoice.status,
      })
      .eq("id", invoice.id);

    if (session.url) return NextResponse.redirect(session.url, 303);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  } catch (error: any) {
    console.error("Invoice checkout error:", error);
    return NextResponse.json(
      { error: error?.message || "Checkout failed." },
      { status: 500 }
    );
  }
}
