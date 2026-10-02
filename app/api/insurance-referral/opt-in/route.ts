import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  resolveInspectionByToken,
  INSURANCE_CONSENT_TEXT,
} from "../../../../lib/insuranceReferral";
import { getCompanyBrandingById, buildBrandedFromHeader } from "../../../../lib/companyBranding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The CLIENT portal calls this when a homeowner opts in to their inspector's
// insurance-agent referral. This is the ONLY place a lead is sent, and it
// enforces the whole opt-in chain:
//   1. report resolved by its unguessable share token (never a raw id),
//   2. the OWNING inspector must have their referral turned on,
//   3. the client must have actively consented (consent === true),
//   4. we never notify the agent twice for the same inspection.
// No login here, so we use the service-role client and gate on the token +
// the inspector's own setting.

const resend = new Resend(process.env.RESEND_API_KEY);

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const str = (v: any) => String(v ?? "").trim();
const esc = (s: string) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(request: Request) {
  const db = admin();
  const body = await request.json().catch(() => ({}));

  const lookup = str(body?.lookup || body?.shareToken || body?.token);
  const consent = body?.consent === true;

  if (!lookup) return NextResponse.json({ error: "Missing report reference." }, { status: 400 });

  // 1. Resolve strictly by share token (404, not 403, on miss).
  const inspection = await resolveInspectionByToken(db, lookup);
  if (!inspection?.id) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  // 2. The owning inspector's referral must be on and reachable.
  const { data: setting } = await db
    .from("insurance_referral_settings")
    .select("enabled, agent_name, agent_company, agent_email, agent_link, blurb")
    .eq("user_id", inspection.inspector_id)
    .maybeSingle();

  const agentEmail = str(setting?.agent_email).toLowerCase();
  const agentLink = str(setting?.agent_link);
  if (setting?.enabled !== true || (!agentEmail && !agentLink)) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  // 3. Explicit consent required.
  if (!consent) {
    return NextResponse.json({ error: "Please check the consent box to continue." }, { status: 400 });
  }

  // 4. Idempotent — if already submitted, just hand back the link again.
  const { data: prior } = await db
    .from("insurance_referral_leads")
    .select("id")
    .eq("inspection_id", inspection.id)
    .eq("status", "submitted")
    .maybeSingle();
  if (prior?.id) {
    return NextResponse.json({ ok: true, already: true, link: agentLink || null });
  }

  const fullName = str(inspection.client_name);
  const clientEmail = str(inspection.client_email);
  const clientPhone = str(inspection.client_phone);
  const address = [
    str(inspection.property_address || inspection.address),
    str(inspection.city),
    str(inspection.state),
    str(inspection.zip),
  ]
    .filter(Boolean)
    .join(", ");

  // CC the referring inspector so they can see the hand-off happened.
  let inspectorEmail = "";
  if (inspection.inspector_id) {
    const { data: prof } = await db
      .from("profiles")
      .select("email")
      .eq("id", inspection.inspector_id)
      .maybeSingle();
    inspectorEmail = str(prof?.email).toLowerCase();
  }

  // Log the consented lead first (so it's recorded even if the email fails).
  const { data: logRow } = await db
    .from("insurance_referral_leads")
    .insert({
      inspection_id: inspection.id,
      inspector_id: inspection.inspector_id,
      client_name: fullName || null,
      client_email: clientEmail || null,
      client_phone: clientPhone || null,
      property_address: address || null,
      agent_email: agentEmail || null,
      consent_text: INSURANCE_CONSENT_TEXT,
      status: "pending",
    })
    .select("id")
    .single();

  // If there's no agent email, this is a link-only referral: nothing to send,
  // the client just proceeds to the agent's link. Mark it submitted.
  if (!agentEmail) {
    if (logRow?.id) {
      await db
        .from("insurance_referral_leads")
        .update({ status: "submitted", result_message: "Link-only referral (no agent email)." })
        .eq("id", logRow.id);
    }
    return NextResponse.json({ ok: true, link: agentLink || null });
  }

  if (!process.env.RESEND_API_KEY) {
    if (logRow?.id) {
      await db
        .from("insurance_referral_leads")
        .update({ status: "error", result_message: "Email not configured." })
        .eq("id", logRow.id);
    }
    // Still let the client through to the link if there is one.
    return agentLink
      ? NextResponse.json({ ok: true, link: agentLink })
      : NextResponse.json({ error: "Referrals aren't available right now." }, { status: 503 });
  }

  const agentName = str(setting?.agent_name) || "there";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6">
      <p>Hi ${esc(agentName)},</p>
      <p>A home inspection client asked to be connected with you about home insurance.
      They opted in from their inspection report and consented to sharing their contact details.</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:2px 12px 2px 0"><strong>Client</strong></td><td>${esc(fullName) || "—"}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><strong>Email</strong></td><td>${esc(clientEmail) || "—"}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><strong>Phone</strong></td><td>${esc(clientPhone) || "—"}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><strong>Property</strong></td><td>${esc(address) || "—"}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><strong>Inspection date</strong></td><td>${esc(str(inspection.inspection_date)) || "—"}</td></tr>
      </table>
      <p style="color:#555;font-size:13px">Consent on file: "${esc(INSURANCE_CONSENT_TEXT)}"</p>
      <p style="color:#888;font-size:12px">Sent via FLOW on behalf of the referring home inspector.</p>
    </div>`;

  const text =
    `Hi ${agentName},\n\nA home inspection client asked to be connected with you about home insurance.\n\n` +
    `Client: ${fullName || "—"}\nEmail: ${clientEmail || "—"}\nPhone: ${clientPhone || "—"}\n` +
    `Property: ${address || "—"}\nInspection date: ${str(inspection.inspection_date) || "—"}\n\n` +
    `Consent on file: "${INSURANCE_CONSENT_TEXT}"\n\nSent via FLOW on behalf of the referring home inspector.`;

  const subject = `Home insurance referral: ${fullName || "New client"}${address ? ` — ${address}` : ""}`;

  // Send with the inspector's COMPANY NAME as the display name (e.g. "On Point
  // Home Inspections via FLOW") over FLOW's verified platform domain. This is
  // multi-tenant-safe — every inspector's referral shows THEIR name, and no one
  // sends from another inspector's (or On Point's) domain. buildBrandedFromHeader
  // always uses the flowinspect.app platform address; the fallback here is only
  // the neutral platform sender if branding can't be loaded.
  let fromHeader = "FLOW <notifications@flowinspect.app>";
  try {
    const branding = await getCompanyBrandingById(inspection.company_id);
    fromHeader = buildBrandedFromHeader(branding, fromHeader);
  } catch {
    /* fall back to the neutral platform sender */
  }

  let sentOk = false;
  let resultMessage = "";
  let resendId: string | null = null;
  try {
    const result = await resend.emails.send({
      from: fromHeader,
      to: agentEmail,
      cc: inspectorEmail ? [inspectorEmail] : undefined,
      // Agent replies go straight to the client.
      replyTo: clientEmail || undefined,
      subject,
      html,
      text,
    });
    sentOk = !result.error;
    resendId = result?.data?.id || null;
    resultMessage = result.error ? String(result.error.message || result.error) : "sent";
  } catch (e: any) {
    resultMessage = e?.message || "send failed";
  }

  if (logRow?.id) {
    await db
      .from("insurance_referral_leads")
      .update({ status: sentOk ? "submitted" : "error", result_message: resultMessage })
      .eq("id", logRow.id);
  }

  // Also log to email_logs so the Resend webhook can mark it delivered/bounced
  // and it shows up in Sent Emails — insurance leads were a delivery black box
  // (API "sent" != delivered). inspection_id is UUID; the numeric id goes in
  // inspection_id_bigint.
  try {
    await db.from("email_logs").insert({
      inspection_id_bigint: Number(inspection.id),
      recipient: agentEmail,
      recipient_email: agentEmail,
      email_type: "insurance_referral",
      subject,
      message: `Insurance referral for ${fullName || "a client"} sent to ${agentEmail}.`,
      html,
      status: sentOk ? "sent" : "failed",
      resend_id: resendId,
      sent_at: sentOk ? new Date().toISOString() : null,
      metadata: {
        type: "insurance_referral",
        agent_email: agentEmail,
        client_email: clientEmail || null,
        lead_id: logRow?.id || null,
        error: sentOk ? undefined : resultMessage,
      },
    });
  } catch {
    /* logging is best-effort */
  }

  if (!sentOk && !agentLink) {
    return NextResponse.json(
      { error: "We couldn't send your request right now. Please try again later." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, link: agentLink || null });
}
