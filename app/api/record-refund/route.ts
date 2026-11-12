import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../lib/apiAuth";
import {
  getCompanyBrandingById,
  buildBrandedFromHeader,
} from "../../../lib/companyBranding";
import { buildRefundHtml, buildRefundNumber } from "../../../lib/refundEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function num(value: any): number {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function invoiceTotalOf(i: any): number {
  return (
    num(i.invoice_amount) ||
    num(i.total_price) ||
    num(i.total) ||
    num(i.price) ||
    num(i.inspection_price) ||
    num(i.inspection_fee) ||
    0
  );
}

type BuiltRefund = {
  html: string;
  subject: string;
  defaultTo: string;
  property: string;
  fullyRefunded: boolean;
  totalRefunded: number;
  methodLabel: string;
};

// Shared builder used by BOTH the preview (GET) and the send (POST) so the
// inspector verifies exactly what the client will receive. `thisRefund` is the
// amount of the refund being issued now; `totalRefunded` is the cumulative
// (existing on record + this one) used for the "total refunded to date" line.
async function buildRefundNotice(
  inspection: any,
  thisRefund: number,
  opts: { method?: string; reason?: string },
): Promise<BuiltRefund> {
  const amountPaid = num(inspection.amount_paid);
  const invoiceTotal = invoiceTotalOf(inspection);
  const basis = amountPaid > 0 ? amountPaid : invoiceTotal;
  const prevRefunded = num(inspection.amount_refunded);
  const totalRefunded = Math.round((prevRefunded + thisRefund) * 100) / 100;
  const fullyRefunded = basis > 0 ? totalRefunded >= basis - 0.005 : totalRefunded > 0;

  const branding = await getCompanyBrandingById(inspection.company_id);
  const property =
    inspection.property_address || inspection.address || "Inspection Property";
  const refundedAtIso = new Date().toISOString();
  const refundedAtLabel = new Date(refundedAtIso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const methodLabel = String(opts.method || inspection.payment_method || "").trim() || "Refund";

  const html = buildRefundHtml({
    branding,
    clientName: inspection.client_name || "there",
    property,
    refundNumber: buildRefundNumber(inspection.id, refundedAtIso),
    refundedAtLabel,
    methodLabel,
    refundAmount: thisRefund,
    totalRefunded,
    amountPaid: amountPaid > 0 ? amountPaid : null,
    fullyRefunded,
    reason: String(opts.reason || "").trim() || undefined,
  });

  const defaultTo = String(
    inspection.client_email || inspection.email || inspection.contact_email || "",
  ).trim();

  return {
    html,
    subject: `Refund issued — ${property}`,
    defaultTo,
    property,
    fullyRefunded,
    totalRefunded,
    methodLabel,
  };
}

async function loadInspection(admin: ReturnType<typeof getAdminClient>, inspectionId: string) {
  const { data, error } = await admin
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// GET — preview only. Returns the exact refund-notice HTML for a hypothetical
// refund amount (no DB write, no send). ?amount= is the refund being previewed.
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const url = new URL(req.url);
    const inspectionId = String(url.searchParams.get("inspectionId") || "").trim();
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }
    const amount = num(url.searchParams.get("amount"));

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const inspection = await loadInspection(admin, inspectionId);
    if (!inspection) return notFound("Inspection not found.");

    const built = await buildRefundNotice(inspection, amount, {
      method: url.searchParams.get("method") || "",
      reason: url.searchParams.get("reason") || "",
    });

    return NextResponse.json({
      ok: true,
      html: built.html,
      defaultTo: built.defaultTo,
      subject: built.subject,
    });
  } catch (error: any) {
    console.error("Preview refund error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to build the refund preview." },
      { status: 500 },
    );
  }
}

