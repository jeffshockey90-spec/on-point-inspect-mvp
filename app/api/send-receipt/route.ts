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
import { buildReceiptHtml, buildReceiptNumber } from "../../../lib/receiptEmail";
import { deriveServiceFees } from "../../../lib/agreementTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(value: any): number {
  const n = Number(value);
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SERVICE_LABELS: Record<string, string> = {
  home: "Home Inspection",
  home_inspection: "Home Inspection",
  radon: "Radon Testing",
  mold: "Mold Testing",
  water: "Water Testing",
  well_water: "Well Water Testing",
  sewer_scope: "Sewer Scope",
  termite: "Termite / WDO",
  termite_wdo: "Termite / WDO",
  wdo: "Termite / WDO",
  pool: "Pool & Spa",
  pool_spa: "Pool & Spa",
  pre_drywall: "Pre-Drywall",
  structural: "Structural & Mechanical",
};

function serviceLabel(key: string): string {
  if (SERVICE_LABELS[key]) return SERVICE_LABELS[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function serviceItems(inspection: any): { label: string; amount: number }[] {
  const map = deriveServiceFees(inspection) || {};
  const items = Object.entries(map)
    .map(([key, value]) => ({ key, label: serviceLabel(key), amount: num(value) }))
    .filter((it) => it.amount > 0);
  // Home inspection first, then the rest in a stable order.
  items.sort((a, b) => {
    const homeA = a.key === "home" || a.key === "home_inspection" ? 0 : 1;
    const homeB = b.key === "home" || b.key === "home_inspection" ? 0 : 1;
    return homeA - homeB || a.label.localeCompare(b.label);
  });
  // Collapse the duplicate home/home_inspection labels if both slipped through.
  const seen = new Set<string>();
  return items.filter((it) => (seen.has(it.label) ? false : (seen.add(it.label), true)));
}

type BuiltReceipt =
  | {
      ok: true;
      html: string;
      subject: string;
      defaultTo: string;
      amountPaid: number;
      methodLabel: string;
    }
  | { ok: false; status: number; error: string };

// Shared build used by BOTH the preview (GET) and the send (POST) so the
// inspector verifies exactly what the client will receive.
async function buildReceiptForInspection(
  admin: ReturnType<typeof getAdminClient>,
  inspectionId: string,
): Promise<BuiltReceipt> {
  const { data: inspection, error } = await admin
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .maybeSingle();
  if (error) throw error;
  if (!inspection) return { ok: false, status: 404, error: "Inspection not found." };

  const amountPaid = num(inspection.amount_paid);
  const status = String(inspection.payment_status || inspection.invoice_status || "");
  if (amountPaid <= 0) {
    return {
      ok: false,
      status: 400,
      error: "No payment is recorded yet. Mark the payment paid (with an amount) first.",
    };
  }

  const invoiceTotal = invoiceTotalOf(inspection) || null;
  const balanceDue =
    inspection.balance_due != null
      ? Math.max(0, num(inspection.balance_due))
      : Math.max(0, (invoiceTotal || 0) - amountPaid);

  const branding = await getCompanyBrandingById(inspection.company_id);
  const property =
    inspection.property_address || inspection.address || "Inspection Property";
  const paidAtIso = inspection.paid_at || new Date().toISOString();
  const paidAtLabel = (() => {
    const d = new Date(paidAtIso);
    return Number.isNaN(d.getTime())
      ? new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  })();

  const methodRaw = String(inspection.payment_method || "").trim();
  const methodLabel = status.toLowerCase() === "waived" ? "Waived" : methodRaw || "Payment";

  const html = buildReceiptHtml({
    branding,
    clientName: inspection.client_name || "there",
    property,
    receiptNumber: buildReceiptNumber(inspectionId, paidAtIso),
    paidAtLabel,
    methodLabel,
    reference:
      String(inspection.payment_notes || inspection.invoice_notes || "").trim() || undefined,
    invoiceTotal,
    services: serviceItems(inspection),
    amountPaid,
    balanceDue,
  });

  const defaultTo = String(
    inspection.client_email || inspection.email || inspection.contact_email || "",
  ).trim();

  return {
    ok: true,
    html,
    subject: `Payment receipt — ${property}`,
    defaultTo,
    amountPaid,
    methodLabel,
  };
}

// GET — preview only. Returns the exact receipt HTML (no send, no log).
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const url = new URL(req.url);
    const inspectionId = String(url.searchParams.get("inspectionId") || "").trim();
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const built = await buildReceiptForInspection(admin, inspectionId);
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: built.status });
    }

    return NextResponse.json({
      ok: true,
      html: built.html,
      defaultTo: built.defaultTo,
      subject: built.subject,
    });
  } catch (error: any) {
    console.error("Preview receipt error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to build the receipt preview." },
      { status: 500 },
    );
  }
}

// POST — send (or re-send) the receipt to the client. Works for Stripe-paid and
// manually-recorded (cash/check/etc.) payments. The inspector records the
// payment in the builder's Payment panel first; this emails the branded receipt.
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = String(body?.inspectionId || body?.inspection_id || "").trim();
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspectionId." }, { status: 400 });
    }

    const admin = getAdminClient();
    const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
    if (!authorized) return notFound();

    const built = await buildReceiptForInspection(admin, inspectionId);
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: built.status });
    }

    const to = String(body?.recipientEmail || built.defaultTo || "").trim();
    if (!to || !EMAIL_RE.test(to)) {
      return NextResponse.json(
        { error: "No valid client email to send the receipt to." },
        { status: 400 },
      );
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: "Email is not configured." }, { status: 500 });
    }

    const branding = await getCompanyBrandingById(
      (await admin.from("inspections").select("company_id").eq("id", inspectionId).maybeSingle())
        .data?.company_id,
    );
    const from = buildBrandedFromHeader(branding);

    const resend = new Resend(resendKey);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: built.subject,
      html: built.html,
    });

    // Log to Sent Emails. Per the email_logs gotcha, the numeric id goes in
    // inspection_id_bigint (NOT inspection_id, which is a UUID column).
    try {
      await admin.from("email_logs").insert({
        inspection_id_bigint: Number(inspectionId),
        recipient: to,
        recipient_email: to,
        email_type: "payment_receipt",
        subject: built.subject,
        message: error ? "Receipt send failed." : `Receipt sent to ${to}.`,
        status: error ? "failed" : "sent",
        resend_id: (data as any)?.id || null,
        sent_at: error ? null : new Date().toISOString(),
        metadata: {
          type: "manual_payment_receipt",
          amountPaid: built.amountPaid,
          method: built.methodLabel,
        },
      });
    } catch (logErr) {
      console.error("Receipt email log insert failed:", logErr);
    }

    if (error) {
      return NextResponse.json(
        { error: (error as any)?.message || "Could not send the receipt." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, sentTo: to });
  } catch (error: any) {
    console.error("Send receipt error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to send the receipt." },
      { status: 500 },
    );
  }
}
