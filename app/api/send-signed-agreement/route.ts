import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  getSessionUser,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../lib/apiAuth";
import { getOrCreateShareToken } from "../../../lib/shareToken";
import {
  getCompanyBrandingById,
  buildBrandedFromHeader,
} from "../../../lib/companyBranding";

export const runtime = "nodejs";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function getBaseUrl(req: Request) {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://app.flowinspect.app";
  }
}

function esc(s: any) {
  return String(s || "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );
}

// Emails the client a link to their SIGNED agreement copy (the token-based
// /client-agreement page renders the signed copy with a print/save option).
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const { inspectionId, agreementId } = await req.json();
    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }

    const inspection = await authorizeInspection(
      admin,
      user.id,
      Number(inspectionId),
      "*"
    );
    if (!inspection) return notFound();

    let q = admin
      .from("inspection_agreements")
      .select("*")
      .eq("inspection_id", inspection.id)
      .eq("status", "signed");
    if (agreementId) q = q.eq("id", agreementId);
    const { data: agreement } = await q
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!agreement) {
      return NextResponse.json(
        { error: "No signed agreement found for this inspection." },
        { status: 404 }
      );
    }

    const to = String(agreement.client_email || inspection.client_email || "")
      .trim()
      .toLowerCase();
    if (!to || !to.includes("@")) {
      return NextResponse.json(
        { error: "No client email on file to send the signed copy to." },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Email is not configured." }, { status: 500 });
    }

    const token = await getOrCreateShareToken(admin, inspection);
    const branding = await getCompanyBrandingById((inspection as any).company_id);
    const baseUrl = getBaseUrl(req);
    const contactPart = agreement.contact_id
      ? `?contact=${encodeURIComponent(agreement.contact_id)}`
      : "";
    const link = `${baseUrl}/client-agreement/${token}${contactPart}`;
    const property =
      (inspection as any).property_address || (inspection as any).address || "your inspection";
    const from = buildBrandedFromHeader(
      branding,
      "On Point Home Inspections <reports@onpointhomeinspect.com>"
    );

    const signedWhen = agreement.signed_at
      ? new Date(agreement.signed_at).toLocaleString("en-US")
      : "";

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from,
      to,
      subject: `Your signed inspection agreement — ${property}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
          <h2 style="color:#0f766e;margin:0 0 12px;">${esc(branding.name)}</h2>
          <p>Hi ${esc(agreement.client_name || "there")},</p>
          <p>Here is a copy of your signed inspection agreement for <strong>${esc(property)}</strong>.</p>
          <p style="margin:22px 0;">
            <a href="${link}" style="display:inline-block;background:#14b8a6;color:#02121a;font-weight:bold;padding:12px 20px;border-radius:10px;text-decoration:none;">
              View / Print Your Signed Agreement
            </a>
          </p>
          ${signedWhen ? `<p style="font-size:13px;color:#64748b;">Signed ${esc(signedWhen)}. You can view, print, or save a PDF from the link above.</p>` : ""}
          <p style="font-size:12px;color:#94a3b8;">${esc(branding.name)}</p>
        </div>`,
      text: `Here is a copy of your signed inspection agreement for ${property}.\n\nView / print / save a PDF: ${link}\n${signedWhen ? `\nSigned ${signedWhen}.` : ""}`,
    });

    return NextResponse.json({ ok: true, to });
  } catch (error: any) {
    console.error("send-signed-agreement error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to send signed agreement." },
      { status: 500 }
    );
  }
}
