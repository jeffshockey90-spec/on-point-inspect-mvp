
import { formatAppValue } from "./app-time";
import { createClient } from "@supabase/supabase-js";

export type AgreementState = "MD" | "WV" | "PA";

export function normalizeAgreementState(
  state?: string | null
): AgreementState {
  const clean = String(state || "MD").trim().toUpperCase();

  if (clean === "WV" || clean === "WEST VIRGINIA") return "WV";
  if (clean === "PA" || clean === "PENNSYLVANIA") return "PA";

  return "MD";
}

export function getAgreementVersion(state?: string | null) {
  const normalized = normalizeAgreementState(state);

  if (normalized === "MD") return "MD SOP Contract - V6";
  if (normalized === "WV") return "WV SOP Contract - V5";

  return "PA InterNACHI Contract - V5";
}

export function getAgreementTitle(state?: string | null) {
  const normalized = normalizeAgreementState(state);
  return `${normalized} Residential Inspection Agreement`;
}

function formatFee(fee?: string | number | null) {
  if (fee === null || fee === undefined || fee === "") {
    return "Inspection fee as agreed";
  }

  const raw = String(fee).trim();
  if (raw.startsWith("$")) return raw;

  return `$${raw}`;
}

function formatDate(date?: string | null) {
  if (!date) return formatAppValue(new Date(), {});

  // A bare database date ("YYYY-MM-DD") has no time or zone. Parsing it with
  // `new Date()` treats it as UTC midnight, which then renders as the PREVIOUS
  // day once converted to the app's timezone. Anchor it at UTC noon and format
  // in UTC so the agreement shows the exact scheduled inspection date.
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(
      new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)),
    );
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;

  return formatAppValue(parsed, {});
}

