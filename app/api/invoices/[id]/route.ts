import { NextResponse } from "next/server";
import { getSessionUser, getAdminClient, unauthorized, notFound } from "../../../../lib/apiAuth";
import { computeInvoiceTotals } from "../../../../lib/invoiceTotals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

// Fetch the invoice only if the caller may act on it: the creator, or an owner
// of the invoice's company. Returns null otherwise (callers respond 404 so ids
// can't be enumerated).
async function authorizeInvoice(admin: any, userId: string, invoiceId: string) {
  const { data: invoice } = await admin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return null;
  if (invoice.inspector_id === userId) return invoice;

  if (invoice.company_id) {
    const { data: ownerRow } = await admin
      .from("company_users")
      .select("company_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .eq("company_id", invoice.company_id)
      .maybeSingle();
    if (ownerRow) return invoice;
  }

  return null;
}

export async function GET(_req: Request, { params }: RouteProps) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const admin = getAdminClient();
  const invoice = await authorizeInvoice(admin, user.id, id);
  if (!invoice) return notFound("Invoice not found.");

  return NextResponse.json({ invoice });
}

export async function PATCH(req: Request, { params }: RouteProps) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const admin = getAdminClient();
  const invoice = await authorizeInvoice(admin, user.id, id);
  if (!invoice) return notFound("Invoice not found.");

  if (invoice.status === "paid") {
    return NextResponse.json(
      { error: "This invoice has been paid and can no longer be edited." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const update: Record<string, any> = {};

  if (body?.line_items !== undefined) {
    const { normalized, subtotal } = computeInvoiceTotals(body.line_items);
    update.line_items = normalized;
    update.subtotal = subtotal;
    update.total = subtotal;
    update.balance_due = Math.max(0, Math.round((subtotal - Number(invoice.amount_paid || 0)) * 100) / 100);
  }
  if (body?.client_name !== undefined) update.client_name = String(body.client_name || "").slice(0, 200);
  if (body?.client_email !== undefined) update.client_email = String(body.client_email || "").slice(0, 200);
  if (body?.invoice_number !== undefined) update.invoice_number = String(body.invoice_number || "").slice(0, 60);
  if (body?.due_date !== undefined) update.due_date = body.due_date || null;
  if (body?.notes !== undefined) update.notes = String(body.notes || "").slice(0, 2000);
  if (body?.inspection_id !== undefined) update.inspection_id = body.inspection_id ? Number(body.inspection_id) : null;

  const { data, error } = await admin
    .from("invoices")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}

export async function DELETE(_req: Request, { params }: RouteProps) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const admin = getAdminClient();
  const invoice = await authorizeInvoice(admin, user.id, id);
  if (!invoice) return notFound("Invoice not found.");

  if (invoice.status === "paid") {
    return NextResponse.json(
      { error: "A paid invoice cannot be deleted." },
      { status: 409 }
    );
  }

  const { error } = await admin.from("invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
