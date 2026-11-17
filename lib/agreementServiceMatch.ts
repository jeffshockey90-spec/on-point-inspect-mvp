// Which agreement(s) go with which services. Shared by the New Inspection
// picker (client) and the server fallback used when a job has no agreement
// chosen (e.g. a confirmed online booking), so both attach ONE agreement per
// service on the job — Home, Radon, Mold, a custom main service like
// "Pre-Listing Inspection" / "Mechanical & Structural", and add-ons.
// Pure: no server imports.

export function serviceKey(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const BUILT_IN = new Set(["home", "radon", "mold"]);
const ORIENTATION = "orientation";
const NOT_A_SERVICE = new Set(["home", "home_inspection", "radon", "radon_test", "mold", "mold_testing", "travel", "travel_fee", "discount", "total"]);

/** Does an agreement template belong to a service category? */
export function templateMatchesService(template: { service_type?: string | null; template_type?: string | null }, category: string): boolean {
  const type = serviceKey(template.service_type || template.template_type || "home_inspection");
  const cat = serviceKey(category);
  if (!cat) return false;
  if (cat === "home") return type.includes("home") && !type.includes(ORIENTATION);
  if (cat === "radon" || cat === "mold") return type.includes(cat);
  // Custom service: exact key, or one name containing the other
  // ("pre_listing" <-> "pre_listing_inspection").
  return type === cat || (type.length >= 4 && cat.includes(type)) || (cat.length >= 4 && type.includes(cat));
}

/** Service categories on an inspection row (for the server fallback). */
export function agreementCategoriesForInspection(inspection: Record<string, any>): string[] {
  const mode = serviceKey(inspection?.service_mode || inspection?.service_type || inspection?.inspection_type || "");
  const out: string[] = [];
  const add = (c: string) => {
    if (c && !out.includes(c)) out.push(c);
  };

  if (inspection?.is_orientation === true || mode === "home_orientation" || mode === ORIENTATION) {
    add(ORIENTATION);
  } else {
    const isEnvOnly = /^(radon|mold)(_(radon|mold|only|test|testing|inspection))*$/.test(mode);
    const builtInWords = /home|buyer|full|radon|mold/.test(mode);
    if (!mode || mode.includes("home") || mode.includes("buyer") || mode.includes("full")) add("home");
    if (mode && !builtInWords && !isEnvOnly) add(mode); // custom main service, e.g. pre_listing_inspection
  }
  if (inspection?.radon === true || mode.includes("radon")) add("radon");
  if (inspection?.mold === true || mode.includes("mold")) add("mold");

  // Add-on services priced on the job (service_fees keys).
  const fees = inspection?.service_fees;
  if (fees && typeof fees === "object") {
    for (const key of Object.keys(fees)) {
      const k = serviceKey(key);
      if (k && !NOT_A_SERVICE.has(k) && !BUILT_IN.has(k) && Number((fees as any)[key]) > 0) add(k);
    }
  }
  return out;
}

/**
 * One agreement per category: prefer the property's state over General, and
 * the default over others. Returns template ids in category order.
 */
export function pickAgreementTemplates<T extends { id?: any; state?: string | null; is_default?: boolean | null; service_type?: string | null; template_type?: string | null }>(
  templates: T[],
  categories: string[],
  state?: string | null,
): T[] {
  const st = String(state || "").toUpperCase();
  const rank = (t: T) =>
    (String(t.state || "").toUpperCase() === st && st ? 0 : 2) + (t.is_default ? 0 : 1);
  const picks: T[] = [];
  for (const category of categories) {
    const matching = templates
      .filter((t) => {
        // Never another state's agreement: this state's, or General / any-state.
        const ts = String(t.state || "").toUpperCase();
        return !ts || ts === "GENERAL" || !st || ts === st;
      })
      .filter((t) => templateMatchesService(t, category))
      .sort((a, b) => rank(a) - rank(b));
    const pick = matching[0];
    if (pick && !picks.includes(pick)) picks.push(pick);
  }
  return picks;
}
