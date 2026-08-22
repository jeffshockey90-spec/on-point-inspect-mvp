import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  getValidAccessToken,
  syncBillableInspectionsToQuickBooks,
  syncInspectionToQuickBooks,
} from "../../../lib/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function getUser() {
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const {
    data: { user },
  } = await client.auth.getUser();
  return user;
}

// GET: connection status.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { data } = await admin()
    .from("quickbooks_connections")
    .select("connected_company, realm_id, enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  return NextResponse.json({
    connected: Boolean(data?.enabled && data?.realm_id),
    company: data?.connected_company || null,
    configured: Boolean(process.env.QUICKBOOKS_CLIENT_ID),
  });
}

// DELETE: disconnect (leaves any invoices already in QuickBooks intact).
export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await admin().from("quickbooks_connections").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}

// POST: sync. With { inspectionId } sync that one; otherwise sync all billable
// inspections not yet in QuickBooks.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const db = admin();
  const auth = await getValidAccessToken(db, user.id);
  if (!auth) {
    return NextResponse.json({ error: "QuickBooks isn't connected." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const inspectionId = body?.inspectionId ?? body?.inspection_id ?? null;

  try {
    if (inspectionId) {
      const result = await syncInspectionToQuickBooks(db, user.id, inspectionId);
      if (!result) {
        return NextResponse.json(
          { error: "Nothing to bill for that inspection (no amount set)." },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true, synced: 1, invoiceId: result.invoiceId });
    }
    const result = await syncBillableInspectionsToQuickBooks(db, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "QuickBooks sync failed." },
      { status: 500 },
    );
  }
}
