import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-05-27.dahlia",
});

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

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

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value || 0);
}

function getClientEmail(inspection: any, session: Stripe.Checkout.Session) {
  const email =
    inspection?.client_email ||
    session.customer_details?.email ||
    session.customer_email ||
    "";

  if (!email || !String(email).includes("@")) return "";

  return String(email);
}

function buildReceiptHtml({
  inspection,
  amountPaid,
  balanceDue,
  paidAt,
  sessionId,
  portalProcessingFee,
  totalCharged,
}: {
  inspection: any;
  amountPaid: number;
  balanceDue: number;
  paidAt: string;
  sessionId: string;
  portalProcessingFee: number;
  totalCharged: number;
}) {
  const property =
    inspection?.property_address ||
    inspection?.address ||
    "Inspection Property";

  const client = inspection?.client_name || "Client";

  return `
    <div style="margin:0;padding:0;background:#020617;font-family:Arial,sans-serif;color:#ffffff;">
      <div style="max-width:680px;margin:0 auto;padding:28px;">
        <div style="border:1px solid #1e293b;background:#0f172a;border-radius:20px;overflow:hidden;">
          <div style="background:#071224;padding:28px;border-bottom:1px solid #1e293b;">
            <p style="margin:0;color:#2dd4bf;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">
              On Point Home Inspections
            </p>
            <h1 style="margin:12px 0 0;color:#ffffff;font-size:30px;line-height:1.2;">
              Payment Received
            </h1>
            <p style="margin:10px 0 0;color:#cbd5e1;font-size:15px;">
              Thank you. Your inspection payment has been successfully received.
            </p>
          </div>

          <div style="padding:28px;">
            <p style="margin:0 0 16px;color:#e2e8f0;font-size:16px;">
              Hi ${client},
            </p>

            <p style="margin:0 0 22px;color:#cbd5e1;font-size:15px;line-height:1.7;">
              This confirms your payment for the inspection at:
            </p>

            <div style="border:1px solid #334155;background:#020617;border-radius:14px;padding:18px;margin-bottom:22px;">
              <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                Property
              </p>
              <p style="margin:7px 0 0;color:#ffffff;font-size:18px;font-weight:800;">
                ${property}
              </p>
            </div>

            <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:22px;">
              <div style="border:1px solid #334155;background:#071224;border-radius:14px;padding:16px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Inspection Balance Paid
                </p>
                <p style="margin:7px 0 0;color:#4ade80;font-size:28px;font-weight:900;">
                  ${money(amountPaid)}
                </p>
              </div>

              <div style="border:1px solid #334155;background:#071224;border-radius:14px;padding:16px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Online Payment Fee
                </p>
                <p style="margin:7px 0 0;color:#facc15;font-size:28px;font-weight:900;">
                  ${money(portalProcessingFee)}
                </p>
              </div>

              <div style="border:1px solid #334155;background:#071224;border-radius:14px;padding:16px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Total Charged Online
                </p>
                <p style="margin:7px 0 0;color:#4ade80;font-size:28px;font-weight:900;">
                  ${money(totalCharged)}
                </p>
              </div>

              <div style="border:1px solid #334155;background:#071224;border-radius:14px;padding:16px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                  Balance Due
                </p>
                <p style="margin:7px 0 0;color:#2dd4bf;font-size:28px;font-weight:900;">
                  ${money(balanceDue)}
                </p>
              </div>
            </div>

            <div style="border-top:1px solid #334155;padding-top:18px;color:#94a3b8;font-size:13px;line-height:1.7;">
              <p style="margin:0;"><strong>Paid At:</strong> ${paidAt}</p>
              <p style="margin:4px 0 0;"><strong>Receipt / Session:</strong> ${sessionId}</p>
            </div>

            <p style="margin:24px 0 0;color:#cbd5e1;font-size:14px;line-height:1.7;">
              If your agreement is signed and the inspection report has been published, your report will be available in the client portal.
            </p>
          </div>
        </div>

        <p style="text-align:center;margin:18px 0 0;color:#64748b;font-size:12px;">
          On Point Home Inspections LLC • onpointhomeinspect.com
        </p>
      </div>
    </div>
  `;
}

async function sendReceiptEmail({
  inspection,
  session,
  amountPaid,
  balanceDue,
  paidAt,
  portalProcessingFee,
  totalCharged,
}: {
  inspection: any;
  session: Stripe.Checkout.Session;
  amountPaid: number;
  balanceDue: number;
  paidAt: string;
  portalProcessingFee: number;
  totalCharged: number;
}) {
  if (!resend) {
    console.warn("Receipt email skipped: RESEND_API_KEY is missing.");
    return;
  }

  const to = getClientEmail(inspection, session);

  if (!to) {
    console.warn("Receipt email skipped: no valid client email.");
    return;
  }

  const property =
    inspection?.property_address ||
    inspection?.address ||
    "Inspection";

  const from =
    process.env.REPORT_EMAIL_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    "On Point Home Inspections <agreements@onpointhomeinspect.com>";

  const html = buildReceiptHtml({
    inspection,
    amountPaid,
    balanceDue,
    paidAt,
    sessionId: session.id,
    portalProcessingFee,
    totalCharged,
  });

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Payment Received - ${property}`,
    html,
  });

  if (error) {
    console.error("Receipt email send error:", error);
  }
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

      const totalCharged = session.amount_total
        ? session.amount_total / 100
        : 0;

      const portalProcessingFee = Number(
        session.metadata?.portal_processing_fee || 0
      );

      const amountPaid =
        Number(session.metadata?.invoice_balance_due || 0) ||
        Math.max(0, totalCharged - portalProcessingFee);

      const paidAt = new Date().toISOString();
      const supabase = getSupabaseAdmin();

      const { data: existingInspection } = await supabase
        .from("inspections")
        .select("*")
        .eq("id", inspectionId)
        .single();

      const { error } = await supabase
        .from("inspections")
        .update({
          payment_status: "Paid",
          invoice_status: "Paid",
          amount_paid: amountPaid,
          balance_due: 0,
          payment_method: "Stripe",
          payment_notes: `Stripe payment completed. Inspection balance paid: ${money(
            amountPaid
          )}. Online payment fee: ${money(
            portalProcessingFee
          )}. Total charged online: ${money(totalCharged)}. Session: ${session.id}`,
          invoice_notes: `Stripe payment completed. Inspection balance paid: ${money(
            amountPaid
          )}. Online payment fee: ${money(
            portalProcessingFee
          )}. Total charged online: ${money(totalCharged)}. Session: ${session.id}`,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
          stripe_checkout_session_id: session.id,
          paid_at: paidAt,
        })
        .eq("id", inspectionId);

      if (error) {
        console.error("Supabase payment update error:", error);

        return NextResponse.json(
          { error: "Failed to update inspection payment." },
          { status: 500 }
        );
      }

      if (existingInspection) {
        await sendReceiptEmail({
          inspection: existingInspection,
          session,
          amountPaid,
          balanceDue: 0,
          paidAt,
          portalProcessingFee,
          totalCharged,
        });
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
