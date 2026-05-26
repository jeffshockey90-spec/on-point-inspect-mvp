export type AgreementState = "MD" | "WV" | "PA";

export function normalizeAgreementState(
  state?: string | null
): AgreementState {
  const clean = String(state || "MD")
    .trim()
    .toUpperCase();

  if (
    clean === "WV" ||
    clean === "WEST VIRGINIA"
  )
    return "WV";

  if (
    clean === "PA" ||
    clean === "PENNSYLVANIA"
  )
    return "PA";

  return "MD";
}

export function getAgreementVersion(
  state?: string | null
) {
  const normalized =
    normalizeAgreementState(state);

  if (normalized === "MD")
    return "MD SOP Contract - V6";

  if (normalized === "WV")
    return "WV SOP Contract - V5";

  return "PA InterNACHI Contract - V5";
}

export function getAgreementTitle(
  state?: string | null
) {
  const normalized =
    normalizeAgreementState(state);

  return `${normalized} Residential Inspection Agreement`;
}

export function buildAgreementBody({
  state,
  clientName,
  propertyAddress,
  fee,
  inspectorName,
}: {
  state?: string | null;
  clientName?: string | null;
  propertyAddress?: string | null;
  fee?: string | number | null;
  inspectorName?: string | null;
}) {
  const normalized =
    normalizeAgreementState(state);

  const displayClient =
    clientName || "Client";

  const displayProperty =
    propertyAddress ||
    "Inspection Property";

  const displayFee = fee
    ? `$${fee}`
    : "Inspection fee as agreed";

  const displayInspector =
    inspectorName ||
    "On Point Home Inspections";

  return `
RESIDENTIAL INSPECTION AGREEMENT

Client: ${displayClient}
Inspector: ${displayInspector}
Property: ${displayProperty}
Fee: ${displayFee}

A home inspection is a non-invasive visual inspection of the readily accessible areas of a residential property.

The inspection is limited to visual observations of systems and components accessible at the time of inspection.

The inspection and report are not technically exhaustive and do not imply future performance of the home or its systems.

The inspection is performed in accordance with applicable standards of practice for the inspection state.

The client understands that latent defects may exist and may not be discovered during the inspection.

The inspection report is intended solely for the client listed above.

The maximum liability of the inspector shall not exceed two times the inspection fee paid.

Any dispute arising from this agreement shall be resolved through binding arbitration or small claims court where applicable.

The client agrees they have read and understood this agreement before signing electronically.
`;
}