import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{
    token: string;
  }>;
};

const SECTION_ORDER = [
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
  "Disclaimers",
];

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function cleanText(value: any) {
  return String(value || "").trim();
}

function escapeHtml(value: any) {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSection(section: any) {
  const clean = cleanText(section) || "Inspection Details";

  const aliases: Record<string, string> = {
    General: "Inspection Details",
    Safety: "Inspection Details",
    "Basement/Foundation/Crawlspace & Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Basement, Foundation, Crawlspace and Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Attic/Insulation & Ventilation": "Attic, Insulation & Ventilation",
    "Attic, Insulation and Ventilation": "Attic, Insulation & Ventilation",
    "Doors/Windows & Interior": "Doors, Windows & Interior",
    "Doors, Windows and Interior": "Doors, Windows & Interior",
    Appliances: "Built-in Appliances",
    "Built In Appliances": "Built-in Appliances",
  };

  return aliases[clean] || clean;
}

function getSectionNumber(sectionValue: any) {
  const section = normalizeSection(sectionValue);
  const index = SECTION_ORDER.findIndex(
    (item) => item.toLowerCase() === section.toLowerCase(),
  );

  return index >= 0 ? index + 1 : SECTION_ORDER.length + 1;
}

function getFindingNumber(finding: any, fallbackIndex = 0) {
  const existing =
    finding?.item_number ||
    finding?.finding_number ||
    finding?.repair_item_number ||
    finding?.report_item_number ||
    finding?.reference_number;

  if (existing) return String(existing);

  const sectionNumber = getSectionNumber(finding?.section);
  return `${sectionNumber}.1.${fallbackIndex + 1}`;
}

function parseMoneyValue(value: any) {
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value: any) {
  const number = parseMoneyValue(value);
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function responseLabel(value: any) {
  const clean = cleanText(value);

  const labels: Record<string, string> = {
    agree_to_repair: "Agree to Repair",
    already_repaired: "Already Repaired",
    credit_buyer: "Credit Buyer",
    decline: "Declined",
    needs_discussion: "Needs Discussion",
  };

  return labels[clean] || "Not Answered";
}

function responseClass(value: any) {
  const clean = cleanText(value);

  if (clean === "agree_to_repair" || clean === "already_repaired") return "good";
  if (clean === "credit_buyer") return "credit";
  if (clean === "decline") return "bad";
  if (clean === "needs_discussion") return "warn";
  return "neutral";
}

function getFindingText(finding: any) {
  return (
    finding?.recommendation ||
    finding?.observation ||
    finding?.comment ||
    finding?.description ||
    "Repair, correction, further evaluation, or negotiation requested."
  );
}

function getRequestedCreditsFromShare(share: any) {
  const direct = share?.requested_credits;
  const metadata = share?.metadata?.requested_credits;

  if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) return metadata;

  return {};
}

function getRequestedCreditTotalFromShare(share: any, findings: any[]) {
  const direct = parseMoneyValue(share?.requested_credit_total);
  const metadata = parseMoneyValue(share?.metadata?.requested_credit_total);

  if (direct > 0) return direct;
  if (metadata > 0) return metadata;

  return findings.reduce(
    (sum, finding) => sum + parseMoneyValue(finding?.requested_credit_amount),
    0,
  );
}

function groupFindingsInSelectedOrder(findings: any[], selectedIds: string[]) {
  const byId = new Map(findings.map((finding) => [cleanText(finding.id), finding]));

  return selectedIds
    .map((id) => byId.get(cleanText(id)))
    .filter(Boolean);
}

function getPropertyLabel(inspection: any) {
  return (
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Inspection property"
  );
}

function getResponseCredit(response: any) {
  return parseMoneyValue(
    response?.seller_credit_amount ??
      response?.credit_amount ??
      response?.metadata?.seller_credit_amount ??
      0,
  );
}

async function loadAddendumData(token: string) {
  const admin = createAdminClient();

  const { data: share, error: shareError } = await admin
    .from("repair_request_shares")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (shareError || !share) {
    throw new Error("Repair request link not found.");
  }

  const selectedIds = Array.isArray(share.selected_finding_ids)
    ? share.selected_finding_ids.map((id: any) => cleanText(id)).filter(Boolean)
    : [];

  const [{ data: inspection }, { data: findingsRaw }, { data: responsesRaw }] =
    await Promise.all([
      admin
        .from("inspections")
        .select("*")
        .eq("id", share.inspection_id)
        .maybeSingle(),
      selectedIds.length
        ? admin
            .from("findings")
            .select("*")
            .eq("inspection_id", share.inspection_id)
            .in("id", selectedIds)
        : Promise.resolve({ data: [] }),
      admin
        .from("repair_request_responses")
        .select("*")
        .eq("share_id", share.id),
    ]);

  const orderedFindings = groupFindingsInSelectedOrder(findingsRaw || [], selectedIds);
  const requestedCredits = getRequestedCreditsFromShare(share);

  const findings = orderedFindings.map((finding: any, index: number) => {
    const itemNumber = getFindingNumber(finding, index);
    const requestedCredit = requestedCredits[cleanText(finding.id)] || finding?.requested_credit_amount || "";

    return {
      ...finding,
      section: normalizeSection(finding.section),
      item_number: itemNumber,
      requested_credit_amount: requestedCredit,
    };
  });

  const responseMap = new Map(
    (responsesRaw || []).map((response: any) => [cleanText(response.finding_id), response]),
  );

  const items = findings.map((finding: any, index: number) => {
    const response = responseMap.get(cleanText(finding.id)) || {};
    const requestedCredit = parseMoneyValue(finding.requested_credit_amount);
    const offeredCredit = getResponseCredit(response);

    return {
      finding,
      response,
      itemNumber: getFindingNumber(finding, index),
      requestedCredit,
      offeredCredit,
      difference: offeredCredit - requestedCredit,
    };
  });

  const requestedCreditTotal = getRequestedCreditTotalFromShare(share, findings);
  const sellerCreditTotal = items.reduce((sum, item) => sum + item.offeredCredit, 0);

  return {
    share,
    inspection,
    property: getPropertyLabel(inspection),
    selectedIds,
    findings,
    responses: responsesRaw || [],
    items,
    requestedCreditTotal,
    sellerCreditTotal,
    differenceTotal: sellerCreditTotal - requestedCreditTotal,
  };
}

function buildAddendumHtml(data: Awaited<ReturnType<typeof loadAddendumData>>) {
  const createdDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const responseCounts = data.items.reduce(
    (acc: Record<string, number>, item) => {
      const key = cleanText(item.response?.response_status) || "not_answered";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {},
  );

  const rowsHtml = data.items
    .map((item) => {
      const finding = item.finding;
      const response = item.response || {};
      const responseStatus = cleanText(response.response_status);
      const notes = cleanText(response.notes);

      return `
        <article class="item-card">
          <div class="item-top">
            <div>
              <p class="item-number">Item #${escapeHtml(item.itemNumber)}</p>
              <h3>${escapeHtml(finding.title || "Untitled Finding")}</h3>
              <p class="section-line">${escapeHtml(finding.section || "Other")} · ${escapeHtml(finding.severity || "Recommended Repair")}</p>
            </div>
            <span class="status-badge ${responseClass(responseStatus)}">${escapeHtml(responseLabel(responseStatus))}</span>
          </div>

          <div class="grid-two">
            <div class="box">
              <p class="box-label">Buyer Requested</p>
              <p>${escapeHtml(getFindingText(finding))}</p>
            </div>
            <div class="box">
              <p class="box-label">Seller Response</p>
              <p><strong>${escapeHtml(responseLabel(responseStatus))}</strong></p>
              ${notes ? `<p class="notes">${escapeHtml(notes)}</p>` : `<p class="notes muted">No notes entered.</p>`}
            </div>
          </div>

          <div class="credit-row">
            <div>
              <span>Requested Credit</span>
              <strong>${escapeHtml(formatMoney(item.requestedCredit))}</strong>
            </div>
            <div>
              <span>Seller Offered Credit</span>
              <strong>${escapeHtml(formatMoney(item.offeredCredit))}</strong>
            </div>
            <div>
              <span>Difference</span>
              <strong class="${item.difference < 0 ? "negative" : item.difference > 0 ? "positive" : ""}">${escapeHtml(formatMoney(item.difference))}</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Repair Request Addendum - ${escapeHtml(data.property)}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: letter; margin: .45in; }
    html, body { margin: 0; padding: 0; }
    body { background: #020617; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.45; }
    .screen-actions { max-width: 980px; margin: 18px auto 12px; padding: 0 12px; display: flex; gap: 10px; flex-wrap: wrap; }
    .screen-actions button { min-height: 44px; border: 1px solid #14b8a6; border-radius: 12px; background: #020617; color: #5eead4; padding: 10px 16px; font-weight: 900; cursor: pointer; }
    .shell { max-width: 980px; margin: 0 auto 28px; padding: 12px; }
    .paper { background: #fff; border-radius: 14px; border: 1px solid #cbd5e1; padding: 24px; box-shadow: 0 14px 40px rgba(0,0,0,.18); }
    .brand { display: flex; justify-content: space-between; gap: 18px; border-bottom: 3px solid #0f8f8f; padding-bottom: 16px; margin-bottom: 16px; }
    .eyebrow { margin: 0 0 6px; color: #0f8f8f; font-size: 11px; font-weight: 900; letter-spacing: .24em; text-transform: uppercase; }
    h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.08; font-weight: 900; color: #020617; }
    .property { margin: 0; color: #475569; font-weight: 800; }
    .badge { height: fit-content; border: 1px solid #0f8f8f; border-radius: 999px; color: #0f8f8f; padding: 8px 12px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
    .summary div, .count-card { border: 1px solid #cbd5e1; border-radius: 10px; background: #f8fafc; padding: 10px 12px; }
    .summary span, .count-card span, .credit-row span { display: block; margin-bottom: 3px; color: #64748b; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    .summary strong, .count-card strong, .credit-row strong { display: block; color: #020617; font-size: 13px; font-weight: 900; word-break: break-word; }
    .count-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 14px 0 22px; }
    .item-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; margin-top: 16px; }
    .item-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .item-number { display: inline-block; margin: 0 0 8px; border: 1px solid #0f8f8f; border-radius: 999px; background: #ecfeff; color: #0f766e; padding: 4px 9px; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    h2 { margin: 22px 0 10px; font-size: 20px; color: #020617; }
    h3 { margin: 0; font-size: 15px; color: #020617; line-height: 1.25; }
    .section-line { margin: 5px 0 0; color: #64748b; font-size: 11px; font-weight: 800; }
    .status-badge { flex-shrink: 0; border-radius: 999px; border: 1px solid #94a3b8; padding: 5px 9px; font-size: 9px; font-weight: 900; text-transform: uppercase; text-align: center; }
    .status-badge.good { border-color: #10b981; background: #ecfdf5; color: #047857; }
    .status-badge.credit { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; }
    .status-badge.bad { border-color: #ef4444; background: #fef2f2; color: #b91c1c; }
    .status-badge.warn { border-color: #f59e0b; background: #fffbeb; color: #b45309; }
    .grid-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .box { border: 1px solid #cbd5e1; border-radius: 9px; background: #f8fafc; padding: 11px; }
    .box p { margin: 0; color: #334155; white-space: pre-line; }
    .box-label { margin: 0 0 5px !important; color: #020617 !important; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    .notes { margin-top: 8px !important; }
    .muted { color: #94a3b8 !important; }
    .credit-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
    .credit-row div { border: 1px solid #cbd5e1; border-radius: 9px; background: #ffffff; padding: 10px; }
    .negative { color: #b91c1c !important; }
    .positive { color: #047857 !important; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 34px; break-inside: avoid; page-break-inside: avoid; }
    .sig-line { margin-top: 44px; border-bottom: 1px solid #475569; height: 1px; }
    .sig-label { margin-top: 8px; color: #475569; font-weight: 800; }
    @media (max-width: 760px) { .summary, .count-grid, .grid-two, .credit-row, .signatures { grid-template-columns: 1fr; } .brand { flex-direction: column; } }
    @media print { body { background: #fff; } .screen-actions { display: none; } .shell { max-width: none; margin: 0; padding: 0; } .paper { border: 0; box-shadow: none; border-radius: 0; padding: 0; } }
  </style>
</head>
<body>
  <div class="screen-actions">
    <button onclick="window.print()">Print / Save PDF</button>
  </div>
  <main class="shell">
    <section class="paper">
      <div class="brand">
        <div>
          <p class="eyebrow">On Point Home Inspections</p>
          <h1>Repair Request Addendum</h1>
          <p class="property">${escapeHtml(data.property)}</p>
        </div>
        <div class="badge">Addendum</div>
      </div>

      <div class="summary">
        <div><span>Date Prepared</span><strong>${escapeHtml(createdDate)}</strong></div>
        <div><span>Repair Items</span><strong>${data.items.length}</strong></div>
        <div><span>Recipient</span><strong>${escapeHtml(data.share.recipient_email || "Secure recipient")}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(data.share.status || "sent")}</strong></div>
        <div><span>Buyer Requested Credits</span><strong>${escapeHtml(formatMoney(data.requestedCreditTotal))}</strong></div>
        <div><span>Seller Offered Credits</span><strong>${escapeHtml(formatMoney(data.sellerCreditTotal))}</strong></div>
        <div><span>Credit Difference</span><strong class="${data.differenceTotal < 0 ? "negative" : data.differenceTotal > 0 ? "positive" : ""}">${escapeHtml(formatMoney(data.differenceTotal))}</strong></div>
        <div><span>Responded</span><strong>${data.share.responded_at ? escapeHtml(new Date(data.share.responded_at).toLocaleDateString("en-US")) : "Not submitted"}</strong></div>
      </div>

      <h2>Negotiation Summary</h2>
      <div class="count-grid">
        <div class="count-card"><span>Agree to Repair</span><strong>${responseCounts.agree_to_repair || 0}</strong></div>
        <div class="count-card"><span>Already Repaired</span><strong>${responseCounts.already_repaired || 0}</strong></div>
        <div class="count-card"><span>Credit Buyer</span><strong>${responseCounts.credit_buyer || 0}</strong></div>
        <div class="count-card"><span>Declined</span><strong>${responseCounts.decline || 0}</strong></div>
        <div class="count-card"><span>Needs Discussion</span><strong>${responseCounts.needs_discussion || 0}</strong></div>
      </div>

      <h2>Seller Responses</h2>
      ${rowsHtml || `<p>No repair request responses were found.</p>`}

      <div class="signatures">
        <div>
          <div class="sig-line"></div>
          <p class="sig-label">Buyer Signature / Date</p>
        </div>
        <div>
          <div class="sig-line"></div>
          <p class="sig-label">Seller Signature / Date</p>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function getDownloadName(property: string) {
  const slug = cleanText(property)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return `${slug || "repair-request"}-addendum.html`;
}

export async function GET(req: Request, { params }: RouteProps) {
  try {
    const { token } = await params;
    const cleanToken = cleanText(token);
    const url = new URL(req.url);
    const download = url.searchParams.get("download") === "1";

    if (!cleanToken) {
      return NextResponse.json({ error: "Missing repair request token." }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
    }

    const data = await loadAddendumData(cleanToken);
    const html = buildAddendumHtml(data);

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=20, stale-while-revalidate=120",
        ...(download
          ? {
              "Content-Disposition": `attachment; filename="${getDownloadName(data.property)}"`,
            }
          : {}),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not generate repair request addendum." },
      { status: 500 },
    );
  }
}

export async function POST(_req: Request, { params }: RouteProps) {
  try {
    const { token } = await params;
    const cleanToken = cleanText(token);

    if (!cleanToken) {
      return NextResponse.json({ error: "Missing repair request token." }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Missing RESEND_API_KEY." }, { status: 500 });
    }

    const data = await loadAddendumData(cleanToken);
    const recipient = cleanText(data.share.recipient_email).toLowerCase();

    if (!recipient || !recipient.includes("@")) {
      return NextResponse.json({ error: "No recipient email found for this repair request." }, { status: 400 });
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const addendumUrl = `${appUrl}/api/repair-request-addendum/${encodeURIComponent(cleanToken)}`;
    const subject = `Repair Request Addendum - ${data.property}`;
    const from =
      process.env.REPORT_EMAIL_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      "On Point Home Inspections <reports@onpointhomeinspect.com>";

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif; color:#0f172a; line-height:1.55;">
        <h1 style="color:#0f8f8f;">Repair Request Addendum</h1>
        <p>The repair request addendum for <strong>${escapeHtml(data.property)}</strong> is ready.</p>
        <p><strong>Buyer requested credits:</strong> ${escapeHtml(formatMoney(data.requestedCreditTotal))}</p>
        <p><strong>Seller offered credits:</strong> ${escapeHtml(formatMoney(data.sellerCreditTotal))}</p>
        <p><strong>Difference:</strong> ${escapeHtml(formatMoney(data.differenceTotal))}</p>
        <p>
          <a href="${escapeHtml(addendumUrl)}" style="display:inline-block; background:#14b8a6; color:#020617; padding:14px 20px; border-radius:10px; text-decoration:none; font-weight:700;">Open Addendum</a>
        </p>
        <p style="color:#64748b; font-size:13px;">On Point Home Inspections LLC</p>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipient,
        subject,
        html,
        text: `Repair Request Addendum - ${data.property}\n\nBuyer requested credits: ${formatMoney(data.requestedCreditTotal)}\nSeller offered credits: ${formatMoney(data.sellerCreditTotal)}\nDifference: ${formatMoney(data.differenceTotal)}\n\nOpen addendum: ${addendumUrl}`,
      }),
    });

    const resendText = await resendRes.text();
    let resendData: any = {};

    try {
      resendData = resendText ? JSON.parse(resendText) : {};
    } catch {
      resendData = { raw: resendText };
    }

    if (!resendRes.ok || !resendData?.id) {
      return NextResponse.json(
        { error: resendData?.message || resendData?.error || "Addendum email failed to send." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Addendum emailed to ${recipient}.`,
      resendId: resendData.id,
      addendumUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not email repair request addendum." },
      { status: 500 },
    );
  }
}
