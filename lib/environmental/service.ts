// Shared environmental-service detection + report titling.
// Extracted verbatim from app/environmental-report/[id]/page.tsx and
// app/environmental-share/[id]/page.tsx, which carried byte-identical copies.
// NOTE: other surfaces (client-portal, client-share, email, analytics) use
// DIVERGENT radon/mold detection (getServiceType()-based). Those are a
// separate converge-decision and intentionally NOT routed through this module.

export function hasRadonService(inspection: any) {
  const raw = String(
    inspection?.service_mode ||
      inspection?.inspection_type ||
      inspection?.services ||
      ""
  ).toLowerCase();

  return raw.includes("radon") || inspection?.radon === true;
}

export function hasMoldService(inspection: any) {
  const raw = String(
    inspection?.service_mode ||
      inspection?.inspection_type ||
      inspection?.services ||
      ""
  ).toLowerCase();

  return raw.includes("mold") || inspection?.mold === true;
}

export function getReportTitle(inspection: any) {
  const radon = hasRadonService(inspection);
  const mold = hasMoldService(inspection);

  if (radon && mold) return "Environmental Testing Report";
  if (radon) return "Radon Testing Report";
  if (mold) return "Mold Sampling Report";

  return "Environmental Testing Report";
}
