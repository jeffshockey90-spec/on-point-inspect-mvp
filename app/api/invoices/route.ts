import { NextResponse } from "next/server";
import { getSessionUser, getAdminClient, unauthorized } from "../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

// Normalize + total incoming line items. Amount is always derived server-side
// (quantity * unitPrice) so the client can never post an inconsistent amount.
export function computeInvoiceTotals(rawItems: any) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  const normalized: InvoiceLineItem[] = items
    .map((li: any) => {
      const quantity = Math.max(0, Number(li?.quantity) || 0);
      const unitPrice = Math.round((Number(li?.unitPrice) || 0) * 100) / 100;
      const amount = Math.round(quantity * unitPrice * 100) / 100;
      return {
        description: String(li?.description || "").slice(0, 500),
        quantity,
        unitPrice,
        amount,
      };
    })
    // Drop fully-empty rows (no description and no amount).
    .filter((li) => li.description.trim() !== "" || li.amount > 0);

  const subtotal = Math.round(normalized.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;
  return { normalized, subtotal };
}

async function resolveOwnedCompanyId(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", userId)
    .not("company_id", "is", null)
    .limit(10);
  const owner = (data || []).find((r: any) => r.role === "owner");
  return (owner?.company_id || data?.[0]?.company_id) || null;
}

// GET /api/invoices — list the caller's invoices (company owners see the whole
// company's; everyone else sees their own).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const admin = getAdminClient();

  const { data: ownerRows } = await admin
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .not("company_id", "is", null)
    .limit(1);
  const ownedCompanyId = ownerRows?.[0]?.company_id;

  let query = admin.from("invoices").select("*").order("created_at", { ascending: false });
  query = ownedCompanyId
    ? query.eq("company_id", ownedCompanyId)
    : query.eq("inspector_id", user.id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoices: data || [] });
}

// POST /api/invoices — create a draft invoice.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const admin = getAdminClient();
  const body = await req.json().catch(() => ({}));

  const { normalized, subtotal } = computeInvoiceTotals(body?.line_items);
  const companyId = await resolveOwnedCompanyId(admin, user.id);

  const insert = {
    inspector_id: user.id,
    company_id: companyId,
    inspection_id: body?.inspection_id ? Number(body.inspection_id) : null,
    invoice_number: body?.invoice_number ? String(body.invoice_number).slice(0, 60) : null,
    client_name: body?.client_name ? String(body.client_name).slice(0, 200) : null,
    client_email: body?.client_email ? String(body.client_email).slice(0, 200) : null,
    status: "draft",
    line_items: normalized,
    subtotal,
    total: subtotal,
    balance_due: subtotal,
    amount_paid: 0,
    due_date: body?.due_date || null,
    notes: body?.notes ? String(body.notes).slice(0, 2000) : null,
  };

  const { data, error } = await admin.from("invoices").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}
