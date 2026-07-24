import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { Resend } from "resend";
import { getCompanyBrandingById, buildBrandedFromHeader } from "../../../lib/companyBranding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    calculatePriceFromSqft(inspection?.sqft || inspection?.square_feet) ||
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
    const storedBalance = getNumber(inspection.balance_due);

    if (storedBalance > 0) return storedBalance;
  }

  return Math.max(0, getInvoiceAmount(inspection) - getAmountPaid(inspection));
}

function money(value: any) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(getNumber(value));
}

function getValidEmail(value: any) {
  const email = String(value || "").trim();

  if (!email || !email.includes("@") || !email.includes(".")) return "";

  return email;
}

function escapeHtml(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function POST(req: Request) {
  try {
    const { inspectionId } = await req.json();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Missing RESEND_API_KEY." },
        { status: 500 }
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

    const branding = await getCompanyBrandingById(inspection.company_id);

    const to = getValidEmail(inspection.client_email);

    if (!to) {
      return NextResponse.json(
        { error: "No valid client_email found for this inspection." },
        { status: 400 }
      );
    }

    const balanceDue = getBalanceDue(inspection);

    if (balanceDue <= 0) {
      return NextResponse.json(
        { error: "This invoice has no balance due." },
        { status: 400 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "https://app.flowinspect.app";

    const property =
      inspection.address ||
      inspection.property_address ||
      "Inspection Property";

    const clientName = inspection.client_name || inspection.client || "Client";

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: to,
      client_reference_id: String(inspectionId),
      metadata: {
        inspection_id: String(inspectionId),
        property_address: String(property),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(balanceDue * 100),
            product_data: {
              name: "Home Inspection Payment",
              description: `${branding.name} - ${property}`,
            },
          },
        },
      ],
      success_url: `${appUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/payment-cancelled?inspection_id=${inspectionId}`,
    });

    await supabase
      .from("inspections")
      .update({
        invoice_status: "Unpaid",
        payment_status: "Pending",
        stripe_checkout_session_id: session.id,
      })
      .eq("id", inspectionId);

    const from = buildBrandedFromHeader(
      branding,
      "On Point Home Inspections <agreements@onpointhomeinspect.com>"
    );

    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error: emailError } = await resend.emails.send({
      from,
      to,
      subject: `Invoice Reminder - ${property}`,
      html: `
        <div style="margin:0;padding:0;background:#020617;font-family:Arial,sans-serif;color:#ffffff;">
          <div style="max-width:680px;margin:0 auto;padding:28px;">
            <div style="border:1px solid #1e293b;background:#0f172a;border-radius:20px;overflow:hidden;">
              <div style="background:#071224;padding:28px;border-bottom:1px solid #1e293b;">
                <p style="margin:0;color:#2dd4bf;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">
                  ${escapeHtml(branding.name)}
                </p>
                <h1 style="margin:12px 0 0;color:#ffffff;font-size:30px;line-height:1.2;">
                  Invoice Reminder
                </h1>
                <p style="margin:10px 0 0;color:#cbd5e1;font-size:15px;">
                  This is a friendly reminder that your inspection invoice has a remaining balance.
                </p>
              </div>

              <div style="padding:28px;">
                <p style="margin:0 0 16px;color:#e2e8f0;font-size:16px;">
                  Hello ${clientName},
                </p>

                <p style="margin:0 0 22px;color:#cbd5e1;font-size:15px;line-height:1.7;">
                  Payment is still outstanding for the inspection at:
                </p>

                <div style="border:1px solid #334155;background:#020617;border-radius:14px;padding:18px;margin-bottom:22px;">
                  <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                    Property
                  </p>
                  <p style="margin:7px 0 0;color:#ffffff;font-size:18px;font-weight:800;">
                    ${property}
                  </p>
                </div>

                <div style="border:1px solid #334155;background:#071224;border-radius:14px;padding:16px;margin-bottom:22px;">
                  <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                    Balance Due
                  </p>
                  <p style="margin:7px 0 0;color:#fb7185;font-size:28px;font-weight:900;">
                    ${money(balanceDue)}
                  </p>
                </div>

                <a href="${session.url}" style="display:inline-block;background:#14b8a6;color:#020617;text-decoration:none;font-weight:900;padding:14px 22px;border-radius:12px;">
                  Pay Invoice
                </a>

                <p style="margin:24px 0 0;color:#cbd5e1;font-size:14px;line-height:1.7;">
                  Thank you,<br />
                  ${escapeHtml(branding.name)}
                </p>
              </div>
            </div>

            <p style="text-align:center;margin:18px 0 0;color:#64748b;font-size:12px;">
              ${escapeHtml(branding.name)}${
                branding.website || branding.email
                  ? ` • ${escapeHtml(branding.website || branding.email || "")}`
                  : ""
              }
            </p>
          </div>
        </div>
      `,
    });

    if (emailError) {
      console.error("Invoice reminder email error:", emailError);

      return NextResponse.json(
        { error: "Failed to send reminder email." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Invoice reminder error:", error);

    return NextResponse.json(
      { error: error?.message || "Failed to send invoice reminder." },
      { status: 500 }
    );
  }
}
