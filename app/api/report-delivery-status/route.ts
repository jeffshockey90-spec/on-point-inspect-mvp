import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function getInvoiceAmount(inspection: any) {
  return (
    getNumber(inspection?.invoice_amount) ||
    getNumber(inspection?.price) ||
    getNumber(inspection?.amount) ||
    getNumber(inspection?.fee) ||
    0
  );
}

function getBalanceDue(inspection: any) {
  const invoiceAmount = getInvoiceAmount(inspection);
  const amountPaid = getNumber(inspection?.amount_paid);

  if (
    inspection?.balance_due !== null &&
    inspection?.balance_due !== undefined
  ) {
    return getNumber(inspection.balance_due);
  }

  return Math.max(0, invoiceAmount - amountPaid);
}

function isPaymentComplete(inspection: any) {
  const status = String(
    inspection?.payment_status || inspection?.invoice_status || "Unpaid"
  ).toLowerCase();

  const invoiceAmount = getInvoiceAmount(inspection);
  const amountPaid = getNumber(inspection?.amount_paid);
  const balanceDue = getBalanceDue(inspection);

  if (status === "paid" || status === "waived") return true;
  if (invoiceAmount > 0 && amountPaid >= invoiceAmount) return true;

  return balanceDue <= 0 && invoiceAmount > 0;
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const inspectionId = searchParams.get("inspection_id");

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    const { data: inspection, error: inspectionError } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .maybeSingle();

    if (inspectionError) {
      return NextResponse.json(
        { error: inspectionError.message },
        { status: 500 }
      );
    }

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found or not accessible." },
        { status: 404 }
      );
    }

    const { data: contacts, error: contactsError } = await supabase
      .from("inspection_contacts")
      .select("id, name, email, role, agreement_required, agreement_signed")
      .eq("inspection_id", inspectionId);

    if (contactsError) {
      return NextResponse.json(
        { error: contactsError.message },
        { status: 500 }
      );
    }

    const unsignedRequiredContacts = (contacts || []).filter(
      (contact: any) => contact.agreement_required && !contact.agreement_signed
    );

    const paymentComplete = isPaymentComplete(inspection);
    const invoiceAmount = getInvoiceAmount(inspection);
    const amountPaid = getNumber(inspection.amount_paid);
    const balanceDue = getBalanceDue(inspection);

    const blockers: string[] = [];

    if (unsignedRequiredContacts.length > 0) {
      blockers.push(
        `${unsignedRequiredContacts.length} required agreement signature${
          unsignedRequiredContacts.length === 1 ? "" : "s"
        } pending.`
      );
    }

    if (!paymentComplete) {
      blockers.push(`Payment is not complete. Balance due: $${balanceDue}.`);
    }

    return NextResponse.json({
      ok: blockers.length === 0,
      canDeliver: blockers.length === 0,
      blockers,
      paymentComplete,
      invoiceAmount,
      amountPaid,
      balanceDue,
      unsignedRequiredContacts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to check delivery status." },
      { status: 500 }
    );
  }
}
