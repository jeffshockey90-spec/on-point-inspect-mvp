import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { submitSecure24Lead, isSecure24Configured } from "../../../../lib/secure24";
import { SECURE24_CONSENT_TEXT } from "../../../../lib/secure24Brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the CLIENT report portal when a homeowner opts in to a Secure 24
// referral. This is the ONLY place a lead is ever sent, and it enforces the
// whole opt-in chain:
//   1. the report is resolved by its unguessable share token (never a raw id),
//   2. the OWNING inspector must have the referral turned on,
//   3. the client must have actively consented (consent === true),
//   4. we never submit the same inspection twice.
// The client portal has no login, so we use the service-role client (bypasses
// RLS) and gate strictly on the token + inspector setting instead.

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const nonEmpty = (v: any) => String(v ?? "").trim();

export async function POST(request: Request) {
  const db = admin();
  const body = await request.json().catch(() => ({}));

  const lookup = nonEmpty(body?.lookup || body?.shareToken || body?.token);
  const consent = body?.consent === true;

  if (!lookup) {
    return NextResponse.json({ error: "Missing report reference." }, { status: 400 });
  }

  // 1. Resolve strictly by share token. 404 (not 403) on miss so a raw id
  //    can't be distinguished from a valid-but-wrong token.
  const { data: inspection } = await db
    .from("inspections")
    .select("*")
    .eq("public_share_token", lookup)
    .maybeSingle();

  if (!inspection?.id) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // 2. The owning inspector must have the referral enabled.
  const { data: setting } = await db
    .from("secure24_settings")
    .select("enabled")
    .eq("user_id", inspection.inspector_id)
    .maybeSingle();

  if (setting?.enabled !== true) {
    // Feature is off for this inspector -- behave as if it doesn't exist.
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  // 3. Explicit consent required.
  if (!consent) {
    return NextResponse.json(
      { error: "Please check the consent box to continue." },
      { status: 400 },
    );
  }

  // 4. Idempotent: if this inspection was already submitted, don't resend.
  const { data: prior } = await db
    .from("secure24_leads")
    .select("id, status")
    .eq("inspection_id", inspection.id)
    .eq("status", "submitted")
    .maybeSingle();

  if (prior?.id) {
    return NextResponse.json({ ok: true, already: true });
  }

  if (!isSecure24Configured()) {
    return NextResponse.json(
      { error: "Referrals aren't available right now. Please check back soon." },
      { status: 503 },
    );
  }

  // Build the lead from the flat inspection columns. client_name is a single
  // full-name field, so split first token off as FirstName, remainder as Last.
  const fullName = nonEmpty(inspection.client_name);
  const parts = fullName.split(/\s+/).filter(Boolean);
  const FirstName = parts[0] || "";
  const LastName = parts.slice(1).join(" ") || parts[0] || "";

  const fields = {
    FirstName,
    LastName,
    Address: nonEmpty(inspection.property_address || inspection.address),
    City: nonEmpty(inspection.city),
    State: nonEmpty(inspection.state),
    Zip: nonEmpty(inspection.zip),
    Phone: nonEmpty(inspection.client_phone),
    Email: nonEmpty(inspection.client_email),
    InspectionDate: nonEmpty(inspection.inspection_date) || undefined,
    AgentName: nonEmpty(inspection.realtor_name || inspection.agent_name) || undefined,
    AgentPhone: nonEmpty(inspection.realtor_phone || inspection.agent_phone) || undefined,
    AgentEmail: nonEmpty(inspection.realtor_email || inspection.agent_email) || undefined,
    // Ties the lead back to this FLOW inspection for monthly payout reconciliation.
    ReferenceNum: String(inspection.id),
  };

  // Secure 24 requires all of these; if the report is missing contact info we
  // can't submit. Fail gracefully instead of sending a doomed request.
  const requiredMissing = (["FirstName", "LastName", "Address", "City", "State", "Zip", "Phone", "Email"] as const)
    .filter((k) => !fields[k]);

  if (requiredMissing.length) {
    await db.from("secure24_leads").insert({
      inspection_id: inspection.id,
      inspector_id: inspection.inspector_id,
      client_name: fullName || null,
      client_email: fields.Email || null,
      consent_text: SECURE24_CONSENT_TEXT,
      status: "error",
      result_message: `Missing required contact info: ${requiredMissing.join(", ")}`,
    });
    return NextResponse.json(
      {
        error:
          "We're missing some of your contact details for this report. Please reach out to your inspector.",
      },
      { status: 422 },
    );
  }

  // Log consent BEFORE the outbound call, then attach the result.
  const { data: logRow } = await db
    .from("secure24_leads")
    .insert({
      inspection_id: inspection.id,
      inspector_id: inspection.inspector_id,
      client_name: fullName || null,
      client_email: fields.Email || null,
      consent_text: SECURE24_CONSENT_TEXT,
      status: "pending",
    })
    .select("id")
    .single();

  const result = await submitSecure24Lead(fields);

  if (logRow?.id) {
    await db
      .from("secure24_leads")
      .update({
        status: result.ok ? "submitted" : "error",
        result_code: result.resultCode,
        result_message: result.error || result.resultMessage || null,
        lead_token: result.leadToken || null,
      })
      .eq("id", logRow.id);
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: "We couldn't send your request right now. Please try again later." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
