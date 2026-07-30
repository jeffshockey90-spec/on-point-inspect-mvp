
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

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;

  return formatAppValue(parsed, {});
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
  inspectionDate,
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
  inspectionDate?: string | null;
  signedDate?: string | null;
}) {
  const normalized = normalizeAgreementState(state);

  const displayClient = clientName || "Client";
  const displayCoClient = coClientName || "";
  const displayOrganization = clientOrganization || "";
  const displayProperty = propertyAddress || "Inspection Property";
  const displayFee = formatFee(fee);
  const displayDate = formatDate(inspectionDate);
  const displaySignedDate = formatDate(signedDate || inspectionDate);

  // {{INSPECTOR_COMPANY}}/{{INSPECTOR_OWNER}} are separate merge tokens some
  // templates use directly (not just {{INSPECTOR_NAME}}), so they need a
  // generic fallback too - printing a specific person's real name on another
  // company's signed client agreement would be a genuine legal-document bug,
  // not just cosmetic.
  const inspectorCompany = inspectorName || "Your Home Inspection Company";
  const inspectorOwner = "Owner";
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
    "{{INSPECTION_DATE}}": displayDate,
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

  body = body.replace(
    /This Agreement dated:\s*(?:_+)?\s*/i,
    `This Agreement dated: ${displayDate}\n\n`
  );

  body = body.replace(
    /This Agreement dated\s*(?:_+)?\s*/i,
    `This Agreement dated: ${displayDate}\n\n`
  );

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
  body = body.replace(fillBlankLine("Inspection Date", displayDate), `Inspection Date: ${displayDate}\n`);
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
  inspectionDate,
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
  inspectionDate?: string | null;
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
    inspectionDate,
    signedDate,
  });

  return `${filledAgreement}

----------------------------------------------------------------

ELECTRONIC SIGNATURE ACKNOWLEDGEMENT

By signing electronically, the Client confirms that they have read, understood, and accepted this Residential Inspection Agreement.`;
}

export function mergeMultipleAgreementBodies({
  templates,
  state,
  clientName,
  coClientName,
  clientOrganization,
  propertyAddress,
  fee,
  inspectorName,
  inspectionDate,
  signedDate,
}: {
  templates: any[];
  state?: string | null;
  clientName?: string | null;
  coClientName?: string | null;
  clientOrganization?: string | null;
  propertyAddress?: string | null;
  fee?: string | number | null;
  inspectorName?: string | null;
  inspectionDate?: string | null;
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
      inspectionDate,
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
        fee,
        inspectorName,
        inspectionDate,
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