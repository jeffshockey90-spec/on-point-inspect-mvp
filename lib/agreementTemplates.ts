import { createClient } from "@supabase/supabase-js";

export type AgreementState = "MD" | "WV" | "PA";

export function normalizeAgreementState(
  state?: string | null
): AgreementState {
  const clean = String(state || "MD")
    .trim()
    .toUpperCase();

  if (clean === "WV" || clean === "WEST VIRGINIA") {
    return "WV";
  }

  if (clean === "PA" || clean === "PENNSYLVANIA") {
    return "PA";
  }

  return "MD";
}

export function getAgreementVersion(
  state?: string | null
) {
  const normalized = normalizeAgreementState(state);

  if (normalized === "MD") {
    return "MD SOP Contract - V6";
  }

  if (normalized === "WV") {
    return "WV SOP Contract - V5";
  }

  return "PA InterNACHI Contract - V5";
}

export function getAgreementTitle(
  state?: string | null
) {
  const normalized = normalizeAgreementState(state);

  return `${normalized} Residential Inspection Agreement`;
}

function formatFee(fee?: string | number | null) {
  if (fee === null || fee === undefined || fee === "") {
    return "Inspection fee as agreed";
  }

  const raw = String(fee).trim();

  if (raw.startsWith("$")) {
    return raw;
  }

  return `$${raw}`;
}

function formatDate(date?: string | null) {
  if (!date) {
    return new Date().toLocaleDateString();
  }

  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return date;
  }
}

export function applyAgreementMergeFields({
  templateBody,
  state,
  clientName,
  propertyAddress,
  fee,
  inspectorName,
  inspectionDate,
}: {
  templateBody: string;
  state?: string | null;
  clientName?: string | null;
  propertyAddress?: string | null;
  fee?: string | number | null;
  inspectorName?: string | null;
  inspectionDate?: string | null;
}) {
  const normalized = normalizeAgreementState(state);

  const displayClient = clientName || "Client";
  const displayProperty =
    propertyAddress || "Inspection Property";
  const displayFee = formatFee(fee);
  const displayDate = formatDate(inspectionDate);

  const inspectorCompany = "On Point Home Inspections";
  const inspectorOwner = "Jeff Shockey";
  const inspectorTitle = "Owner / Licensed Home Inspector";
  const inspectorDisplay =
    inspectorName ||
    `${inspectorCompany} — ${inspectorOwner}, ${inspectorTitle}`;

  const licenseInfo =
    normalized === "MD"
      ? "MD Home Inspector License #35912"
      : normalized === "WV"
        ? "WV Home Inspector License #HI5277172-0226"
        : "Pennsylvania service area inspection performed under applicable Pennsylvania requirements and InterNACHI SOP.";

  let body = templateBody || "";

  const mergeFields: Record<string, string> = {
    "{{AGREEMENT_STATE}}": normalized,
    "{{AGREEMENT_VERSION}}": getAgreementVersion(normalized),
    "{{AGREEMENT_DATE}}": displayDate,
    "{{INSPECTION_DATE}}": displayDate,
    "{{CLIENT_NAME}}": displayClient,
    "{{CLIENT}}": displayClient,
    "{{PROPERTY_ADDRESS}}": displayProperty,
    "{{COMMON_STREET_ADDRESS}}": displayProperty,
    "{{INSPECTION_FEE}}": displayFee,
    "{{FEE}}": displayFee,
    "{{INSPECTOR_NAME}}": inspectorDisplay,
    "{{INSPECTOR}}": inspectorDisplay,
    "{{INSPECTOR_COMPANY}}": inspectorCompany,
    "{{INSPECTOR_OWNER}}": inspectorOwner,
    "{{INSPECTOR_TITLE}}": inspectorTitle,
    "{{INSPECTOR_LICENSE}}": licenseInfo,
  };

  for (const [key, value] of Object.entries(mergeFields)) {
    body = body.split(key).join(value);
  }

  body = body.replace(
    /This Agreement dated:\s*/i,
    `This Agreement dated: ${displayDate}\n\n`
  );

  body = body.replace(
    /This Agreement dated\s*/i,
    `This Agreement dated: ${displayDate}\n\n`
  );

  body = body.replace(
    /Client:\s*(?=\n|$)/i,
    `Client: ${displayClient}\n`
  );

  body = body.replace(
    /Inspector:\s*(?=\n|$)/i,
    `Inspector: ${inspectorDisplay}\n`
  );

  body = body.replace(
    /Common Street Address:\s*(?=\n|$)/i,
    `Common Street Address: ${displayProperty}\n`
  );

  body = body.replace(
    /Fee:\s*(?=\n|$)/i,
    `Fee: ${displayFee}\n`
  );

  body = body.replace(
    /State License No\.:\s*(?=\n|$)/i,
    `State License No.: ${licenseInfo}\n`
  );

  return body;
}

