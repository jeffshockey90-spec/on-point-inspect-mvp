import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../../lib/apiAuth";
import { getOnlineProcessingFee } from "../../../../../lib/onlinePaymentFee";
import {
  createDirectChargeCheckoutSession,
  getStripeConnectBlocker,
} from "../../../../../lib/stripeCheckout";
import { isInvoiceClosed } from "../../../../../lib/invoiceStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

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

    // Paid, refunded or disputed invoices can't be paid again.
    if (isInvoiceClosed(invoice.status)) {
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

    const blocker = getStripeConnectBlocker(company, "No company profile is connected to this invoice.");
    if (blocker) return NextResponse.json({ error: blocker }, { status: 403 });

    const connectedStripeAccountId = String(company.stripe_account_id);
    const companyName = company?.display_name || company?.name || "Invoice";

    const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
    let stripeLineItems = lineItems
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

    // Honor the company's online-payment-fee setting (same as inspection
    // checkout): when enabled, the client pays the processing fee on top so the
    // inspector nets the full invoice total. getOnlineProcessingFee returns 0
    // when the fee is toggled off.
    const balanceDue =
      Number(invoice.balance_due) > 0
        ? Number(invoice.balance_due)
        : Number(invoice.total) || 0;
    // A partly-paid invoice: charge the remaining balance, not the full line
    // items again (the client used to be charged the whole invoice twice over).
    const lineItemsTotal =
      Math.round(
        stripeLineItems.reduce(
          (sum: number, li: any) => sum + li.quantity * li.price_data.unit_amount,
          0,
        ),
      ) / 100;
    if (balanceDue > 0 && Math.abs(balanceDue - lineItemsTotal) > 0.005) {
      const firstDescription = String(lineItems[0]?.description || "Invoice").slice(0, 200);
      stripeLineItems = [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(balanceDue * 100),
            product_data: { name: `Balance due — ${firstDescription}`.slice(0, 250) },
          },
        },
      ];
    }
    const processingFee = getOnlineProcessingFee(balanceDue, company);
    const totalOnlinePayment = Math.round((balanceDue + processingFee) * 100) / 100;

    const metadata: Record<string, string> = {
      invoice_id: String(invoice.id),
      company_id: String(company.id),
      company_name: String(companyName),
      stripe_connect_account: connectedStripeAccountId,
      charge_type: "direct_charge",
      invoice_total: String(invoice.total || 0),
      invoice_balance_due: String(balanceDue),
      portal_processing_fee: String(processingFee),
      total_online_payment: String(totalOnlinePayment),
    };
    if (invoice.inspection_id) metadata.inspection_id = String(invoice.inspection_id);

    const { session } = await createDirectChargeCheckoutSession({
      company,
      lineItems: stripeLineItems,
      processingFee,
      clientEmail: getValidEmail(invoice.client_email),
      clientReferenceId: String(invoice.id),
      metadata,
      successUrl: `${appUrl}/invoices/payment-success?session_id={CHECKOUT_SESSION_ID}&invoice=${encodeURIComponent(token)}`,
      cancelUrl: `${appUrl}/invoices/payment-success?invoice=${encodeURIComponent(token)}&cancelled=1`,
    });

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
