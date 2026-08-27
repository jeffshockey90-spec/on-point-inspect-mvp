"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import FastLinkButton from "../../components/FastLinkButton";
import { useSearchParams } from "next/navigation";

type Finding = Record<string, any>;
type Inspection = Record<string, any>;
type Contact = Record<string, any>;

const FINDING_RENDER_PAGE_SIZE = 10;

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

function normalizeSectionName(section: any) {
  const clean = String(section || "Other").trim();

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

function getSectionNumber(section: any) {
  const clean = normalizeSectionName(section);
  const index = SECTION_ORDER.findIndex((item) => item === clean);
  return index >= 0 ? index + 1 : SECTION_ORDER.length + 1;
}

function getFindingNumber(finding: Finding, fallbackIndex = 0) {
  const existing =
    finding?.item_number ||
    finding?.finding_number ||
    finding?.reference_number ||
    finding?.display_number ||
    finding?.report_item_number;

  if (existing) return String(existing);

  const sectionNumber = getSectionNumber(finding?.section);
  const sectionItemIndex = Number(finding?.section_item_index || finding?.sectionIndex || 1);
  const itemIndex = Number(finding?.item_index || finding?.itemIndex || fallbackIndex + 1);

  return `${sectionNumber}.${Number.isFinite(sectionItemIndex) && sectionItemIndex > 0 ? sectionItemIndex : 1}.${Number.isFinite(itemIndex) && itemIndex > 0 ? itemIndex : fallbackIndex + 1}`;
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

function getFindingCredit(
  finding: Finding,
  requestedCredits: Record<string, string | number>,
) {
  const id = String(finding?.id || "");
  return requestedCredits[id] ?? finding?.requested_credit_amount ?? finding?.requestedCreditAmount ?? "";
}

function addFindingNumbers(findings: Finding[]) {
  const sectionCounts: Record<string, number> = {};

  return findings.map((finding) => {
    const section = normalizeSectionName(finding.section);
    sectionCounts[section] = (sectionCounts[section] || 0) + 1;
    const sectionIndex = sectionCounts[section];

    const numberedFinding = {
      ...finding,
      section,
      item_number:
        finding.item_number ||
        finding.finding_number ||
        finding.reference_number ||
        finding.display_number ||
        `${getSectionNumber(section)}.1.${sectionIndex}`,
    };

    return numberedFinding;
  });
}

function getSeverityStyle(severity: string) {
  const clean = String(severity || "Recommended Repair").toLowerCase();

  if (
    clean.includes("safety") ||
    clean.includes("hazard") ||
    clean.includes("major")
  ) {
    return "border-red-500/60 bg-red-500/10 text-red-300";
  }

  if (
    clean.includes("maintenance") ||
    clean.includes("monitor") ||
    clean.includes("minor")
  ) {
    return "border-yellow-500/60 bg-yellow-500/10 text-yellow-300";
  }

  if (clean.includes("information") || clean.includes("info")) {
    return "border-blue-500/60 bg-blue-500/10 text-blue-300";
  }

  return "border-teal-500/60 bg-teal-500/10 text-[var(--fl-accent-text)]";
}

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";
  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(url.substring(index + marker.length));
}

const RESPONSE_STATUS_OPTIONS: Record<string, { label: string; icon: string; tone: string }> = {
  agree_to_repair: { label: "Agree to Repair", icon: "✅", tone: "border-green-500/40 bg-green-500/10 text-green-300" },
  already_repaired: { label: "Already Repaired", icon: "🔧", tone: "border-green-500/40 bg-green-500/10 text-green-300" },
  credit_buyer: { label: "Credit Buyer", icon: "💲", tone: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" },
  decline: { label: "Decline", icon: "❌", tone: "border-red-500/40 bg-red-500/10 text-red-300" },
  needs_discussion: { label: "Needs Discussion", icon: "💬", tone: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300" },
};

function getResponseStatusMeta(status: string) {
  return (
    RESPONSE_STATUS_OPTIONS[String(status || "")] || {
      label: "Not Answered",
      icon: "○",
      tone: "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]",
    }
  );
}

function isRepairFinding(finding: Finding) {
  const section = String(finding.section || "").toLowerCase();
  const title = String(finding.title || "").toLowerCase();

  if (section === "inspection details") return false;
  if (section === "disclaimers") return false;

  const excluded = [
    "in attendance",
    "occupancy",
    "style",
    "temperature",
    "type of building",
    "weather conditions",
  ];

  return !excluded.includes(title);
}
function printSafe(value: any) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPrintableRepairRequestHtml({
  inspection,
  selectedFindings,
  groupedFindings,
  requestIntro,
}: {
  inspection: Inspection | null;
  selectedFindings: Finding[];
  groupedFindings: Record<string, Finding[]>;
  requestIntro: string;
}) {
  const property =
    inspection?.property_address ||
    inspection?.address ||
    "Property address not entered";

  const companyName = inspection?.company_name || "Your Home Inspection Company";

  const requestedCreditTotal = selectedFindings.reduce(
    (sum, finding) => sum + parseMoneyValue(finding.requested_credit_amount),
    0,
  );

  const sectionsHtml = Object.entries(groupedFindings)
    .map(([section, items]) => {
      const itemsHtml = items
        .map((finding, index) => {
          const firstPhoto = finding.photos?.[0];
          const photoHtml = firstPhoto?.signed_url
            ? `<div class="photo-frame"><img src="${printSafe(firstPhoto.signed_url)}" alt="Finding photo" class="finding-photo" /></div>`
            : "";

          const observationHtml = finding.observation
            ? `<div class="report-text"><p class="label">Observation:</p><p>${printSafe(finding.observation)}</p></div>`
            : "";

          const implicationHtml = finding.implication
            ? `<div class="report-text"><p class="label">Implication:</p><p>${printSafe(finding.implication)}</p></div>`
            : "";

          const recommendationHtml = finding.recommendation
            ? `<div class="report-text"><p class="label">Requested Action:</p><p>${printSafe(finding.recommendation)}</p></div>`
            : "";

          return `
            <article class="finding-card">
              <div class="finding-number">Item #${printSafe(getFindingNumber(finding, index))}</div>
              <div class="credit-line">Requested Credit: ${printSafe(formatMoney(finding.requested_credit_amount || 0))}</div>
              <div class="finding-head">
                <h4>${printSafe(getFindingNumber(finding, index))}. ${printSafe(finding.title || "Untitled Finding")}</h4>
                <span>${printSafe(finding.severity || "Recommended Repair")}</span>
              </div>

              ${photoHtml}
              ${observationHtml}
              ${implicationHtml}
              ${recommendationHtml}

              <div class="seller-box">
                <p class="seller-title">Seller Response Section:</p>
                <div class="seller-grid">
                  ${[
                    "Completed",
                    "Declined",
                    "Credit Offered",
                    "Receipt Provided",
                  ]
                    .map(
                      (label) => `
                        <label class="seller-card">
                          <span>${label}</span>
                          <input type="checkbox" />
                        </label>
                      `,
                    )
                    .join("")}
                </div>

                <label class="notes-wrap">
                  <span>Notes:</span>
                  <textarea placeholder="Seller response notes..."></textarea>
                </label>
              </div>
            </article>
          `;
        })
        .join("");

      return `
        <section class="section-block">
          <h3>${printSafe(section)}</h3>
          <div class="section-items">${itemsHtml}</div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Repair Request Summary - ${printSafe(property)}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: letter; margin: 0.42in; }
    html, body { margin: 0; padding: 0; }
    body {
      background: var(--fl-ground);
      color: var(--fl-ground);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.45;
    }
    .screen-actions {
      max-width: 980px;
      margin: 18px auto 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 0 12px;
    }
    .screen-actions button {
      min-height: 46px;
      border: 1px solid #14b8a6;
      border-radius: 12px;
      background: var(--fl-ground);
      color: #5eead4;
      padding: 10px 16px;
      font-weight: 900;
      cursor: pointer;
    }
    .pdf-shell {
      max-width: 980px;
      margin: 0 auto 28px;
      padding: 12px;
    }
    .report-panel {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 14px;
      padding: 22px;
      box-shadow: 0 14px 40px rgba(0,0,0,.18);
    }
    .brand-bar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      border-bottom: 3px solid #0f8f8f;
      padding-bottom: 16px;
      margin-bottom: 16px;
    }
    .eyebrow {
      margin: 0 0 6px;
      color: #0f8f8f;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .24em;
      text-transform: uppercase;
    }
    .badge {
      flex-shrink: 0;
      border: 1px solid #0f8f8f;
      border-radius: 999px;
      color: #0f8f8f;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .report-panel h1 {
      margin: 0 0 8px;
      font-size: 30px;
      line-height: 1.08;
      font-weight: 900;
      color: var(--fl-ground);
    }
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      margin: 0 0 18px;
    }
    .summary-strip div {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #f8fafc;
      padding: 10px 12px;
    }
    .summary-strip span {
      display: block;
      margin-bottom: 3px;
      color: #64748b;
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .summary-strip strong {
      display: block;
      color: var(--fl-ground);
      font-size: 12px;
      font-weight: 900;
      word-break: break-word;
    }
    .intro {
      margin: 0 0 24px;
      color: #334155;
      line-height: 1.65;
    }
    .property-line {
      margin: -4px 0 16px;
      font-size: 12px;
      color: #475569;
      font-weight: 700;
    }
    .section-block { margin-top: 26px; }
    .section-block:first-of-type { margin-top: 18px; }
    .section-block h3 {
      margin: 0 0 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #cbd5e1;
      color: var(--fl-ground);
      font-size: 18px;
      line-height: 1.2;
      font-weight: 900;
    }
    .section-items { display: grid; gap: 16px; }
    .credit-line {
      display: inline-block;
      margin: 0 0 10px;
      border: 1px solid #0f8f8f;
      border-radius: 999px;
      background: #ecfeff;
      color: #0f766e;
      padding: 5px 9px;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .finding-card {
      break-inside: avoid;
      page-break-inside: avoid;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #ffffff;
      padding: 14px;
    }
    .finding-number {
      display: inline-block;
      margin-bottom: 8px;
      border: 1px solid #0f8f8f;
      border-radius: 999px;
      background: #ecfeff;
      color: #0f766e;
      padding: 4px 9px;
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .finding-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .finding-head h4 {
      margin: 0;
      color: var(--fl-ground);
      font-size: 13px;
      line-height: 1.25;
      font-weight: 900;
    }
    .finding-head span {
      flex-shrink: 0;
      max-width: 210px;
      border: 1px solid #94a3b8;
      border-radius: 999px;
      padding: 4px 9px;
      color: #334155;
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      text-align: center;
      white-space: normal;
    }
    .photo-frame {
      margin: 8px 0 14px;
      min-height: 150px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .finding-photo {
      display: block;
      max-width: 100%;
      max-height: 245px;
      object-fit: contain;
    }
    .report-text { margin-top: 9px; }
    .label {
      margin: 0 0 3px;
      color: var(--fl-ground);
      font-size: 12px;
      font-weight: 900;
    }
    .report-text p:not(.label) {
      margin: 0;
      color: #334155;
      font-size: 11px;
      line-height: 1.55;
      white-space: pre-line;
    }
    .seller-box {
      margin-top: 14px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
      padding: 13px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .seller-title {
      margin: 0 0 10px;
      color: var(--fl-ground);
      font-size: 12px;
      font-weight: 900;
    }
    .seller-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .seller-card {
      min-height: 66px;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      background: #ffffff;
      padding: 9px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
      color: var(--fl-ground);
      font-size: 10px;
      font-weight: 900;
    }
    .seller-card input {
      width: 14px;
      height: 14px;
      margin: 0;
      accent-color: #0f8f8f;
    }
    .notes-wrap {
      display: block;
      margin-top: 12px;
      color: var(--fl-ground);
      font-size: 12px;
      font-weight: 900;
    }
    .notes-wrap textarea {
      display: block;
      width: 100%;
      min-height: 64px;
      margin-top: 7px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: var(--fl-ground);
      color: #ffffff;
      padding: 9px;
      resize: vertical;
      font-size: 11px;
      font-family: Arial, Helvetica, sans-serif;
    }
    .notes-wrap textarea::placeholder { color: #94a3b8; }
    .empty { margin: 0; color: #334155; }
    @media print {
      body { background: #ffffff; }
      .screen-actions { display: none; }
      .pdf-shell { max-width: none; margin: 0; padding: 0; }
      .report-panel { border-radius: 0; border: 0; box-shadow: none; padding: 0; }
      .finding-card { margin-bottom: 0; }
    }
  </style>
</head>
<body>
  <div class="screen-actions">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <main class="pdf-shell">
    <section class="report-panel">
      <div class="brand-bar">
        <div>
          <p class="eyebrow">${printSafe(companyName)}</p>
          <h1>Requested Repairs / Corrections</h1>
          <p class="property-line">${printSafe(property)}</p>
        </div>
        <div class="badge">Repair Request</div>
      </div>

      <div class="summary-strip">
        <div><span>Selected Items</span><strong>${selectedFindings.length}</strong></div>
        <div><span>Requested Credit</span><strong>${printSafe(formatMoney(requestedCreditTotal))}</strong></div>
        <div><span>Property</span><strong>${printSafe(property)}</strong></div>
      </div>

      <p class="intro">${printSafe(requestIntro)}</p>
      ${sectionsHtml || `<p class="empty">No findings selected.</p>`}
    </section>
  </main>
</body>
</html>`;
}

function RepairRequestContent() {
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get("inspection_id");
  const [initialUrlParams] = useState(() => ({
    selected: String(searchParams.get("selected") || ""),
    role: String(searchParams.get("role") || ""),
    email: String(searchParams.get("email") || ""),
    token: String(searchParams.get("token") || ""),
  }));
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [requestedCredits, setRequestedCredits] = useState<Record<string, string>>({});
  const [estimates, setEstimates] = useState<Record<string, { low: number; high: number }>>({});
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pdfMessage, setPdfMessage] = useState("");
  const [printingPdf, setPrintingPdf] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailingRepairRequest, setEmailingRepairRequest] = useState(false);
  const [recipientType, setRecipientType] = useState("realtor");
  const [customRecipientEmail, setCustomRecipientEmail] = useState("");
  const [visibleFindingCount, setVisibleFindingCount] = useState(FINDING_RENDER_PAGE_SIZE);
  const [responseShares, setResponseShares] = useState<any[]>([]);
  const [responseItems, setResponseItems] = useState<any[]>([]);
  const [responsesLoaded, setResponsesLoaded] = useState(false);

  const [requestIntro, setRequestIntro] = useState(
    "The following items are requested for repair, correction, evaluation, or further review by qualified professionals prior to closing, unless otherwise negotiated by the parties involved.",
  );

  useEffect(() => {
    async function trackRepairRequestView() {
      if (!inspectionId) return;

      // No role in the URL means this is the inspector opening their own
      // builder (the link they use has no role/email params) - not a real
      // client/realtor visit, so don't log it as one. Only track visits
      // that arrived via an actual shared link with an identified role.
      if (!initialUrlParams.role) return;

      try {
        await fetch("/api/track-inspection-view", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inspection_id: inspectionId,
            view_type: "repair_request",
            viewer_role: initialUrlParams.role,
            viewer_email: initialUrlParams.email || null,
            path: `/repair-request?inspection_id=${inspectionId}`,
          }),
        });
      } catch (error) {
        console.error("Repair request tracking error:", error);
      }
    }

    trackRepairRequestView();
  }, [inspectionId, initialUrlParams.role, initialUrlParams.email]);

  useEffect(() => {
    async function loadResponseStatus() {
      if (!inspectionId) return;

      try {
        const response = await fetch(
          `/api/repair-response/status?inspection_id=${inspectionId}`,
          { cache: "no-store" },
        );

        if (!response.ok) return;

        const payload = await response.json().catch(() => ({}));
        setResponseShares(Array.isArray(payload?.shares) ? payload.shares : []);
        setResponseItems(Array.isArray(payload?.responses) ? payload.responses : []);
      } catch {
        // Not signed in as the inspector (e.g. a client/realtor viewing this
        // page) or a transient error - the status panel just stays hidden.
      } finally {
        setResponsesLoaded(true);
      }
    }

    loadResponseStatus();
  }, [inspectionId]);

  useEffect(() => {
    async function loadData() {
      if (!inspectionId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const selectedFromUrl = initialUrlParams.selected
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);

        const roleFromUrl = initialUrlParams.role;
        const emailFromUrl = initialUrlParams.email;

        const query = new URLSearchParams({
          inspection_id: String(inspectionId),
        });

        if (selectedFromUrl.length) {
          query.set("selected", selectedFromUrl.join(","));
        }

        if (roleFromUrl) query.set("role", roleFromUrl);
        if (emailFromUrl) query.set("email", emailFromUrl);
        if (initialUrlParams.token) query.set("token", initialUrlParams.token);

        const response = await fetch(
          `/api/repair-request-public?${query.toString()}`,
          { cache: "no-store" },
        );

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || "Could not load repair request.");
        }

        const hydratedFindings = addFindingNumbers(
          Array.isArray(payload?.findings) ? payload.findings : [],
        );

        const validSelectedIds = selectedFromUrl.filter((id) =>
          hydratedFindings.some((finding: any) => String(finding.id) === id),
        );

        setInspection(payload?.inspection || null);
        setContacts(Array.isArray(payload?.contacts) ? payload.contacts : []);
        setFindings(hydratedFindings);
        setVisibleFindingCount(FINDING_RENDER_PAGE_SIZE);

        setSelectedIds(validSelectedIds);
      } catch (error: any) {
        console.error("Repair request load error:", error);
        setEmailMessage(error?.message || "Could not load repair request.");
        setInspection(null);
        setContacts([]);
        setFindings([]);
        setSelectedIds([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [inspectionId]);

  const selectedFindings = useMemo(
    () =>
      findings.filter((finding) => selectedIds.includes(String(finding.id))),
    [findings, selectedIds],
  );

  const visibleFindings = useMemo(
    () => findings.slice(0, visibleFindingCount),
    [findings, visibleFindingCount],
  );

  const hiddenFindingCount = Math.max(0, findings.length - visibleFindingCount);

  const selectedCreditTotal = useMemo(() => {
    return selectedFindings.reduce((sum, finding) => {
      return sum + parseMoneyValue(getFindingCredit(finding, requestedCredits));
    }, 0);
  }, [selectedFindings, requestedCredits]);

  function updateRequestedCredit(findingId: string, value: string) {
    setRequestedCredits((prev) => ({
      ...prev,
      [String(findingId)]: value,
    }));
  }

  // AI ballpark repair-cost estimates for the selected findings (rough planning
  // ranges, editable). They can seed the requested-credit amounts.
  const estimateTotal = useMemo(() => {
    let low = 0;
    let high = 0;
    let any = false;
    for (const finding of selectedFindings) {
      const e = estimates[String(finding.id)];
      if (e) {
        low += e.low;
        high += e.high;
        if (e.low || e.high) any = true;
      }
    }
    return { low, high, any };
  }, [selectedFindings, estimates]);

  async function runEstimates() {
    if (!selectedFindings.length || estimating) return;
    setEstimating(true);
    setEstimateError("");
    try {
      const region =
        [inspection?.city, inspection?.state, inspection?.zip].filter(Boolean).join(", ") ||
        inspection?.property_address ||
        inspection?.address ||
        "";
      const res = await fetch("/api/ai/repair-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          findings: selectedFindings.map((finding) => ({
            id: String(finding.id),
            title: finding.title,
            severity: finding.severity,
            section: finding.section,
            location: finding.location,
            observation: finding.observation,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstimateError(data?.error || "Could not estimate costs. Please try again.");
        return;
      }
      setEstimates((prev) => ({ ...prev, ...(data.estimates || {}) }));
    } catch {
      setEstimateError("Could not estimate costs. Please try again.");
    } finally {
      setEstimating(false);
    }
  }

  function fillCreditsFromEstimates() {
    setRequestedCredits((prev) => {
      const next = { ...prev };
      for (const finding of selectedFindings) {
        const id = String(finding.id);
        const e = estimates[id];
        if (e && (e.low || e.high)) {
          const midpoint = Math.round((e.low + e.high) / 2);
          if (!next[id] || Number(next[id]) === 0) next[id] = String(midpoint);
        }
      }
      return next;
    });
  }

  const groupedFindings = useMemo(() => {
    return selectedFindings.reduce(
      (acc: Record<string, Finding[]>, finding) => {
        const section = finding.section || "Other";
        if (!acc[section]) acc[section] = [];
        acc[section].push(finding);
        return acc;
      },
      {},
    );
  }, [selectedFindings]);

  const realtorSummary = useMemo(() => {
    if (selectedFindings.length === 0) {
      return "No repair request items have been selected yet.";
    }

    const safetyCount = selectedFindings.filter((finding) => {
      const severity = String(finding.severity || "").toLowerCase();
      return (
        severity.includes("safety") ||
        severity.includes("hazard") ||
        severity.includes("major")
      );
    }).length;

    const sections = Array.from(
      new Set(selectedFindings.map((finding) => finding.section || "Other")),
    ).join(", ");

    return `The buyer respectfully requests correction, repair, evaluation, or further negotiation of ${selectedFindings.length} inspection item(s) identified in the inspection report. ${
      safetyCount > 0
        ? `${safetyCount} item(s) appear to involve safety, major, or higher-priority concerns. `
        : ""
    }The selected items are grouped under the following inspection sections: ${sections}. This repair request summary is intended to assist the parties in negotiating repairs, credits, licensed contractor evaluation, or other mutually agreed resolutions prior to closing.`;
  }, [selectedFindings]);

  const recipientOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; email?: string }> = [];

    const client = contacts.find((contact) => {
      const role = String(contact.role || "").toLowerCase();
      return role.includes("client");
    });

    const realtor = contacts.find((contact) => {
      const role = String(contact.role || "").toLowerCase();
      return (
        role.includes("realtor") ||
        role.includes("agent") ||
        role.includes("transaction")
      );
    });

    if (client?.email || inspection?.client_email) {
      options.push({
        value: "client",
        label: `Client${client?.email || inspection?.client_email ? ` - ${client?.email || inspection?.client_email}` : ""}`,
        email: client?.email || inspection?.client_email,
      });
    }

    if (
      realtor?.email ||
      inspection?.realtor_email ||
      inspection?.agent_email
    ) {
      options.push({
        value: "realtor",
        label: `Realtor${realtor?.email || inspection?.realtor_email || inspection?.agent_email ? ` - ${realtor?.email || inspection?.realtor_email || inspection?.agent_email}` : ""}`,
        email:
          realtor?.email ||
          inspection?.realtor_email ||
          inspection?.agent_email,
      });
    }

    if (contacts.length > 1) {
      options.push({ value: "all", label: "All report contacts" });
    }

    contacts.forEach((contact, index) => {
      const email = String(contact.email || "").trim();
      if (!email) return;
      const role = String(contact.role || "contact").trim();
      const name = String(contact.name || "").trim();
      options.push({
        value: `custom-contact-${index}`,
        label: `${name ? `${name} - ` : ""}${role} - ${email}`,
        email,
      });
    });

    options.push({ value: "custom", label: "Custom email address" });

    const seen = new Set<string>();
    return options.filter((option) => {
      const key = `${option.value}:${option.email || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [contacts, inspection]);


  function toggleFinding(id: string) {
    const cleanId = String(id);

    setSelectedIds((prev) => {
      if (prev.includes(cleanId)) {
        setRequestedCredits((current) => {
          const next = { ...current };
          delete next[cleanId];
          return next;
        });

        return prev.filter((item) => item !== cleanId);
      }

      return [...prev, cleanId];
    });
  }

  function selectSafetyOnly() {
    const safetyIds = findings
      .filter((finding) => {
        const severity = String(finding.severity || "").toLowerCase();
        return (
          severity.includes("safety") ||
          severity.includes("hazard") ||
          severity.includes("major")
        );
      })
      .map((finding) => String(finding.id));

    setSelectedIds(safetyIds);
  }

  async function shareRepairRequestPdf() {
    if (printingPdf) return;

    if (!selectedFindings.length) {
      setPdfMessage(
        "Select at least one finding before downloading the repair request.",
      );
      return;
    }

    try {
      setPrintingPdf(true);
      setPdfMessage("Downloading repair request file...");

      const selectedFindingsWithCredits: Finding[] = selectedFindings.map(
        (finding: Finding) => ({
          ...finding,
          requested_credit_amount: getFindingCredit(finding, requestedCredits),
        }),
      );

      const groupedFindingsWithCredits = selectedFindingsWithCredits.reduce(
        (acc: Record<string, Finding[]>, finding: Finding) => {
          const section = finding.section || "Other";
          if (!acc[section]) acc[section] = [];
          acc[section].push(finding);
          return acc;
        },
        {} as Record<string, Finding[]>,
      );

      const printableHtml = buildPrintableRepairRequestHtml({
        inspection,
        selectedFindings: selectedFindingsWithCredits,
        groupedFindings: groupedFindingsWithCredits,
        requestIntro,
      });

      const property = String(
        inspection?.property_address || inspection?.address || "repair-request",
      )
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70);

      const blob = new Blob([printableHtml], {
        type: "text/html;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");

      downloadLink.href = url;
      downloadLink.download = `${property || "repair-request"}-repair-request.html`;
      downloadLink.rel = "noopener";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setPdfMessage(
        "Repair request file downloaded. Open the file to view, print, or save as PDF.",
      );
    } catch (error) {
      console.error("Repair request download error:", error);
      setPdfMessage("Could not download the repair request file. Try again.");
    } finally {
      setPrintingPdf(false);
    }
  }

  async function emailRepairRequest() {
    if (emailingRepairRequest) return;

    if (!selectedIds.length) {
      setEmailMessage(
        "Select at least one finding before emailing the repair request.",
      );
      return;
    }

    const selectedOption = recipientOptions.find(
      (option) => option.value === recipientType,
    );
    const isCustomContact = recipientType.startsWith("custom-contact-");
    const finalRecipientType =
      recipientType === "client" ||
      recipientType === "realtor" ||
      recipientType === "all"
        ? recipientType
        : "custom";
    const finalRecipientEmail =
      recipientType === "custom"
        ? customRecipientEmail.trim()
        : String(selectedOption?.email || "").trim();

    if (
      (recipientType === "custom" || isCustomContact) &&
      !finalRecipientEmail
    ) {
      setEmailMessage("Enter or select an email address before sending.");
      return;
    }

    try {
      setEmailingRepairRequest(true);
      setEmailMessage("Sending repair request...");

      const response = await fetch("/api/send-repair-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          recipientType: finalRecipientType,
          recipientEmail: finalRecipientEmail || undefined,
          selectedIds,
          requestedCredits,
          requestedCreditTotal: selectedCreditTotal,
          summary: realtorSummary,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload?.error || "Repair request email failed to send.",
        );
      }

      setEmailMessage(payload?.message || "Repair request email sent.");
    } catch (error: any) {
      setEmailMessage(error?.message || "Repair request email failed to send.");
    } finally {
      setEmailingRepairRequest(false);
    }
  }

  if (!inspectionId) {
    return (
      <main className="min-h-screen bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] md:p-8">
        <h1 className="break-words text-3xl font-semibold text-[var(--fl-accent-text)]">
          Repair Request Builder
        </h1>
        <p className="mt-4 text-[var(--fl-muted)]">Missing inspection ID.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] md:p-8">
        Loading repair request...
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--fl-ground)] p-4 pb-32 text-[var(--fl-text)] md:p-8 md:pb-8">
      <div className="mx-auto max-w-7xl overflow-hidden">
        <div className="mb-6 space-y-3 print:hidden">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FastLinkButton
              href={`/reports/${inspectionId}`}
              loadingText="Opening Report..."
              className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-5 py-3 text-center font-bold text-[var(--fl-text)] transition hover:border-slate-300 hover:bg-[var(--fl-surface-2)] active:scale-[0.98]"
            >
              Back to Report
            </FastLinkButton>

            <button
              type="button"
              onClick={shareRepairRequestPdf}
              disabled={printingPdf}
              data-fast-click="true" className="min-h-[48px] w-full rounded-xl border border-teal-500 bg-[var(--fl-ground)] px-5 py-3 font-bold text-[var(--fl-accent-text)] transition hover:border-teal-400 hover:bg-teal-500/10 hover:shadow-[0_0_22px_rgba(20,184,166,0.18)] active:scale-[0.98] disabled:opacity-60"
            >
              {printingPdf ? "Downloading..." : "Download Repair Request"}
            </button>

            <div className="grid w-full grid-cols-1 gap-3 rounded-xl border border-cyan-500 bg-[var(--fl-ground)] p-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:col-span-2">
              <label className="min-w-0">
                <span className="mb-1 block px-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
                  Send To
                </span>
                <select
                  value={recipientType}
                  onChange={(event) => {
                    setRecipientType(event.target.value);
                    setEmailMessage("");
                  }}
                  className="h-[48px] w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 text-sm font-bold text-[var(--fl-text)] outline-none transition focus:border-cyan-400"
                >
                  {recipientOptions.map((option) => (
                    <option
                      key={`${option.value}-${option.email || ""}`}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={emailRepairRequest}
                disabled={emailingRepairRequest}
                data-fast-click="true" className="min-h-[48px] w-full rounded-xl border border-cyan-500 bg-[var(--fl-ground)] px-5 py-3 font-bold text-cyan-300 transition hover:border-cyan-400 hover:bg-cyan-500/10 hover:shadow-[0_0_22px_rgba(6,182,212,0.18)] active:scale-[0.98] disabled:opacity-60 sm:mt-[18px] sm:w-auto"
              >
                {emailingRepairRequest ? "Sending..." : "Email Repair Request"}
              </button>

              {recipientType === "custom" ? (
                <input
                  value={customRecipientEmail}
                  onChange={(event) =>
                    setCustomRecipientEmail(event.target.value)
                  }
                  placeholder="email@example.com"
                  type="email"
                  className="h-[48px] w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 text-sm font-bold text-[var(--fl-text)] outline-none transition focus:border-cyan-400 sm:col-span-2"
                />
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">

            <button
              type="button"
              onClick={() =>
                setSelectedIds(findings.map((finding) => String(finding.id)))
              }
              className="min-h-[48px] w-full rounded-xl border border-teal-500 bg-[var(--fl-ground)] px-5 py-3 font-bold text-[var(--fl-accent-text)] transition hover:border-teal-400 hover:bg-teal-500/10 active:scale-[0.98]"
            >
              Select All
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="min-h-[48px] w-full rounded-xl border border-red-500 bg-[var(--fl-ground)] px-5 py-3 font-bold text-red-300 transition hover:border-red-400 hover:bg-red-500/10 active:scale-[0.98]"
            >
              Clear All
            </button>

            <button
              type="button"
              onClick={selectSafetyOnly}
              className="min-h-[48px] w-full rounded-xl border border-orange-500 bg-[var(--fl-ground)] px-5 py-3 font-bold text-orange-300 transition hover:border-orange-400 hover:bg-orange-500/10 active:scale-[0.98]"
            >
              Safety Only
            </button>
          </div>
        </div>

        {responsesLoaded && responseShares.length > 0 && (
          <div className="mb-6 space-y-4 rounded-2xl border border-purple-500/40 bg-purple-500/5 p-4 print:hidden md:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-purple-300">
              Seller / Agent Responses
            </p>

            {responseShares.map((share: any) => {
              const shareResponses = responseItems.filter(
                (item: any) => String(item.share_id) === String(share.id),
              );
              const hasResponded = Boolean(share.responded_at) || shareResponses.length > 0;

              return (
                <div
                  key={share.id}
                  className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-[var(--fl-text)]">
                        {share.recipient_email || "Recipient"}
                        <span className="ml-2 text-xs font-bold uppercase text-[var(--fl-faint)]">
                          {share.recipient_type || ""}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-[var(--fl-faint)]">
                        Sent {share.created_at ? new Date(share.created_at).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        hasResponded
                          ? "border-green-500/40 bg-green-500/10 text-green-300"
                          : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
                      }`}
                    >
                      {hasResponded ? "Responded" : "Waiting"}
                    </span>
                  </div>

                  {shareResponses.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-[var(--fl-raised)] pt-3">
                      {shareResponses.map((item: any) => {
                        const finding = findings.find(
                          (f) => String(f.id) === String(item.finding_id),
                        );
                        const meta = getResponseStatusMeta(item.response_status);

                        return (
                          <div key={item.id} className="rounded-lg bg-[var(--fl-surface-2)] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-bold text-[var(--fl-text)]">
                                {finding?.title || finding?.recommendation || "Repair item"}
                              </p>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.tone}`}
                              >
                                {meta.icon} {meta.label}
                              </span>
                            </div>
                            {item.notes && (
                              <p className="mt-1 text-sm text-[var(--fl-muted)]">{item.notes}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {pdfMessage ? (
          <p className="mb-6 rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm font-bold text-[var(--fl-accent-text)] print:hidden">
            {pdfMessage}
          </p>
        ) : null}

        {emailMessage ? (
          <p className="mb-6 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-200 print:hidden">
            {emailMessage}
          </p>
        ) : null}

        <section className="mb-8 overflow-hidden rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-xl md:p-6">
          <p className="break-words text-sm font-bold uppercase tracking-[0.22em] text-[var(--fl-accent-text)] md:tracking-[0.3em]">
            {inspection?.company_name || "Your Home Inspection Company"}
          </p>

          <h1 className="mt-3 break-words text-3xl font-semibold text-[var(--fl-text)] md:text-4xl">
            Repair Request Summary
          </h1>

          <p className="mt-3 break-words text-[var(--fl-muted)]">
            {inspection?.property_address ||
              inspection?.address ||
              "Property address not entered"}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <Info label="Client" value={inspection?.client_name} />
            <Info label="Realtor" value={inspection?.realtor_name} />
            <Info label="Date" value={inspection?.inspection_date} />
            <Info label="Selected Items" value={selectedFindings.length} />
            <Info label="Requested Credit" value={formatMoney(selectedCreditTotal)} />
          </div>
        </section>

        <section className="mb-8 overflow-hidden rounded-2xl border border-teal-500/30 bg-[var(--fl-surface-2)] p-5 md:p-6">
          <h2 className="mb-3 break-words text-2xl font-bold text-[var(--fl-accent-text)]">
            Generate Realtor Summary
          </h2>

          <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-text)]">
            <p className="whitespace-pre-line break-words leading-7">
              {realtorSummary}
            </p>
          </div>
        </section>

        <section className="mb-8 overflow-hidden rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-5 md:p-6">
          <h2 className="mb-3 break-words text-2xl font-bold text-[var(--fl-accent-text)]">
            Request Language
          </h2>

          <textarea
            value={requestIntro}
            onChange={(e) => setRequestIntro(e.target.value)}
            rows={4}
            className="w-full max-w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] outline-none focus:border-teal-400"
          />
        </section>

        <section className="mb-8 overflow-hidden rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 print:hidden md:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="break-words text-2xl font-bold text-[var(--fl-accent-text)]">
                Select Findings
              </h2>
              <p className="mt-1 text-sm text-[var(--fl-muted)]">
                Select the items to include, then enter any requested credit beside each selected item. Photos stay out of this builder until download/email to keep the page fast.
              </p>
            </div>
            <div className="rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">Running Total</p>
              <p className="text-2xl font-semibold text-[var(--fl-text)]">{formatMoney(selectedCreditTotal)}</p>
            </div>
          </div>

          {selectedFindings.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3">
              <button
                type="button"
                onClick={runEstimates}
                disabled={estimating}
                className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {estimating ? "Estimating…" : "Estimate repair costs (AI)"}
              </button>
              {estimateTotal.any && (
                <>
                  <span className="text-sm font-bold text-indigo-100">
                    Estimated total: {formatMoney(estimateTotal.low)}–{formatMoney(estimateTotal.high)}
                  </span>
                  <button
                    type="button"
                    onClick={fillCreditsFromEstimates}
                    className="rounded-xl border border-teal-500/50 px-3 py-2 text-xs font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10"
                  >
                    Fill credits from estimates
                  </button>
                </>
              )}
              <span className="text-[11px] text-[var(--fl-muted)]">
                Rough AI planning estimate — review before sending.
              </span>
              {estimateError && (
                <span className="text-xs font-bold text-red-400">{estimateError}</span>
              )}
            </div>
          )}

          <div className="space-y-3">
            {visibleFindings.map((finding) => {
              const selected = selectedIds.includes(String(finding.id));

              return (
                <label
                  key={finding.id}
                  className={`block w-full max-w-full cursor-pointer overflow-hidden rounded-xl border bg-[var(--fl-ground)] p-4 transition [content-visibility:auto] [contain-intrinsic-size:130px] ${
                    selected
                      ? "border-teal-400 ring-1 ring-teal-400/40"
                      : "border-[var(--fl-line)] hover:border-teal-500"
                  }`}
                >
                  <div className="flex w-full max-w-full flex-col gap-4 sm:flex-row sm:items-start">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleFinding(String(finding.id))}
                      className="h-6 w-6 shrink-0 accent-teal-400"
                    />

                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="mb-2 flex max-w-full flex-wrap gap-2">
                        <span className="max-w-full break-words rounded-full border border-cyan-500/60 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                          Item #{getFindingNumber(finding)}
                        </span>

                        <span
                          className={`max-w-full break-words rounded-full border px-3 py-1 text-xs font-bold uppercase ${getSeverityStyle(
                            finding.severity,
                          )}`}
                        >
                          {finding.severity || "Recommended Repair"}
                        </span>

                        <span className="max-w-full break-words rounded-full border border-[var(--fl-line)] px-3 py-1 text-xs font-bold uppercase text-[var(--fl-muted)]">
                          {finding.section || "Other"}
                        </span>
                      </div>

                      <p className="break-words font-bold text-[var(--fl-text)]">
                        {finding.title || "Untitled Finding"}
                      </p>

                      <p className="mt-1 line-clamp-3 break-words text-sm leading-6 text-[var(--fl-muted)]">
                        {finding.recommendation || finding.observation || ""}
                      </p>

                      {selected && (
                        <>
                          <label className="mt-4 block max-w-xs">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
                              Requested Credit
                            </span>
                            <input
                              value={String(requestedCredits[String(finding.id)] || "")}
                              onChange={(event) =>
                                updateRequestedCredit(String(finding.id), event.target.value)
                              }
                              onClick={(event) => event.stopPropagation()}
                              placeholder="$0"
                              inputMode="decimal"
                              className="h-[48px] w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 text-sm font-semibold text-[var(--fl-text)] outline-none transition focus:border-teal-400"
                            />
                          </label>
                          {estimates[String(finding.id)] &&
                          (estimates[String(finding.id)].low || estimates[String(finding.id)].high) ? (
                            <p className="mt-2 text-xs font-bold text-indigo-300">
                              Est. repair {formatMoney(estimates[String(finding.id)].low)}–
                              {formatMoney(estimates[String(finding.id)].high)}
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {hiddenFindingCount > 0 ? (
            <button
              type="button"
              onClick={() =>
                setVisibleFindingCount((prev) =>
                  Math.min(prev + FINDING_RENDER_PAGE_SIZE, findings.length),
                )
              }
              className="mt-4 min-h-[48px] w-full rounded-xl border border-cyan-500 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 active:scale-[0.98]"
            >
              Load {Math.min(FINDING_RENDER_PAGE_SIZE, hiddenFindingCount)} more finding
              {Math.min(FINDING_RENDER_PAGE_SIZE, hiddenFindingCount) === 1 ? "" : "s"}
            </button>
          ) : null}

          {findings.length > visibleFindings.length ? (
            <p className="mt-3 text-center text-xs font-bold text-[var(--fl-faint)]">
              Showing {visibleFindings.length} of {findings.length} findings to keep this page fast.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default function RepairRequestPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[var(--fl-ground)] p-8 text-[var(--fl-text)]">
          Loading repair request...
        </main>
      }
    >
      <RepairRequestContent />
    </Suspense>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
      <p className="break-words text-xs font-bold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>
      <p className="mt-1 break-words font-bold text-[var(--fl-text)]">
        {value === 0 ? 0 : value || "N/A"}
      </p>
    </div>
  );
}

function ReportText({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-3">
      <p className="break-words font-semibold text-slate-950">{title}:</p>
      <p className="mt-1 whitespace-pre-line break-words leading-7 text-slate-700">
        {text}
      </p>
    </div>
  );
}