// Format a bare "HH:MM" (or "HH:MM:SS") time string into a 12-hour clock label
// like "9:00 AM". Done with plain arithmetic rather than a Date so there is no
// timezone shift on a time-of-day that carries no date.
export function formatAgreementTime(time?: string | null) {
  const raw = String(time || "").trim();
  if (!raw) return "";

  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return raw;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return raw;

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;

  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function getLicenseNumber(state?: string | null) {
  const normalized = normalizeAgreementState(state);

  if (normalized === "MD") return "35912";
  if (normalized === "WV") return "HI5277172-0226";

  return "N/A";
}

function getLicenseLine(state?: string | null) {
  const normalized = normalizeAgreementState(state);

  if (normalized === "MD") return "MD Home Inspector License #35912";
  if (normalized === "WV") return "WV Home Inspector License #HI5277172-0226";

  return "Pennsylvania service area inspection performed under applicable Pennsylvania requirements and InterNACHI SOP.";
}

function fillBlankLine(label: string, value: string) {
  // Some template authors write "Fee: $______" with a literal currency sign
  // ahead of the blank - tolerate an optional "$" between the colon and the
  // underscore run so those still get recognized as fillable blanks.
  return new RegExp(`${label}:\\s*\\$?\\s*(?:_+)?\\s*(?=\\n|$)`, "i");
}

export function applyAgreementMergeFields({
  templateBody,
  state,
  clientName,
  coClientName,
  clientOrganization,
  propertyAddress,
  fee,
  inspectorName,
  ownerName,
  inspectionDate,
  inspectionTime,
  signedDate,
}: {
  templateBody: string;
  state?: string | null;
  clientName?: string | null;
  coClientName?: string | null;
  clientOrganization?: string | null;
  propertyAddress?: string | null;
  fee?: string | number | null;
  inspectorName?: string | null;
  ownerName?: string | null;
  inspectionDate?: string | null;
  inspectionTime?: string | null;
  signedDate?: string | null;
}) {
  const normalized = normalizeAgreementState(state);

  const displayClient = clientName || "Client";
  const displayCoClient = coClientName || "";
  const displayOrganization = clientOrganization || "";
  const displayProperty = propertyAddress || "Inspection Property";
  const displayFee = formatFee(fee);
  const displayDate = formatDate(inspectionDate);
  const displayTime = formatAgreementTime(inspectionTime);
  // The appointment line shows date + time together when a time is set, so a
  // client sees exactly when the inspection is scheduled. Falls back to the
  // date alone (original behavior) when no time is on the inspection.
  const displayDateTime = displayTime ? `${displayDate} at ${displayTime}` : displayDate;
  const displaySignedDate = formatDate(signedDate || inspectionDate);

  // {{INSPECTOR_COMPANY}}/{{INSPECTOR_OWNER}} are separate merge tokens some
  // templates use directly (not just {{INSPECTOR_NAME}}) - ownerName comes
  // from the signed-in company's actual owner profile, falling back to the
  // generic word "Owner" only when that lookup comes back empty.
  const inspectorCompany = inspectorName || "Your Home Inspection Company";
  const inspectorOwner = ownerName || "Owner";
  const inspectorTitle = "Licensed Home Inspector";
  const inspectorDisplay =
    inspectorName || `${inspectorCompany} — ${inspectorOwner}, ${inspectorTitle}`;

  const inspectorLicense = getLicenseLine(normalized);
  const inspectorLicenseNumber = getLicenseNumber(normalized);
  const inspectorLicenseExpiration = "12-07-27";

  let body = templateBody || "";

  const mergeFields: Record<string, string> = {
    "{{AGREEMENT_STATE}}": normalized,
    "{{AGREEMENT_VERSION}}": getAgreementVersion(normalized),
    "{{AGREEMENT_DATE}}": displayDate,
    "{{INSPECTION_DATE}}": displayDateTime,
    "{{INSPECTION_DATE_TIME}}": displayDateTime,
    "{{INSPECTION_TIME}}": displayTime,
    "{{APPOINTMENT_TIME}}": displayTime,
    "{{SIGNED_DATE}}": displaySignedDate,

    "{{CLIENT_NAME}}": displayClient,
    "{{CLIENT}}": displayClient,
    "{{CO_CLIENT_NAME}}": displayCoClient,
    "{{COCLIENT_NAME}}": displayCoClient,
    "{{CLIENT_ORGANIZATION}}": displayOrganization,
    "{{ORGANIZATION}}": displayOrganization,
    "{{BUSINESS_NAME}}": displayOrganization,

    "{{PROPERTY_ADDRESS}}": displayProperty,
    "{{COMMON_STREET_ADDRESS}}": displayProperty,

    "{{INSPECTION_FEE}}": displayFee,
    "{{FEE}}": displayFee,

    "{{INSPECTOR_NAME}}": inspectorDisplay,
    "{{INSPECTOR}}": inspectorDisplay,
    "{{INSPECTOR_COMPANY}}": inspectorCompany,
    "{{INSPECTOR_OWNER}}": inspectorOwner,
    "{{INSPECTOR_TITLE}}": inspectorTitle,
    "{{INSPECTOR_LICENSE}}": inspectorLicense,
    "{{INSPECTOR_LICENSE_NUMBER}}": inspectorLicenseNumber,
    "{{INSPECTOR_LICENSE_EXPIRATION}}": inspectorLicenseExpiration,
    "{{LICENSE_EXPIRATION_DATE}}": inspectorLicenseExpiration,
  };

  for (const [key, value] of Object.entries(mergeFields)) {
    body = body.split(key).join(value);
  }

  // Fill the "This Agreement dated:" blank, tolerating a missing colon. Only one
  // of these runs: applying both would re-match the text we just inserted and
  // leave a stray duplicate date line.
  if (/This Agreement dated:/i.test(body)) {
    body = body.replace(
      /This Agreement dated:\s*(?:_+)?\s*/i,
      `This Agreement dated: ${displayDate}\n\n`
    );
  } else {
    body = body.replace(
      /This Agreement dated\s*(?:_+)?\s*/i,
      `This Agreement dated: ${displayDate}\n\n`
    );
  }

  body = body.replace(fillBlankLine("Client", displayClient), `Client: ${displayClient}\n`);
  if (displayOrganization) {
    body = body.replace(
      fillBlankLine("Business/Organization", displayOrganization),
      `Business/Organization: ${displayOrganization}\n`
    );
  }
  body = body.replace(fillBlankLine("Inspector", inspectorDisplay), `Inspector: ${inspectorDisplay}\n`);
  body = body.replace(fillBlankLine("Property Address", displayProperty), `Property Address: ${displayProperty}\n`);
  body = body.replace(fillBlankLine("Common Street Address", displayProperty), `Common Street Address: ${displayProperty}\n`);
  body = body.replace(fillBlankLine("Inspection Date", displayDateTime), `Inspection Date: ${displayDateTime}\n`);
  body = body.replace(fillBlankLine("Inspection Time", displayTime), `Inspection Time: ${displayTime}\n`);
  body = body.replace(fillBlankLine("Fee", displayFee), `Fee: ${displayFee}\n`);
  body = body.replace(fillBlankLine("State License No\\.", inspectorLicense), `State License No.: ${inspectorLicense}\n`);
  body = body.replace(fillBlankLine("License Expiration Date", inspectorLicenseExpiration), `License Expiration Date: ${inspectorLicenseExpiration}\n`);

  // Template authors write this signature-date blank as either "Date:" or
  // "Dated:" - match either, but keep whichever label they actually used.
  body = body.replace(
    /(Dated|Date):\s*(?:_+)?\s*(?=\n|$)/i,
    (_match, label) => `${label}: ${displaySignedDate}\n`
  );

  return body;
}

export function mergeAgreementBody({
  templateBody,
  state,
  clientName,
  coClientName,
  clientOrganization,
  propertyAddress,
  fee,
  inspectorName,
  ownerName,
  inspectionDate,
  inspectionTime,
  signedDate,
}: {
  templateBody: string;
  state?: string | null;
  clientName?: string | null;
  coClientName?: string | null;
  clientOrganization?: string | null;
  propertyAddress?: string | null;
  fee?: string | number | null;
  inspectorName?: string | null;
  ownerName?: string | null;
  inspectionDate?: string | null;
  inspectionTime?: string | null;
  signedDate?: string | null;
}) {
  const filledAgreement = applyAgreementMergeFields({
    templateBody,
    state,
    clientName,
    coClientName,
    clientOrganization,
    propertyAddress,
    fee,
    inspectorName,
    ownerName,
    inspectionDate,
    inspectionTime,
    signedDate,
  });

  return `${filledAgreement}

----------------------------------------------------------------

ELECTRONIC SIGNATURE ACKNOWLEDGEMENT

By signing electronically, the Client confirms that they have read, understood, and accepted this Residential Inspection Agreement.`;
}

// Map a template's free-form service_type to a coarse service category.
function serviceCategoryForType(serviceType?: string | null): "home" | "radon" | "mold" {
  const value = String(serviceType || "home_inspection").toLowerCase();
  if (value.includes("radon")) return "radon";
  if (value.includes("mold")) return "mold";
  return "home";
}

export type AgreementServiceFees = {
  home?: number | string | null;
  radon?: number | string | null;
  mold?: number | string | null;
};

// Per-service price for one agreement template, so a bundled (merged) agreement
// shows the radon fee on the radon agreement and the mold fee on the mold
// agreement -- instead of the whole-inspection total on every one. Falls back to
// the total fee when there's no positive per-service amount.
function feeForServiceType(
  serviceType: string | null | undefined,
  serviceFees: AgreementServiceFees | undefined,
  totalFee: string | number | null | undefined,
) {
  if (!serviceFees) return totalFee;
  const raw = serviceFees[serviceCategoryForType(serviceType)];
  const amount = Number(raw);
  if (
    raw === null ||
    raw === undefined ||
    raw === "" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return totalFee;
  }
  return amount;
}

// Split an inspection's stored fees into per-service amounts. The home portion is
// the total minus the clearly-separate add-ons (radon, mold, travel), with any
// bundle discount added back so each agreement shows that service's own price.
export function deriveServiceFees(inspection: any): AgreementServiceFees {
  const total =
    Number(inspection?.invoice_amount ?? inspection?.price ?? inspection?.fee ?? 0) || 0;
  const radon = Number(inspection?.radon_fee ?? 0) || 0;
  const mold = Number(inspection?.mold_fee ?? 0) || 0;

  // No add-on services: a single (home-only) agreement should keep showing the
  // full total, exactly as before. Only split per service when radon/mold add-ons
  // exist, so each service's agreement shows its own price.
  if (radon <= 0 && mold <= 0) {
    return { home: total, radon, mold };
  }

  const travel = Number(inspection?.travel_fee ?? 0) || 0;
  const discount = Number(inspection?.discount ?? 0) || 0;
  const home = Math.max(0, total - radon - mold - travel + discount);
  return { home, radon, mold };
}

export function mergeMultipleAgreementBodies({
  templates,
  state,
  clientName,
  coClientName,
  clientOrganization,
  propertyAddress,
  fee,
  serviceFees,
  inspectorName,
  ownerName,
  inspectionDate,
  inspectionTime,
  signedDate,
}: {
  templates: any[];
  state?: string | null;
  clientName?: string | null;
  coClientName?: string | null;
  clientOrganization?: string | null;
  propertyAddress?: string | null;
  fee?: string | number | null;
  serviceFees?: AgreementServiceFees;
  inspectorName?: string | null;
  ownerName?: string | null;
  inspectionDate?: string | null;
  inspectionTime?: string | null;
  signedDate?: string | null;
}) {
  if (!templates || templates.length === 0) {
    return mergeAgreementBody({
      templateBody:
        "Agreement template not found. Please contact the inspector.",
      state,
      clientName,
      coClientName,
      clientOrganization,
      propertyAddress,
      fee,
      inspectorName,
      ownerName,
      inspectionDate,
      inspectionTime,
      signedDate,
    });
  }

  const showGroupHeaders = templates.length > 1;

  return templates
    .map((template, index) => {
      const body = mergeAgreementBody({
        templateBody: template?.body || "",
        state,
        clientName,
        coClientName,
        clientOrganization,
        propertyAddress,
        // Each agreement shows its own service's price, not the bundle total.
        fee: feeForServiceType(template?.service_type, serviceFees, fee),
        inspectorName,
        ownerName,
        inspectionDate,
        inspectionTime,
        signedDate,
      });

      if (!showGroupHeaders) return body;

      const title = template?.title || `Agreement ${index + 1}`;
      const version = template?.version || "v1";
      const serviceType = template?.service_type || "home_inspection";

      return `AGREEMENT ${index + 1}: ${title}
Version: ${version}
Service Type: ${serviceType}

${body}`;
    })
    .join("\n\n\n============================================================\n\n\n");
}

export function buildAgreementBody({
  state,
  clientName,
  coClientName,
  propertyAddress,
  fee,
  inspectorName,
  inspectionDate,
  signedDate,
}: {
  state?: string | null;
  clientName?: string | null;
  coClientName?: string | null;
  propertyAddress?: string | null;
  fee?: string | number | null;
  inspectorName?: string | null;
  inspectionDate?: string | null;
  signedDate?: string | null;
}) {
  return mergeAgreementBody({
    templateBody:
      "Agreement template not loaded. Please select or create an agreement template in the Agreement Library.",
    state,
    clientName,
    coClientName,
    propertyAddress,
    fee,
    inspectorName,
    inspectionDate,
    signedDate,
  });
}

export async function getAgreementTemplateForInspection({
  inspection,
}: {
  inspection: any;
}) {
  const templates = await getAgreementTemplatesForInspection({
    inspection,
  });

  return templates[0] || null;
}

export async function getAgreementTemplatesForInspection({
  inspection,
}: {
  inspection: any;
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const selectedIds: string[] = Array.isArray(inspection.agreement_template_ids)
    ? inspection.agreement_template_ids
    : inspection.agreement_template_id
      ? [inspection.agreement_template_id]
      : [];

  if (selectedIds.length > 0) {
    const { data } = await supabase
      .from("agreement_templates")
      .select("*")
      .in("id", selectedIds);

    const templates = data || [];

    return selectedIds
      .map((id) => templates.find((template) => template.id === id))
      .filter(Boolean);
  }

  const state = normalizeAgreementState(
    inspection.agreement_state || inspection.state
  );

  const { data } = await supabase
    .from("agreement_templates")
    .select("*")
    .eq("state", state)
    .eq("is_active", true)
    .eq("is_default", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (data && data.length > 0) return data;

  const fallback = await supabase
    .from("agreement_templates")
    .select("*")
    .eq("state", state)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1);

  return fallback.data || [];
}