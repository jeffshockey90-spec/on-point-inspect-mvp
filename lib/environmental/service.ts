// Shared environmental-service detection + report titling.
//
// Single source of truth for "is this a radon / mold job?" across the
// environmental report, environmental share, the report email, and analytics.
//
// It supersedes three earlier copy-pasted variants that disagreed:
//   - env-report / env-share: first-truthy of service_mode|inspection_type|services
//   - send-report-email:      same three (via a local getServiceType)
//   - analytics:              first-truthy of inspection_type|service_type|type|
//                             service_mode|services, plus dead radon_test/
//                             radon_testing boolean branches (those columns are
//                             related OBJECTS, never === true, so never fired)
//
// Those variants used first-truthy selection, so a job whose service_mode was
// "home" would shadow a "radon" inspection_type on some surfaces but not others
// (analytics counted it radon; the client's env report did not render it). We
// now search ALL service fields, which is a strict superset: it can only ADD a
// detection, never drop one a client already sees. The real boolean flags
// (`radon` / `mold`) are still honored.

function serviceText(inspection: any) {
  return [
    inspection?.service_mode,
    inspection?.inspection_type,
    inspection?.service_type,
    inspection?.type,
    inspection?.services,
  ]
    .map((value) => (value == null ? "" : String(value)))
    .join(" ")
    .toLowerCase();
}

export function hasRadonService(inspection: any) {
  return serviceText(inspection).includes("radon") || inspection?.radon === true;
}

export function hasMoldService(inspection: any) {
  return serviceText(inspection).includes("mold") || inspection?.mold === true;
}

export function getReportTitle(inspection: any) {
  const radon = hasRadonService(inspection);
  const mold = hasMoldService(inspection);

  if (radon && mold) return "Environmental Testing Report";
  if (radon) return "Radon Testing Report";
  if (mold) return "Mold Sampling Report";

  return "Environmental Testing Report";
}
