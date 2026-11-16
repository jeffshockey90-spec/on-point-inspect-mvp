// Saved quotes for the signed-in inspector: list (GET) and save (POST).
// Saving returns a client booking link, /book?quote=<token>.

import { NextResponse } from "next/server";
import { getAdminClient, getSessionUser, unauthorized } from "../../../lib/apiAuth";
import { newQuoteToken, normalizeQuoteInput, isQuoteOpen } from "../../../lib/savedQuotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appUrl(req: Request) {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.startsWith("http") ? env : `https://${env}`;
  return new URL(req.url).origin;
}

function bookingLink(req: Request, token: string, slug?: string | null) {
  const qs = new URLSearchParams();
  if (slug) qs.set("inspector", slug);
  qs.set("quote", token);
  return `${appUrl(req)}/book?${qs.toString()}`;
}

async function companyFor(admin: any, userId: string) {
  const { data: membership } = await admin
    .from("company_users")
    .select("company_id")
    .eq("user_id", userId)
    .not("company_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!membership?.company_id) return { companyId: null, slug: null };
  const { data: company } = await admin
    .from("companies")
    .select("profile_slug")
    .eq("id", membership.company_id)
    .maybeSingle();
  return { companyId: membership.company_id, slug: company?.profile_slug || null };
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const admin = getAdminClient();

  const [{ data, error }, { slug }] = await Promise.all([
    admin
      .from("saved_quotes")
      .select("*")
      .eq("inspector_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    companyFor(admin, user.id),
  ]);
  if (error) {
    // Table not created yet (SQL not run): show an empty list, not an error page.
    return NextResponse.json({ quotes: [], setupNeeded: true });
  }

  const quotes = (data || []).map((q: any) => ({
    id: q.id,
    clientName: q.client_name,
    clientEmail: q.client_email,
    propertyAddress: q.property_address,
    total: Number(q.total) || 0,
    services: (q.line_items || []).map((item: any) => item.name),
    status: q.status === "booked" ? "booked" : isQuoteOpen(q) ? "open" : "expired",
    createdAt: q.created_at,
    expiresAt: q.expires_at,
    link: bookingLink(req, q.token, slug),
  }));
  return NextResponse.json({ quotes });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const admin = getAdminClient();

  const body = await req.json().catch(() => ({}));
  const result = normalizeQuoteInput(body || {});
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const { companyId, slug } = await companyFor(admin, user.id);
  const token = newQuoteToken();
  const { data, error } = await admin
    .from("saved_quotes")
    .insert({ ...result.row, token, inspector_id: user.id, company_id: companyId })
    .select("id")
    .single();
  if (error) {
    const missing = /saved_quotes/.test(error.message || "") && /exist|schema/i.test(error.message || "");
    return NextResponse.json(
      { error: missing ? "Saved quotes aren't set up yet — run supabase/saved-quotes.sql." : error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id: data.id, link: bookingLink(req, token, slug) });
}
