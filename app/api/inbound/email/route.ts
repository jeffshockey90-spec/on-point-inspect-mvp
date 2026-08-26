import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { parseRawEmail } from "../../../../lib/inboundMail";
import { ingestReply } from "../../../../lib/ingestReply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// Called by the Cloudflare Email Worker on each inbound message to
// support@flowinspect.app. Body is the raw RFC822 MIME. Shared-secret gated
// via the X-Inbound-Secret header (must equal INBOUND_EMAIL_SECRET).
export async function POST(req: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "INBOUND_EMAIL_SECRET not set." }, { status: 500 });
  }
  const provided =
    req.headers.get("x-inbound-secret") ||
    new URL(req.url).searchParams.get("secret") ||
    "";
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: Buffer;
  try {
    raw = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read body." }, { status: 400 });
  }
  if (!raw || raw.length === 0) {
    return NextResponse.json({ error: "Empty body." }, { status: 400 });
  }

  const msg = await parseRawEmail(raw);
  if (!msg) {
    // Parsed fine but it's noise (bounce/auto-reply/our own sender) — accept
    // so Cloudflare doesn't retry, but record nothing.
    return NextResponse.json({ ok: true, ignored: "filtered" });
  }

  try {
    const admin = createAdminClient();
    const result = await ingestReply(admin, msg);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("inbound/email ingest error:", e);
    return NextResponse.json({ error: e?.message || "Ingest failed." }, { status: 500 });
  }
}