export function mergeAgreementBody({
  templateBody,
  state,
  clientName,
  propertyAddress,
  fee,
  inspectorName,
  inspectionDate,
}: {
  templateBody: string;
  state?: string | null;
  clientName?: string | null;
  propertyAddress?: string | null;
  fee?: string | number | null;
  inspectorName?: string | null;
  inspectionDate?: string | null;
}) {
  const normalized = normalizeAgreementState(state);

  const displayClient = clientName || "Client";
  const displayProperty =
    propertyAddress || "Inspection Property";
  const displayFee = formatFee(fee);
  const displayDate = formatDate(inspectionDate);

  const filledAgreement = applyAgreementMergeFields({
    templateBody,
    state,
    clientName,
    propertyAddress,
    fee,
    inspectorName,
    inspectionDate,
  });

  return `AGREEMENT DETAILS

Agreement State: ${normalized}
Agreement Version: ${getAgreementVersion(normalized)}
Agreement Date: ${displayDate}
Client: ${displayClient}
Inspector: On Point Home Inspections — Jeff Shockey, Owner / Licensed Home Inspector
Property: ${displayProperty}
Fee: ${displayFee}

----------------------------------------------------------------

${filledAgreement}

----------------------------------------------------------------

ELECTRONIC SIGNATURE ACKNOWLEDGEMENT

By signing electronically, the Client confirms that they have read, understood, and accepted this Residential Inspection Agreement.`;
}

export function mergeMultipleAgreementBodies({
  templates,
  state,
  clientName,
  propertyAddress,
  fee,
  inspectorName,
  inspectionDate,
}: {
  templates: any[];
  state?: string | null;
  clientName?: string | null;
  propertyAddress?: string | null;
  fee?: string | number | null;
  inspectorName?: string | null;
  inspectionDate?: string | null;
}) {
  if (!templates || templates.length === 0) {
    return mergeAgreementBody({
      templateBody:
        "Agreement template not found. Please contact the inspector.",
      state,
      clientName,
      propertyAddress,
      fee,
      inspectorName,
      inspectionDate,
    });
  }

  return templates
    .map((template, index) => {
      const title =
        template?.title ||
        `Agreement ${index + 1}`;

      const version =
        template?.version ||
        "v1";

      const serviceType =
        template?.service_type ||
        "home_inspection";

      return `AGREEMENT ${index + 1}: ${title}
Version: ${version}
Service Type: ${serviceType}

${mergeAgreementBody({
  templateBody: template?.body || "",
  state,
  clientName,
  propertyAddress,
  fee,
  inspectorName,
  inspectionDate,
})}`;
    })
    .join(
      "\n\n\n============================================================\n\n\n"
    );
}

export function buildAgreementBody({
  state,
  clientName,
  propertyAddress,
  fee,
  inspectorName,
  inspectionDate,
}: {
  state?: string | null;
  clientName?: string | null;
  propertyAddress?: string | null;
  fee?: string | number | null;
  inspectorName?: string | null;
  inspectionDate?: string | null;
}) {
  return mergeAgreementBody({
    templateBody:
      "Agreement template not loaded. Please select or create an agreement template in the Agreement Library.",
    state,
    clientName,
    propertyAddress,
    fee,
    inspectorName,
    inspectionDate,
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

  const selectedIds: string[] = Array.isArray(
    inspection.agreement_template_ids
  )
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
      .map((id) =>
        templates.find((template) => template.id === id)
      )
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

  if (data && data.length > 0) {
    return data;
  }

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