// POST — record a refund, and optionally email the client a branded notice.
//
// A refund is stored as its OWN cumulative quantity (amount_refunded). It does
// NOT touch amount_paid or balance_due and does NOT null paid_at — the invoice
// stays satisfied and a delivered report stays unlocked. This covers refunds
// issued any way (card, cash, check, Zelle, …); Stripe card refunds also flow
// through the webhook the same way.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = String(body?.inspectionId || body?.inspection_id || "").trim();
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }

    const thisRefund = Math.round(num(body?.amount) * 100) / 100;
    if (!(thisRefund > 0)) {
      return NextResponse.json({ error: "Enter a refund amount greater than $0." }, { status: 400 });
    }

    const method = String(body?.method || "").trim();
    const reason = String(body?.reason || "").trim();
    const sendEmail = body?.sendEmail === true || body?.sendEmail === "true";

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const inspection = await loadInspection(admin, inspectionId);
    if (!inspection) return notFound("Inspection not found.");

    const amountPaid = num(inspection.amount_paid);
    const invoiceTotal = invoiceTotalOf(inspection);
    const basis = amountPaid > 0 ? amountPaid : invoiceTotal;
    const prevRefunded = num(inspection.amount_refunded);
    const totalRefunded = Math.round((prevRefunded + thisRefund) * 100) / 100;

    // Guard: never record more refunded than was collected (or invoiced).
    if (basis > 0 && totalRefunded > basis + 0.005) {
      return NextResponse.json(
        {
          error: `Refund exceeds the amount collected. Up to ${formatDollars(
            Math.max(0, basis - prevRefunded),
          )} remains refundable on this inspection.`,
        },
        { status: 400 },
      );
    }

    const fullyRefunded = basis > 0 ? totalRefunded >= basis - 0.005 : totalRefunded > 0;
    const newStatus = fullyRefunded ? "Refunded" : "Partial Refund";
    const refundedAtIso = new Date().toISOString();
    const note = `Refund recorded: ${formatDollars(thisRefund)}${
      method ? ` via ${method}` : ""
    }${reason ? ` — ${reason}` : ""}.`;

    const { error: updateError } = await admin
      .from("inspections")
      .update({
        payment_status: newStatus,
        invoice_status: newStatus,
        // Intentionally NOT touching amount_paid / balance_due / paid_at: a
        // refund returns collected money, it is not a new balance owed, and the
        // delivered report must stay unlocked (full or partial refund).
        amount_refunded: totalRefunded,
        refunded_at: refundedAtIso,
        payment_notes: note,
        invoice_notes: note,
      })
      .eq("id", inspection.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || "Failed to record the refund." },
        { status: 500 },
      );
    }

    // Record to audit_logs so the owner Refunds dashboard shows manual refunds
    // alongside Stripe ones (it reads resource_id + metadata.amountRefunded).
    try {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "refund_recorded",
        resource_type: "inspection",
        resource_id: String(inspection.id),
        metadata: {
          amountRefunded: thisRefund,
          totalRefunded,
          fullyRefunded,
          method: method || null,
          reason: reason || null,
          source: "manual",
        },
      });
    } catch (auditErr) {
      console.error("Refund audit log insert failed:", auditErr);
    }

    // Optionally email the client a branded refund notice.
    let emailResult: { sent: boolean; to?: string; error?: string } = { sent: false };
    if (sendEmail) {
      const built = await buildRefundNotice(inspection, thisRefund, { method, reason });
      const to = String(body?.recipientEmail || built.defaultTo || "").trim();
      if (!to || !EMAIL_RE.test(to)) {
        emailResult = { sent: false, error: "No valid client email to send the refund notice to." };
      } else if (!process.env.RESEND_API_KEY) {
        emailResult = { sent: false, error: "Email is not configured." };
      } else {
        const branding = await getCompanyBrandingById(inspection.company_id);
        const from = buildBrandedFromHeader(branding);
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { data, error } = await resend.emails.send({
          from,
          to,
          subject: built.subject,
          html: built.html,
        });

        // Per the email_logs gotcha, the numeric id goes in inspection_id_bigint
        // (NOT inspection_id, which is a UUID column).
        try {
          await admin.from("email_logs").insert({
            inspection_id_bigint: Number(inspection.id),
            recipient: to,
            recipient_email: to,
            email_type: "payment_refund",
            subject: built.subject,
            message: error ? "Refund notice send failed." : `Refund notice sent to ${to}.`,
            status: error ? "failed" : "sent",
            resend_id: (data as any)?.id || null,
            sent_at: error ? null : new Date().toISOString(),
            metadata: { type: "refund_notice", amountRefunded: thisRefund, method: method || null },
          });
        } catch (logErr) {
          console.error("Refund email log insert failed:", logErr);
        }

        emailResult = error
          ? { sent: false, to, error: (error as any)?.message || "Could not send the refund notice." }
          : { sent: true, to };
      }
    }

    return NextResponse.json({
      ok: true,
      totalRefunded,
      fullyRefunded,
      status: newStatus,
      email: emailResult,
    });
  } catch (error: any) {
    console.error("Record refund error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to record the refund." },
      { status: 500 },
    );
  }
}

function formatDollars(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}
