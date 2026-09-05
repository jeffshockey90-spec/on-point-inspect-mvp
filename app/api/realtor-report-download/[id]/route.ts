
import { formatAppValue } from "../../../../lib/app-time";
import { resolveReportSections } from "../../../../lib/reportSections";
import { matchStandards } from "../../../../lib/ai/standardsReference";
import { estimatePrognosis, deriveAgeYears } from "../../../../lib/ai/serviceLife";
import { getReportDeliveryState } from "../../../../lib/reportDelivery";
import { authorizeInspection } from "../../../../lib/apiAuth";
import { loadSeverityConfigForInspection } from "../../../../lib/severity/loadSeverityConfig";
import { resolveSeverity } from "../../../../lib/severity/severityConfig";
import { getReportTranslations, makeTranslator, isSupportedLanguage } from "../../../../lib/translate";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { randomUUID, createHash } from "crypto";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { existsSync } from "fs";
import { recompressPdfImages } from "../../../../lib/pdfRecompress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bump this whenever the PDF HTML/layout template changes. It's mixed into the
// PDF cache signature, so a change here invalidates every cached PDF and forces
// a rebuild with the new template. Without it, a template change would only show
// on reports whose content also changed (the "changes only on one report" trap).
const PDF_TEMPLATE_VERSION = "2026-08-24-keyfinding-links-sop-cleanup-qrfix-qrlogo";
// Vercel kills the function at this many seconds (Pro plan ceiling; Hobby caps
// at 60). Photo-heavy reports were exceeding 60s and getting killed mid-render.
// RENDER_BUDGET_MS below follows this automatically.
export const maxDuration = 300;

// Every internal timeout must fit INSIDE the function budget, with headroom to
// serialize a response. Previously setContent was given 90s inside a 60s
// function, so it could never fire: the platform killed the request first and
// the caller got an opaque 504 instead of a usable error.
const RENDER_BUDGET_MS = maxDuration * 1000 - 10_000;

type RouteProps = {
  params: Promise<{
    id: string;
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
  "Disclaimers",
  "Garage",
];

const STANDARDS_OF_PRACTICE = [
  {
    "title": "Exterior",
    "body": "I. The inspector shall: A. inspect: 1. wall coverings, flashing, and trim. 2. exterior doors. 3. attached and adjacent decks, balconies, stoops, steps, porches, and their associated railings. 4. eaves, soffits, and fascias where accessible from the ground level. 5. vegetation, grading, surface drainage, and retaining walls that are likely to adversely affect the building. 6. adjacent and entryway walkways, patios, and driveways. B. describe wall coverings.\n\nII. The inspector is NOT required to inspect: A. screening, shutters, awnings, and similar seasonal accessories. B. fences, boundary walls, and similar structures. C. geological and soil conditions. D. recreational facilities. E. outbuildings other than garages and carports. F. seawalls, break-walls, and docks. G. erosion control and earth stabilization measures."
  },
  {
    "title": "Roof",
    "body": "I. The inspector shall inspect from ground level or the eaves: A. the roof-covering materials; B. the gutters; C. the downspouts; D. the vents, flashing, skylights, chimney, and other roof penetrations; and E. the general structure of the roof from the readily accessible panels, doors or stairs.\n\nII. The inspector shall describe: A. the type of roof-covering materials.\n\nIII. The inspector shall report as in need of correction: A. observed indications of active roof leaks.\n\nIV. The inspector is not required to: A. walk on any roof surface. B. predict the service life expectancy. C. inspect underground downspout diverter drainage pipes. D. remove snow, ice, debris or other conditions that prohibit the observation of the roof surfaces. E. move insulation. F. inspect antennae, satellite dishes, lightning arresters, de-icing equipment, or similar attachments. G. walk on any roof areas that appear, in the inspectors opinion, to be unsafe. H. walk on any roof areas if doing so might, in the inspector's opinion, cause damage. I. perform a water test. J. warrant or certify the roof. K. confirm proper fastening or installation of any roof-covering material."
  },
  {
    "title": "Basement, Foundation, Crawlspace & Structure",
    "body": "I. The inspector shall inspect: A. the foundation; B. the basement; C. the crawlspace; and D. structural components.\n\nII. The inspector shall describe: A. the type of foundation; and B. the location of the access to the under-floor space.\n\nIII. The inspector shall report as in need of correction: A. observed indications of wood in contact with or near soil; B. observed indications of active water penetration; C. observed indications of possible foundation movement, such as sheetrock cracks, brick cracks, out-of-square door frames, and unlevel floors; and D. any observed cutting, notching and boring of framing members that may, in the inspector's opinion, present a structural or safety concern.\n\nIV. The inspector is not required to: A. enter any crawlspace that is not readily accessible, or where entry could cause damage or pose a hazard to him/herself. B. move stored items or debris. C. operate sump pumps with inaccessible floats. D. identify the size, spacing, span or location or determine the adequacy of foundation bolting, bracing, joists, joist spans or support systems. E. provide any engineering or architectural service. F. report on the adequacy of any structural system or component."
  },
  {
    "title": "Heating",
    "body": "I. The inspector shall inspect: A. the heating system, using normal operating controls.\n\nII. The inspector shall describe: A. the location of the thermostat for the heating system; B. the energy source; and C. the heating method.\n\nIII. The inspector shall report as in need of correction: A. any heating system that did not operate; and B. if the heating system was deemed inaccessible.\n\nIV. The inspector is not required to: A. inspect or evaluate the interior of flues or chimneys, fire chambers, heat exchangers, combustion air systems, fresh-air intakes, humidifiers, dehumidifiers, electronic air filters, geothermal systems, or solar heating systems. B. inspect fuel tanks or underground or concealed fuel supply systems. C. determine the uniformity, temperature, flow, balance, distribution, size, capacity, BTU, or supply adequacy of the heating system. D. light or ignite pilot flames. E. activate heating, heat pump systems, or other heating systems when ambient temperatures or other circumstances are not conducive to safe operation or may damage the equipment. F. override electronic thermostats. G. evaluate fuel quality. H. verify thermostat calibration, heat anticipation, or automatic setbacks, timers, programs or clocks."
  },
  {
    "title": "Cooling",
    "body": "I. The inspector shall inspect: A. the cooling system, using normal operating controls.\n\nII. The inspector shall describe: A. the location of the thermostat for the cooling system; and B. the cooling method.\n\nIII. The inspector shall report as in need of correction: A. any cooling system that did not operate; and B. if the cooling system was deemed inaccessible.\n\nIV. The inspector is not required to: A. determine the uniformity, temperature, flow, balance, distribution, size, capacity, BTU, or supply adequacy of the cooling system. B. inspect portable window units, through-wall units, or electronic air filters. C. operate equipment or systems if the exterior temperature is below 65 Fahrenheit, or when other circumstances are not conducive to safe operation or may damage the equipment. D. inspect or determine thermostat calibration, cooling anticipation, or automatic setbacks or clocks. E. examine electrical current, coolant fluids or gases, or coolant leakage."
  },
  {
    "title": "Plumbing",
    "body": "I. The inspector shall inspect: A. the main water supply shut-off valve; B. the main fuel supply shut-off valve; C. the water heating equipment, including the energy source, venting connections, temperature/pressure-relief (TPR) valves, Watts 210 valves, and seismic bracing; D. interior water supply, including all fixtures and faucets, by running the water; E. all toilets for proper operation by flushing; F. all sinks, tubs and showers for functional drainage; G. the drain, waste and vent system; and H. drainage sump pumps with accessible floats.\n\nII. The inspector shall describe: A. whether the water supply is public or private based upon observed evidence; B. the location of the main water supply shut-off valve; C. the location of the main fuel supply shut-off valve; D. the location of any observed fuel-storage system; and E. the capacity of the water heating equipment, if labeled.\n\nIII. The inspector shall report as in need of correction: A. deficiencies in the water supply by viewing the functional flow in two fixtures operated simultaneously; B. deficiencies in the installation of hot and cold water faucets; C. mechanical drain stops that were missing or did not operate if installed in sinks, lavatories and tubs; and D. toilets that were damaged, had loose connections to the floor, were leaking, or had tank components that did not operate.\n\nIV. The inspector is not required to: A. light or ignite pilot flames. B. measure the capacity, temperature, age, life expectancy or adequacy of the water heater. C. inspect the interior of flues or chimneys, combustion air systems, water softener or filtering systems, well pumps or tanks, safety or shut-off valves, floor drains, lawn sprinkler systems, or fire sprinkler systems. D. determine the exact flow rate, volume, pressure, temperature or adequacy of the water supply. E. determine the water quality, potability or reliability of the water supply or source. F. open sealed plumbing access panels. G. inspect clothes washing machines or their connections. H. operate any valve. I. test shower pans, tub and shower surrounds or enclosures for leakage or functional overflow protection. J. evaluate the compliance with conservation, energy or building standards, or the proper design or sizing of any water, waste or venting components, fixtures or piping. K. determine the effectiveness of anti-siphon, backflow prevention or drain-stop devices. L. determine whether there are sufficient cleanouts for effective cleaning of drains. M. evaluate fuel storage tanks or supply systems. N. inspect wastewater treatment systems. O. inspect water treatment systems or water filters. P. inspect water storage tanks, pressure pumps, or bladder tanks. Q. evaluate wait time to obtain hot water at fixtures, or perform testing of any kind to water heater elements. R. evaluate or determine the adequacy of combustion air. S. test, operate, open or close: safety controls, manual stop valves, temperature/pressure-relief valves, control valves, or check valves. T. examine ancillary or auxiliary systems or components, such as, but not limited to, those related to solar water heating and hot water circulation. U. determine the existence or condition of polybutylene plumbing. V. inspect or test for gas or fuel leaks, or indications thereof."
  },
  {
    "title": "Electrical",
    "body": "I. The inspector shall inspect: A. the service drop; B. the overhead service conductors and attachment point; C. the service head, gooseneck and drip loops; D. the service mast, service conduit and raceway; E. the electric meter and base; F. service-entrance conductors; G. the main service disconnect; H. panelboards and over-current protection devices (circuit breakers and fuses); I. service grounding and bonding; J. a representative number of switches, lighting fixtures and receptacles, including receptacles observed and deemed to be arc-fault circuit interrupter (AFCI)-protected using the AFCI test button, where possible; K. all ground-fault circuit interrupter receptacles and circuit breakers observed and deemed to be GFCIs using a GFCI tester, where possible; and L. smoke and carbon-monoxide detectors.\n\nII. The inspector shall describe: A. the main service disconnect's amperage rating, if labeled; and B. the type of wiring observed.\n\nIII. The inspector shall report as in need of correction: A. deficiencies in the integrity of the service entrance conductors insulation, drip loop, and vertical clearances from grade and roofs; B. any unused circuit-breaker panel opening that was not filled; C. the presence of solid conductor aluminum branch-circuit wiring, if readily visible; D. any tested receptacle in which power was not present, polarity was incorrect, the cover was not in place, the GFCI devices were not properly installed or did not operate properly, evidence of arcing or excessive heat, and where the receptacle was not grounded or was not secured to the wall; and E. the absence of smoke detectors.\n\nIV. The inspector is not required to: A. insert any tool, probe or device into the main panelboard, sub-panels, distribution panelboards, or electrical fixtures. B. operate electrical systems that are shut down. C. remove panelboard cabinet covers or dead fronts. D. operate or re-set over-current protection devices or overload devices. E. operate or test smoke or carbon-monoxide detectors or alarms F. inspect, operate or test any security, fire or alarms systems or components, or other warning or signaling systems. G. measure or determine the amperage or voltage of the main service equipment, if not visibly labeled. H. inspect ancillary wiring or remote-control devices. I. activate any electrical systems or branch circuits that are not energized. J. inspect low-voltage systems, electrical de-icing tapes, swimming pool wiring, or any timecontrolled devices. K. verify the service ground. L. inspect private or emergency electrical supply sources, including, but not limited to: generators, windmills, photovoltaic solar collectors, or battery or electrical storage facility. M. inspect spark or lightning arrestors. N. inspect or test de-icing equipment. O. conduct voltage-drop calculations. P. determine the accuracy of labeling. Q. inspect exterior lighting."
  },
  {
    "title": "Attic, Insulation & Ventilation",
    "body": "I. The inspector shall inspect: A. insulation in unfinished spaces, including attics, crawlspaces and foundation areas; B. ventilation of unfinished spaces, including attics, crawlspaces and foundation areas; and C. mechanical exhaust systems in the kitchen, bathrooms and laundry area.\n\nII. The inspector shall describe: A. the type of insulation observed; and B. the approximate average depth of insulation observed at the unfinished attic floor area or roof structure.\n\nIII. The inspector shall report as in need of correction: A. the general absence of insulation or ventilation in unfinished spaces.\n\nIV. The inspector is not required to: A. enter the attic or any unfinished spaces that are not readily accessible, or where entry could cause damage or, in the inspector's opinion, pose a safety hazard. B. move, touch or disturb insulation. C. move, touch or disturb vapor retarders. D. break or otherwise damage the surface finish or weather seal on or around access panels or covers. E. identify the composition or R-value of insulation material. F. activate thermostatically operated fans. G. determine the types of materials used in insulation or wrapping of pipes, ducts, jackets, boilers or wiring. H. determine the adequacy of ventilation."
  },
  {
    "title": "Doors, Windows & Interior",
    "body": "I. The inspector shall inspect: A. a representative number of doors and windows by opening and closing them; B. floors, walls and ceilings; C. stairs, steps, landings, stairways and ramps; D. railings, guards and handrails; and E. garage vehicle doors and the operation of garage vehicle door openers, using normal operating controls.\n\nII. The inspector shall describe: A. a garage vehicle door as manually-operated or installed with a garage door opener.\n\nIII. The inspector shall report as in need of correction: A. improper spacing between intermediate balusters, spindles and rails for steps, stairways, guards and railings; B. photo-electric safety sensors that did not operate properly; and C. any window that was obviously fogged or displayed other evidence of broken seals.\n\nIV. The inspector is not required to: A. inspect paint, wallpaper, window treatments or finish treatments. B. inspect floor coverings or carpeting. C. inspect central vacuum systems. D. inspect for safety glazing. E. inspect security systems or components. F. evaluate the fastening of islands, countertops, cabinets, sink tops or fixtures. G. move furniture, stored items, or any coverings, such as carpets or rugs, in order to inspect the concealed floor structure. H. move suspendedceiling tiles. I. inspect or move any household appliances. J. inspect or operate equipment housed in the garage, except as otherwise noted. K. verify or certify the proper operation of any pressure-activated auto-reverse or related safety feature of a garage door. L. operate or evaluate any security bar release and opening mechanisms, whether interior or exterior, including their compliance with local, state or federal standards. M. operate any system, appliance or component that requires the use of special keys, codes, combinations or devices. N. operate or evaluate self-cleaning oven cycles, tilt guards/latches, or signal lights. O. inspect microwave ovens or test leakage from microwave ovens. P. operate or examine any sauna, steamgenerating equipment, kiln, toaster, ice maker, coffee maker, can opener, bread warmer, blender, instant hot-water dispenser, or other small, ancillary appliances or devices. Q. inspect elevators. R. inspect remote controls. S. inspect appliances. T. inspect items not permanently installed. U. discover firewall compromises. V. inspect pools, spas or fountains. W. determine the adequacy of whirlpool or spa jets, water force, or bubble effects. X. determine the structural integrity or leakage of pools or spas."
  }
] as const;

// A pasted standards-of-practice blob is typically one long run-on: a section
// name on its own line (Exterior, Roof, ...) followed by "I./II./III." clauses,
// with soft line-wraps mid-sentence and no blank lines. Parse it back into
// { title, body } sections (clauses separated by blank lines) so it renders as
// clean, readable blocks instead of a wall of text. Returns [] if it doesn't
// look like that structure, so the caller can fall back to the raw blob.
function parseCustomStandards(rawBody: string): Array<{ title: string; body: string }> {
  const lines = String(rawBody).replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  // Matches a top-level clause marker like "I. ", "IV. ", "VIII. " at line start.
  const clause = /^(?:X|IX|VIII|VII|VI|V|IV|III|II|I)\.\s/;
  const sections: Array<{ title: string; paragraphs: string[] }> = [];
  let current: { title: string; paragraphs: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    // Drop the redundant document title and the generic group label.
    if (line.toUpperCase() === "STANDARDS OF PRACTICE" || line === "Inspection Details") continue;

    if (clause.test(line)) {
      if (!current) {
        current = { title: "", paragraphs: [] };
        sections.push(current);
      }
      current.paragraphs.push(line);
      continue;
    }

    // A section header is a non-clause line immediately followed by an "I." clause.
    let j = i + 1;
    while (j < lines.length && !lines[j]) j++;
    const nextIsFirstClause = j < lines.length && /^I\.\s/.test(lines[j]);

    if (nextIsFirstClause) {
      current = { title: line, paragraphs: [] };
      sections.push(current);
    } else if (current && current.paragraphs.length) {
      // Soft-wrapped continuation of the current clause — rejoin it.
      current.paragraphs[current.paragraphs.length - 1] += " " + line;
    } else if (current) {
      current.paragraphs.push(line);
    }
  }

  return sections
    .map((s) => ({ title: s.title, body: s.paragraphs.join("\n\n") }))
    .filter((s) => s.title || s.body);
}

function getCompanyStandards(company: any) {
  const customBody = String(company?.standards_of_practice_body || "").trim();
  const customTitle = String(
    company?.standards_of_practice_title || "Standards of Practice"
  ).trim();

  if (customBody) {
    const parsed = parseCustomStandards(customBody);
    // Only use the parsed version when it actually split into multiple sections;
    // otherwise keep the raw blob so we never mangle an unexpected format.
    if (parsed.length > 1) return parsed;
    return [
      {
        title: customTitle || "Standards of Practice",
        body: customBody,
      },
    ];
  }

  return [...STANDARDS_OF_PRACTICE];
}

function shouldIncludeStandardsInPdf(company: any) {
  return company?.standards_include_in_pdf !== false;
}


async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function cleanText(value: any) {
  return String(value || "").trim();
}

function cleanEmail(value: any) {
  return cleanText(value).toLowerCase();
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

function getSectionNumber(section: any, sectionOrder: string[] = SECTION_ORDER) {
  const clean = normalizeSection(section);
  const index = sectionOrder.findIndex((item) => item === clean);
  return index >= 0 ? index + 1 : sectionOrder.length + 1;
}

// Matches the identical numbering scheme used by the report builder
// (app/reports/[id]/page.tsx), the client-facing share page
// (app/share/[id]/page.tsx), and the print page - this PDF used its own
// simpler `${sectionNumber}.${index + 1}` scheme, which disagreed with the
// item numbers shown everywhere else in the app.
function getRepairItemGroupLabel(finding: any) {
  return String(
    finding?.component ||
      finding?.subsection ||
      finding?.category ||
      finding?.system ||
      finding?.group_title ||
      finding?.item_group ||
      "General"
  ).trim() || "General";
}

function addRepairItemNumbers(findings: any[], sectionOrder: string[] = SECTION_ORDER) {
  const sectionGroupMap = new Map<string, number>();
  const sectionGroupCounts = new Map<string, number>();

  return (findings || []).map((finding: any) => {
    const section = normalizeSection(finding?.section);
    const sectionNumber = getSectionNumber(section, sectionOrder);
    const groupLabel = getRepairItemGroupLabel(finding).toLowerCase();
    const sectionGroupKey = `${sectionNumber}:${groupLabel}`;

    if (!sectionGroupMap.has(sectionGroupKey)) {
      const existingGroupsForSection = Array.from(sectionGroupMap.keys()).filter((key) =>
        key.startsWith(`${sectionNumber}:`)
      ).length;

      sectionGroupMap.set(sectionGroupKey, existingGroupsForSection + 1);
    }

    const groupNumber = sectionGroupMap.get(sectionGroupKey) || 1;
    const countKey = `${sectionNumber}.${groupNumber}`;
    const nextCount = (sectionGroupCounts.get(countKey) || 0) + 1;
    sectionGroupCounts.set(countKey, nextCount);

    const repairItemNumber =
      finding?.repair_item_number ||
      finding?.item_number ||
      finding?.finding_number ||
      `${sectionNumber}.${groupNumber}.${nextCount}`;

    return {
      ...finding,
      section,
      report_item_number: repairItemNumber,
    };
  });
}

function getFindingTitle(finding: any) {
  return (
    finding?.title ||
    finding?.finding_title ||
    finding?.defect_title ||
    finding?.name ||
    "Untitled Finding"
  );
}

function isReportDefect(finding: any) {
  const section = cleanText(finding?.section).toLowerCase();
  const title = cleanText(getFindingTitle(finding)).toLowerCase();

  if (section === "inspection details") return false;
  if (section === "disclaimers") return false;
  if (
    [
      "in attendance",
      "occupancy",
      "style",
      "temperature",
      "type of building",
      "weather conditions",
    ].includes(title)
  ) {
    return false;
  }

  if (title.includes("section reference photo")) return false;
  if (title.includes("reference photo")) return false;

  return true;
}

function getFindingText(finding: any) {
  return (
    finding?.recommendation ||
    finding?.observation ||
    finding?.implication ||
    finding?.comment ||
    finding?.description ||
    "Documented inspection item."
  );
}

function getSeverityBucket(severityValue: any) {
  const severity = cleanText(severityValue || "Recommended Repair").toLowerCase();

  if (severity.includes("safety") || severity.includes("hazard") || severity.includes("major")) {
    return "Safety / Major";
  }

  if (severity.includes("maintenance") || severity.includes("monitor") || severity.includes("minor")) {
    return "Maintenance / Monitor";
  }

  if (severity.includes("information") || severity.includes("info") || severity.includes("client")) {
    return "Informational";
  }

  return "Recommended Repair";
}

function getPropertyAddress(inspection: any) {
  return (
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Inspection property"
  );
}

function getPropertyPhoto(inspection: any) {
  return (
    inspection?.property_image ||
    inspection?.street_view_url ||
    inspection?.cover_photo_url ||
    inspection?.google_photo_url ||
    inspection?.property_photo_url ||
    inspection?.place_photo_url ||
    inspection?.photo_url ||
    inspection?.image_url ||
    ""
  );
}

function getPropertyPhotoPath(inspection: any) {
  return (
    inspection?.property_photo_path ||
    inspection?.property_photo_storage_path ||
    inspection?.cover_photo_path ||
    inspection?.property_image_path ||
    inspection?.storage_path ||
    getStoragePathFromUrl(getPropertyPhoto(inspection)) ||
    ""
  );
}

function formatDate(value: any) {
  if (!value) return "N/A";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12)));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanText(value) || "N/A";
  return formatAppValue(date, { month: "long", day: "numeric", year: "numeric" });
}

function getInspectionShareToken(inspection: any) {
  return cleanText(
    inspection?.public_share_token ||
      inspection?.share_token ||
      inspection?.report_share_token
  );
}

function onlineReportUrlForInspection(inspection: any) {
  const appUrl = cleanText(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL);
  const token = getInspectionShareToken(inspection);
  if (!appUrl || !token) return "";
  // The public, no-login report lives at /share/<token> (resolved by
  // public_share_token with a service-role client). The old /public-report/
  // path had no route and dumped scanners on the login screen; a redirect route
  // still catches any already-printed QR codes pointing there.
  return `${appUrl.replace(/\/$/, "")}/share/${encodeURIComponent(token)}`;
}

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";
  const cleanUrl = String(url).split("?")[0].split("#")[0];
  const markers = [
    "/inspection-photos/",
    "/object/public/inspection-photos/",
    "/object/sign/inspection-photos/",
    "/object/authenticated/inspection-photos/",
  ];

  for (const marker of markers) {
    const index = cleanUrl.indexOf(marker);
    if (index !== -1) return decodeURIComponent(cleanUrl.substring(index + marker.length));
  }

  return "";
}

function getPhotoStoragePath(photo: any, preferThumbnail = true) {
  const thumbnailPath =
    photo?.thumbnail_path ||
    getStoragePathFromUrl(photo?.thumbnail_url) ||
    getStoragePathFromUrl(photo?.signed_thumbnail_url);

  const fullPath =
    photo?.file_path ||
    photo?.storage_path ||
    photo?.photo_path ||
    photo?.image_path ||
    getStoragePathFromUrl(photo?.signed_url) ||
    getStoragePathFromUrl(photo?.public_url) ||
    getStoragePathFromUrl(photo?.image_url) ||
    getStoragePathFromUrl(photo?.photo_url) ||
    getStoragePathFromUrl(photo?.url) ||
    "";

  return preferThumbnail ? thumbnailPath || fullPath : fullPath || thumbnailPath || "";
}

function getPhotoFallbackUrl(photo: any, preferThumbnail = true) {
  const thumbnailUrl =
    photo?.signed_thumbnail_url ||
    photo?.thumbnail_url ||
    "";

  const fullUrl =
    photo?.signed_url ||
    photo?.public_url ||
    photo?.image_url ||
    photo?.photo_url ||
    photo?.url ||
    "";

  return preferThumbnail ? thumbnailUrl || fullUrl : fullUrl || thumbnailUrl || "";
}

function getLegacyFindingPhotoCandidates(finding: any) {
  return [
    finding?.signed_thumbnail_url,
    finding?.thumbnail_url,
    finding?.signed_image_url,
    finding?.public_image_url,
    finding?.image_url,
    finding?.photo_url,
    finding?.url,
  ].filter(Boolean);
}

function roleLooksLikeRealtor(roleValue: any) {
  const role = cleanText(roleValue).toLowerCase();
  return (
    role.includes("realtor") ||
    role.includes("agent") ||
    role.includes("buyer") ||
    role.includes("transaction") ||
    role.includes("coordinator")
  );
}

function inspectionHasRealtorEmail(inspection: any, userEmail: string) {
  const fields = [
    inspection?.realtor_email,
    inspection?.agent_email,
    inspection?.buyer_agent_email,
    inspection?.buyers_agent_email,
    inspection?.transaction_coordinator_email,
  ];

  return fields.some((field) => cleanEmail(field) === userEmail);
}

function inspectionBelongsToUser(inspection: any, user: any) {
  const userId = cleanText(user?.id);
  const userEmail = cleanEmail(user?.email);

  const ownerIds = [
    inspection?.inspector_id,
    inspection?.inspector_user_id,
    inspection?.user_id,
    inspection?.owner_id,
    inspection?.created_by,
    inspection?.auth_user_id,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean);

  if (userId && ownerIds.includes(userId)) return true;

  const ownerEmails = [
    inspection?.inspector_email,
    inspection?.owner_email,
    inspection?.created_by_email,
    inspection?.company_email,
  ]
    .map((value) => cleanEmail(value))
    .filter(Boolean);

  return Boolean(userEmail && ownerEmails.includes(userEmail));
}

async function signedUrlMap(admin: any, paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const result: Record<string, string> = {};

  if (!uniquePaths.length) return result;

  const chunkSize = 80;
  const chunks = Array.from(
    { length: Math.ceil(uniquePaths.length / chunkSize) },
    (_, index) => uniquePaths.slice(index * chunkSize, index * chunkSize + chunkSize)
  );

  await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await admin.storage
        .from("inspection-photos")
        .createSignedUrls(chunk, 60 * 60 * 24 * 7);

      if (error) {
        console.error("Realtor report download signed URL error:", error);
        return;
      }

      (data || []).forEach((item: any, itemIndex: number) => {
        const path = item?.path || chunk[itemIndex];
        if (path && item?.signedUrl) result[path] = item.signedUrl;
      });
    })
  );

  return result;
}

function isVideoPhoto(photo: any, value?: string) {
  const path = cleanText(
    value ||
      photo?.file_path ||
      photo?.storage_path ||
      photo?.photo_path ||
      photo?.image_path ||
      photo?.public_url ||
      photo?.image_url ||
      photo?.photo_url ||
      photo?.url
  ).toLowerCase();

  const type = cleanText(
    photo?.mime_type ||
      photo?.media_type ||
      photo?.content_type ||
      photo?.file_type
  ).toLowerCase();

  return (
    Boolean(photo?.is_video) ||
    Boolean(photo?.video_url) ||
    type.startsWith("video/") ||
    type.includes("quicktime") ||
    /\.(mp4|mov|m4v|webm|avi|quicktime)(\?|#|$)/i.test(path)
  );
}

// Returns path -> compressed JPEG DATA URI for each image. This is the key to a
// small PDF: Chrome's printToPDF re-encodes URL-loaded images ~50x larger than
// their source (a 64KB photo becomes ~2.7MB embedded). Embedding a pre-shrunk
// JPEG as a data URI instead makes Chrome keep it ~as-is (~50KB), which takes a
// photo-heavy report from ~40MB down to a few MB. Falls back to a plain signed
// URL if the fetch/compress fails, so a photo is never dropped.
async function signedPdfImageUrlMap(admin: any, paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const result: Record<string, string> = {};

  if (!uniquePaths.length) return result;

  const concurrency = Math.min(12, uniquePaths.length);
  let cursor = 0;

  async function worker() {
    while (cursor < uniquePaths.length) {
      const path = uniquePaths[cursor];
      cursor += 1;

      try {
        const { data } = await admin.storage
          .from("inspection-photos")
          .createSignedUrl(path, 60 * 60, {
            // Feed sharp a generous, high-quality source so the final downscale
            // stays crisp. The old 900px/q78 pre-shrink capped detail before
            // sharp even ran, which is why PDF photos looked soft.
            transform: { width: 1600, quality: 85, resize: "contain" },
          });
        const signed = data?.signedUrl;
        if (!signed) continue;

        const resp = await fetch(signed);
        if (!resp.ok) continue;
        const input = Buffer.from(await resp.arrayBuffer());
        // 1200px @ q78. Because the report CSS now draws photos WITHOUT a clip
        // (no border-radius / object-fit), Chrome's printToPDF passes these JPEGs
        // straight through as DCTDecode instead of re-rasterizing them into
        // lossless FlateDecode bitmaps — so the PDF stays small (Spectora-style)
        // AND crisp. The old pipeline (660px @ q58, then clipped in CSS) was both
        // blurry AND huge because every photo got baked to a raw bitmap.
        const out = await sharp(input)
          .rotate()
          .resize(1200, null, { withoutEnlargement: true })
          .jpeg({ quality: 78, mozjpeg: true })
          .toBuffer();
        result[path] = `data:image/jpeg;base64,${out.toString("base64")}`;
      } catch (imageError) {
        console.error("PDF image compress failed, falling back to URL:", { path });
        try {
          const { data } = await admin.storage
            .from("inspection-photos")
            .createSignedUrl(path, 60 * 60 * 24 * 7, {
              transform: { width: 1200, quality: 78, resize: "contain" },
            });
          if (data?.signedUrl) result[path] = data.signedUrl;
        } catch {
          /* leave unset — the caller has further fallbacks */
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return result;
}

// Fetch a public image URL (e.g. a realtor's headshot from company-assets) and
// return a small compressed JPEG data URI — same reason as signedPdfImageUrlMap:
// a plain URL would be re-encoded ~50x larger by Chrome's printToPDF.
async function imageUrlToDataUri(url: string, maxWidth = 360): Promise<string> {
  try {
    if (!url) return "";
    const resp = await fetch(url);
    if (!resp.ok) return "";
    const buf = Buffer.from(await resp.arrayBuffer());
    const out = await sharp(buf)
      .rotate()
      .resize(maxWidth, maxWidth, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return "";
  }
}

function dedupeDownloadPhotos(photos: any[]) {
  const seen = new Set<string>();
  const cleanPhotos: any[] = [];

  for (const photo of photos || []) {
    const url = cleanText(photo?.download_url || photo?.signed_url || photo?.public_url || photo?.image_url || photo?.photo_url || photo?.url || "");
    const path = cleanText(photo?.thumbnail_path || photo?.file_path || photo?.storage_path || photo?.photo_path || photo?.image_path || "");
    const key = path || url.split("?")[0];

    if (!key || seen.has(key)) continue;

    seen.add(key);
    cleanPhotos.push(photo);
  }

  return cleanPhotos;
}

async function loadPhotos(admin: any, inspectionId: string, findingIds: string[]) {
  const byId = new Map<string, any>();

  // Page past Supabase's 1000-row cap so photo-heavy inspections keep every photo.
  async function fetchAll(build: (from: number, to: number) => any) {
    const PAGE = 1000;
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build(from, from + PAGE - 1);
      if (error) {
        console.error("Agent report photos load failed:", error);
        break;
      }
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  }

  const [findingPhotos, inspectionPhotos] = await Promise.all([
    findingIds.length
      ? fetchAll((from, to) =>
          admin
            .from("photos")
            .select("*")
            .in("finding_id", findingIds)
            // photos has no sort_order column; ordering by it 400s and drops
            // every photo/video from the report. Order by created_at only.
            .order("created_at", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([]),
    fetchAll((from, to) =>
      admin
        .from("photos")
        .select("*")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true })
        .range(from, to),
    ),
  ]);

  [...findingPhotos, ...inspectionPhotos].forEach((photo: any) => {
    if (photo?.id) byId.set(String(photo.id), photo);
  });

  return Array.from(byId.values());
}

function pickFirstUrl(...values: any[]) {
  for (const value of values) {
    const clean = cleanText(value);
    if (clean && clean !== "null" && clean !== "undefined") return clean;
  }

  return "";
}

function pickFirstText(...values: any[]) {
  for (const value of values) {
    const clean = cleanText(value);
    if (clean && clean !== "null" && clean !== "undefined") return clean;
  }

  return "";
}

async function maybeSingleOrNull(query: any) {
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data || null;
}

async function findCompanyById(admin: any, companyId: any) {
  const id = cleanText(companyId);
  if (!id) return null;

  return maybeSingleOrNull(admin.from("companies").select("*").eq("id", id));
}

async function loadCompanyBranding(admin: any, inspection: any, fallbackEmail = "") {
  let company: any = null;
  let inspector: any = null;

  const companyId =
    inspection?.company_id ||
    inspection?.companyId ||
    inspection?.company ||
    inspection?.company_uuid ||
    "";

  company = await findCompanyById(admin, companyId);

  const inspectorIds = [
    inspection?.inspector_id,
    inspection?.inspector_user_id,
    inspection?.user_id,
    inspection?.owner_id,
    inspection?.created_by,
    inspection?.auth_user_id,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean);

  for (const inspectorId of inspectorIds) {
    if (!inspector) {
      inspector =
        (await maybeSingleOrNull(admin.from("inspectors").select("*").eq("id", inspectorId))) ||
        (await maybeSingleOrNull(admin.from("inspectors").select("*").eq("user_id", inspectorId))) ||
        (await maybeSingleOrNull(admin.from("inspectors").select("*").eq("owner_id", inspectorId))) ||
        (await maybeSingleOrNull(admin.from("inspectors").select("*").eq("auth_user_id", inspectorId)));
    }

    if (!company) {
      const companyUser = await maybeSingleOrNull(
        admin.from("company_users").select("company_id, role").eq("user_id", inspectorId)
      );

      company = await findCompanyById(admin, companyUser?.company_id);
    }

    if (company) break;
  }

  const inspectorEmail = cleanEmail(
    inspection?.inspector_email ||
      inspection?.owner_email ||
      inspection?.created_by_email ||
      fallbackEmail
  );

  if (!inspector && inspectorEmail) {
    inspector =
      (await maybeSingleOrNull(admin.from("inspectors").select("*").ilike("email", inspectorEmail))) ||
      (await maybeSingleOrNull(admin.from("inspectors").select("*").ilike("owner_email", inspectorEmail)));
  }

  if (!company && inspector?.company_id) {
    company = await findCompanyById(admin, inspector.company_id);
  }

  if (!company && inspectorEmail) {
    company =
      (await maybeSingleOrNull(admin.from("companies").select("*").ilike("email", inspectorEmail))) ||
      (await maybeSingleOrNull(admin.from("companies").select("*").ilike("owner_email", inspectorEmail)));
  }

  const companyName = pickFirstText(
    company?.display_name,
    company?.name,
    inspection?.company_name,
    inspection?.inspection_company,
    "On Point Home Inspections LLC"
  );

  const companyEmail = pickFirstText(
    company?.email,
    inspection?.company_email,
    inspection?.inspector_email,
    fallbackEmail
  );

  const companyPhone = pickFirstText(company?.phone, inspection?.company_phone, inspection?.inspector_phone);
  const companyWebsite = pickFirstText(company?.website, inspection?.company_website);

  const logoUrl = pickFirstUrl(
    company?.logo_url,
    company?.company_logo_url,
    company?.profile_logo_url,
    company?.public_logo_url,
    company?.brand_logo_url,
    company?.logo,
    company?.image_url,
    company?.avatar_url,
    inspector?.company_logo_url,
    inspector?.logo_url,
    inspector?.profile_logo_url,
    inspector?.brand_logo_url,
    inspector?.logo,
    inspector?.image_url,
    inspection?.company_logo_url,
    inspection?.logo_url
  );

  const brandColor = pickFirstText(company?.brand_color, inspection?.brand_color, "#0f8f8f");
  const licenseInfo = pickFirstText(company?.license_info, inspector?.license_info, inspection?.license_info);
  const footerBranding = pickFirstText(
    company?.report_footer_branding,
    "Protecting Your Investment. One Inspection at a Time."
  );

  return {
    company,
    inspector,
    companyName,
    companyEmail,
    companyPhone,
    companyWebsite,
    logoUrl,
    brandColor,
    licenseInfo,
    footerBranding,
  };
}

function buildLogoHtml(branding: any, variant: "cover" | "header" = "header") {
  const logoUrl = cleanText(branding?.logoUrl);

  if (logoUrl) {
    return `<img class="${variant === "cover" ? "cover-logo-img" : "header-logo-img"}" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(branding?.companyName || "Company Logo")}" />`;
  }

  return `<div class="${variant === "cover" ? "cover-logo-fallback" : "header-logo-fallback"}">${escapeHtml(branding?.companyName || "Company")}</div>`;
}

function getSectionAnchor(section: any) {
  return cleanText(section)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A stable per-finding anchor so the Key Findings summary rows can link straight
// to each finding. Keyed on the human report item number (e.g. "8.1.1", unique
// per report), falling back to the row id. Returns "" when neither exists.
function getFindingAnchor(finding: any) {
  const base = cleanText(finding?.report_item_number) || cleanText(finding?.id);
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `finding-${slug}` : "";
}

function severityKey(value: any) {
  return getSeverityBucket(value).toLowerCase().replace(/[^a-z]+/g, "-");
}

function buildStandardsOfPracticePagesHtml({
  property,
  cityStateZip,
  companyName,
  headerLogoHtml,
  standardsOfPractice,
}: {
  property: string;
  cityStateZip: string;
  companyName: string;
  headerLogoHtml: string;
  standardsOfPractice: Array<{ title: string; body: string }>;
}) {
  const standardsHtml = standardsOfPractice.map((section) => `
    <article class="standards-block">
      <h3>${escapeHtml(section.title)}</h3>
      ${escapeHtml(section.body)
        .split("\n\n")
        .filter(Boolean)
        .map((paragraph) => `<p>${paragraph}</p>`)
        .join("")}
    </article>
  `).join("");

  return `
    <section class="page standards-page" id="standards-of-practice">
      <header class="page-header">
        <div class="mini-brand">${headerLogoHtml}</div>
        <div class="header-address">${escapeHtml(property)}<br/>${escapeHtml(cityStateZip)}</div>
      </header>

      <div class="standards-title">
        <p>Report Reference</p>
        <h2>Standards of Practice</h2>
        <span>The inspection was performed according to these Standards of Practice. These standards define the systems inspected and identify items the inspector is not required to inspect.</span>
      </div>

      <div class="standards-grid">
        ${standardsHtml}
      </div>

      <footer class="black-footer">
        <span>Standards of Practice</span>
        <span>${escapeHtml(companyName)}</span>
      </footer>
    </section>
  `;
}

function buildAgentReportHtml({
  inspection,
  findings,
  sectionOrder,
  reportMode,
  propertyPhotoUrl,
  branding,
  qrCodeDataUrl,
  standardsOfPractice,
  includeStandardsInPdf,
  clientNameOverride,
  clientEmailOverride,
  sectionNotes,
  limitations,
  checklistBySection,
  referencePhotosBySection,
  disclaimers,
  equipment,
  realtorBrand,
  sevColors = { safety: "#ef4444", repair: "#f97316", maintenance: "#0f9488", info: "#2563eb" },
}: {
  sevColors?: { safety: string; repair: string; maintenance: string; info: string };
  inspection: any;
  findings: any[];
  sectionOrder?: string[];
  reportMode: "agent" | "full";
  propertyPhotoUrl?: string;
  branding: any;
  qrCodeDataUrl?: string;
  standardsOfPractice: Array<{ title: string; body: string }>;
  includeStandardsInPdf: boolean;
  clientNameOverride?: string;
  clientEmailOverride?: string;
  sectionNotes?: Record<string, string>;
  limitations?: Array<{ section: string; label: string; comment: string }>;
  checklistBySection?: Record<string, Record<string, string[]>>;
  referencePhotosBySection?: Record<string, Array<{ url: string; caption: string }>>;
  disclaimers?: Array<{ topic: string; text: string }>;
  equipment?: Array<{ type: string; name: string; photoUrl: string; rows: Array<[string, string]>; note: string; prognosis?: string }>;
  realtorBrand?: { name: string; brokerage: string; photo: string } | null;
}) {
  const property = getPropertyAddress(inspection);
  const isFull = reportMode === "full";
  // Standards references must NEVER change a report already delivered. Gate on
  // the publish timestamp so a PDF of a report published before this feature
  // launched renders exactly as it did (matches the share page's gate).
  const CLIENT_INTELLIGENCE_LAUNCH = new Date("2026-09-01T00:00:00Z");
  const publishedAtRaw = (inspection as any)?.published_at;
  const wasPublished = Boolean(
    (inspection as any)?.is_published || (inspection as any)?.published || publishedAtRaw,
  );
  const publishedAfterLaunch =
    Boolean(publishedAtRaw) && new Date(publishedAtRaw) >= CLIENT_INTELLIGENCE_LAUNCH;
  // Fail-safe: only drafts or reports confirmed published after launch get it;
  // anything already delivered stays frozen.
  const showClientIntelligence = publishedAfterLaunch || !wasPublished;
  const activeSectionOrder = sectionOrder || SECTION_ORDER;
  const numberedFindings = addRepairItemNumbers(findings, activeSectionOrder);
  const defects = numberedFindings.filter(isReportDefect);

  const counts = defects.reduce(
    (acc: Record<string, number>, finding: any) => {
      const bucket = getSeverityBucket(finding.severity);
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    },
    {}
  );

  const grouped = activeSectionOrder.map((section) => ({
    section,
    findings: defects.filter((finding) => normalizeSection(finding.section) === section),
  })).filter((group) =>
    group.findings.length > 0 ||
    Boolean(checklistBySection && checklistBySection[group.section]) ||
    Boolean(referencePhotosBySection && referencePhotosBySection[group.section]?.length),
  );

  const otherFindings = defects.filter(
    (finding) => !activeSectionOrder.includes(normalizeSection(finding.section))
  );

  if (otherFindings.length) grouped.push({ section: "Other", findings: otherFindings });

  const clientName = clientNameOverride || inspection.client_name || inspection.client || "N/A";
  const clientEmail = clientEmailOverride || inspection.client_email || "N/A";
  const realtorName = inspection.realtor_name || inspection.agent_name || inspection.buyer_agent_name || "N/A";
  const inspectorName = inspection.inspector_name || inspection.inspector || "Jeff Shockey";
  const inspectionDate = formatDate(inspection.inspection_date || inspection.scheduled_date || inspection.created_at);
  const cityStateZip = [inspection.city, inspection.state, inspection.zip].filter(Boolean).join(", ");
  const reportId = inspection.report_number || inspection.id || "";
  const onlineReportUrl = onlineReportUrlForInspection(inspection);
  const companyName = branding?.companyName || "On Point Home Inspections LLC";
  const companyEmail = branding?.companyEmail || "";
  const companyPhone = branding?.companyPhone || "";
  const companyWebsite = branding?.companyWebsite || "";
  const licenseInfo = branding?.licenseInfo || "";
  const footerBranding = branding?.footerBranding || "Protecting Your Investment. One Inspection at a Time.";
  const coverLogoHtml = buildLogoHtml(branding, "cover");
  const headerLogoHtml = buildLogoHtml(branding, "header");
  const qrLogoUrl = cleanText(branding?.logoUrl);
  const qrHtml = qrCodeDataUrl
    ? `
      <div class="qr-box real">
        <img class="qr-image" src="${escapeHtml(qrCodeDataUrl)}" alt="Scan to view full inspection report" />
        ${
          qrLogoUrl
            ? `
              <div class="qr-logo">
                <img src="${escapeHtml(qrLogoUrl)}" alt="${escapeHtml(companyName)} logo" />
              </div>
            `
            : ""
        }
      </div>
    `
    : `<div class="qr-box">QR Code<br/>Unavailable</div>`;

  const coverPhotoHtml = propertyPhotoUrl
    ? `<img class="cover-photo" src="${escapeHtml(propertyPhotoUrl)}" alt="Property photo" />`
    : `<div class="cover-photo no-photo">Property photo not available</div>`;

  // Each TOC row is an in-document link (<a href="#anchor">) whose target is the
  // matching section's `id` further down. Chrome's printToPDF turns these into
  // clickable jump links inside the PDF -- click a row, land on that section
  // (the same behavior as Spectora's report).
  const tocHtml = grouped.map((group) => {
    const sectionNumber = getSectionNumber(group.section, activeSectionOrder);
    return `
      <a class="toc-row" href="#${escapeHtml(getSectionAnchor(group.section))}">
        <span class="toc-num">${escapeHtml(String(sectionNumber))}</span>
        <span class="toc-name">${escapeHtml(group.section)}</span>
        <span class="toc-dots"></span>
        <span class="toc-count">${group.findings.length} item${group.findings.length === 1 ? "" : "s"}</span>
      </a>
    `;
  }).join("");

  const tocExtraRow = (label: string, count: string, anchor: string) => `
      <a class="toc-row" href="#${escapeHtml(anchor)}">
        <span class="toc-num">&bull;</span>
        <span class="toc-name">${escapeHtml(label)}</span>
        <span class="toc-dots"></span>
        <span class="toc-count">${escapeHtml(count)}</span>
      </a>`;

  const equipmentTocHtml = (Array.isArray(equipment) && equipment.length)
    ? tocExtraRow("Equipment Inventory", `${equipment.length} item${equipment.length === 1 ? "" : "s"}`, "equipment-inventory")
    : "";
  const disclaimersTocHtml = (Array.isArray(disclaimers) && disclaimers.length)
    ? tocExtraRow("Disclaimers", `${disclaimers.length} notice${disclaimers.length === 1 ? "" : "s"}`, "disclaimers")
    : "";

  const standardsTocHtml = includeStandardsInPdf
    ? `
      <a class="toc-row" href="#standards-of-practice">
        <span class="toc-num">SOP</span>
        <span class="toc-name">Standards of Practice</span>
        <span class="toc-dots"></span>
        <span class="toc-count">Reference</span>
      </a>
    `
    : "";

  const keyFindingsHtml = defects.map((finding: any) => {
    const section = normalizeSection(finding.section);
    const bucket = getSeverityBucket(finding.severity);
    const anchor = getFindingAnchor(finding);
    const rowInner = `
        <span class="key-dot ${severityKey(finding.severity)}"></span>
        <span><strong>${escapeHtml(String(finding.report_item_number || ""))}</strong> ${escapeHtml(section)} — ${escapeHtml(getFindingTitle(finding))}</span>
        <em>${escapeHtml(bucket)}</em>`;
    // Each row links to its finding's anchor further down (clickable in the PDF).
    return `
      <li>
        ${anchor
          ? `<a class="key-link" href="#${escapeHtml(anchor)}">${rowInner}</a>`
          : `<div class="key-link">${rowInner}</div>`}
      </li>
    `;
  }).join("");

  const summaryCircle = (cls: string, count: number, label: string) => `
    <div class="sum-circle ${cls}">
      <div class="sum-num">${count}</div>
      <div class="sum-lbl">${label}</div>
    </div>`;

  const summaryCards = `
    <div class="sum-circles">
      ${summaryCircle("safety-major", counts["Safety / Major"] || 0, "Safety / Major")}
      ${summaryCircle("recommended-repair", counts["Recommended Repair"] || 0, "Recommended Repair")}
      ${summaryCircle("maintenance-monitor", counts["Maintenance / Monitor"] || 0, "Maintenance / Monitor")}
      ${summaryCircle("informational", counts["Informational"] || 0, "Informational")}
    </div>
  `;

  const pagesHtml = grouped.map((group) => {
    const sectionNumber = getSectionNumber(group.section, activeSectionOrder);

    const findingsHtml = group.findings.map((finding: any) => {
      const sectionItemNumber = String(finding.report_item_number || "");
      // Only render still images. A video whose poster/thumbnail didn't resolve
      // leaves a plain video-file URL that an <img> can't display (blank box);
      // drop those so the PDF never shows an empty photo.
      const photos = (Array.isArray(finding.photos) ? finding.photos : [])
        .filter(
          (photo: any) =>
            cleanText(photo?.download_url) &&
            !/\.(mp4|mov|m4v|webm|avi|quicktime)(\?|#|$)/i.test(String(photo.download_url)),
        )
        .slice(0, isFull ? 6 : 3);

      const photoCountClass = photos.length === 1 ? "one" : photos.length === 2 ? "two" : "";
      const photoHtml = photos.length
        ? `<div class="photos ${photoCountClass}">${photos.map((photo: any) => `<img src="${escapeHtml(photo.download_url)}" alt="Finding photo" />`).join("")}</div>`
        : "";

      const note = (label: string, value: any, cls = "") => {
        const v = cleanText(value);
        return v ? `<p class="note ${cls}"><span class="note-k">${label}:</span> ${escapeHtml(v)}</p>` : "";
      };
      const observationHtml = note("Observation", finding.observation);
      const implicationHtml = note("Implication", finding.implication);
      const recommendationHtml = note(
        "Recommendation",
        finding.recommendation || getFindingText(finding),
        "note-rec",
      );

      const standardsHtml = showClientIntelligence
        ? matchStandards(`${finding.title || ""} ${finding.observation || ""} ${finding.recommendation || ""}`)
            .map(
              (std) =>
                `<p class="note"><span class="note-k">Relevant standard:</span> ${escapeHtml(std.title)} (${escapeHtml(std.citation)}) — ${escapeHtml(std.note)}</p>`,
            )
            .join("")
        : "";

      const subLabel = cleanText(finding.component || finding.subsection || finding.category);

      const findingAnchor = getFindingAnchor(finding);
      return `
        <article class="finding"${findingAnchor ? ` id="${escapeHtml(findingAnchor)}"` : ""}>
          <div class="finding-head">
            <div class="finding-meta">
              <span class="finding-ref">${escapeHtml(sectionItemNumber)}${subLabel ? " &middot; " + escapeHtml(subLabel) : ""}</span>
              <h3 class="finding-title">${escapeHtml(getFindingTitle(finding))}</h3>
            </div>
            <span class="sev-pill ${severityKey(finding.severity)}">${escapeHtml(getSeverityBucket(finding.severity))}</span>
          </div>

          <div class="finding-notes">
            ${observationHtml}
            ${implicationHtml}
            ${recommendationHtml}
            ${standardsHtml}
          </div>

          ${photoHtml}
        </article>
      `;
    }).join("");

    const sectionInfo = checklistBySection && checklistBySection[group.section];
    const infoHtml = sectionInfo && Object.keys(sectionInfo).length
      ? `
        <div class="sub-head">Information</div>
        <div class="info-grid">
          ${Object.entries(sectionInfo).map(([groupTitle, vals]) => `
            <div class="info-item">
              <span class="info-k">${escapeHtml(groupTitle)}</span>
              <span class="info-v">${escapeHtml((vals as string[]).join(", "))}</span>
            </div>
          `).join("")}
        </div>
      `
      : "";

    const refPhotosForSection =
      (referencePhotosBySection && referencePhotosBySection[group.section]) || [];
    const refPhotosHtml = refPhotosForSection.length
      ? `
        <div class="sub-head">Reference Photos</div>
        <div class="ref-grid">
          ${refPhotosForSection.map((photo) => `
            <figure class="ref-photo">
              <img src="${escapeHtml(photo.url)}" alt="Reference photo" />
              ${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ""}
            </figure>
          `).join("")}
        </div>
      `
      : "";

    const findingsBlock = group.findings.length
      ? `<div class="sub-head">Findings <span class="sub-count">${group.findings.length} item${group.findings.length === 1 ? "" : "s"}</span></div>${findingsHtml}`
      : "";

    return `
      <section class="page report-page" id="${escapeHtml(getSectionAnchor(group.section))}">
        <header class="page-header">
          <div class="mini-brand">
            ${headerLogoHtml}
          </div>
          <div class="header-address">
            ${escapeHtml(property)}<br/>
            ${escapeHtml(cityStateZip)}
          </div>
        </header>

        <div class="section-head">
          <p class="section-eyebrow">Section ${escapeHtml(String(sectionNumber))}</p>
          <h2 class="section-name">${escapeHtml(group.section)}</h2>
        </div>

        ${
          sectionNotes && sectionNotes[group.section]
            ? `<div class="section-note">${escapeHtml(sectionNotes[group.section])}</div>`
            : ""
        }

        ${infoHtml}
        ${refPhotosHtml}
        ${findingsBlock}

        <footer class="black-footer">
          <span>${escapeHtml(companyName)}</span>
          <span>${escapeHtml(group.section)}</span>
        </footer>
      </section>
    `;
  }).join("");

  const limitationsList = Array.isArray(limitations) ? limitations : [];
  const limitationsPageHtml =
    limitationsList.length > 0
      ? (() => {
          const bySection = new Map<string, { label: string; comment: string }[]>();
          for (const lim of limitationsList) {
            const sec = normalizeSection(lim.section) || "General";
            if (!bySection.has(sec)) bySection.set(sec, []);
            bySection.get(sec)!.push({
              label: lim.label || "Limitation",
              comment: lim.comment || "",
            });
          }
          const blocks = Array.from(bySection.entries())
            .map(
              ([sec, items]) => `
      <div style="margin-bottom:16px;">
        <h3 style="margin:0 0 8px;font-size:15px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">${escapeHtml(sec)}</h3>
        ${items
          .map(
            (it) => `
          <div style="margin:0 0 10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
            <p style="margin:0;font-weight:800;color:#0f172a;font-size:13px;">${escapeHtml(it.label)}</p>
            ${it.comment ? `<p style="margin:6px 0 0;color:#334155;font-size:13px;line-height:1.5;">${escapeHtml(it.comment)}</p>` : ""}
          </div>`,
          )
          .join("")}
      </div>`,
            )
            .join("");
          return `
    <section class="page report-page">
      <header class="page-header">
        <div class="mini-brand">${headerLogoHtml}</div>
        <div class="header-address">${escapeHtml(property)}<br/>${escapeHtml(cityStateZip)}</div>
      </header>
      <div class="section-banner">
        <span>!</span>
        <div><p>Inspection</p><h2>Limitations</h2></div>
      </div>
      <p style="margin:0 0 12px;color:#334155;font-size:13px;">Areas or systems where access, visibility, or testing was limited during this inspection.</p>
      ${blocks}
      <footer class="black-footer"><span>${escapeHtml(companyName)}</span><span>Limitations</span></footer>
    </section>`;
        })()
      : "";

  const standardsPagesHtml = includeStandardsInPdf
    ? buildStandardsOfPracticePagesHtml({
        property,
        cityStateZip,
        companyName,
        headerLogoHtml,
        standardsOfPractice,
      })
    : "";

  const miniHeader = `
        <header class="page-header">
          <div class="mini-brand">${headerLogoHtml}</div>
          <div class="header-address">${escapeHtml(property)}<br/>${escapeHtml(cityStateZip)}</div>
        </header>`;

  const equipmentList = Array.isArray(equipment) ? equipment : [];
  const equipmentPageHtml = equipmentList.length
    ? `
      <section class="page report-page" id="equipment-inventory">
        ${miniHeader}
        <div class="section-head">
          <p class="section-eyebrow">Inspection Reference</p>
          <h2 class="section-name">Equipment Inventory</h2>
        </div>
        <div class="equip-grid">
          ${equipmentList.map((e) => `
            <div class="equip-card">
              ${e.photoUrl ? `<img class="equip-img" src="${escapeHtml(e.photoUrl)}" alt="Equipment" />` : ""}
              <p class="equip-type">${escapeHtml(e.type)}</p>
              <h3 class="equip-name">${escapeHtml(e.name)}</h3>
              ${e.rows.length ? `<div class="equip-rows">${e.rows.map(([k, v]) => `<div class="equip-row"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join("")}</div>` : ""}
              ${showClientIntelligence && e.prognosis ? `<p class="equip-note">🕒 Prognosis: ${escapeHtml(e.prognosis)}</p>` : ""}
              ${e.note ? `<p class="equip-note">${escapeHtml(e.note)}</p>` : ""}
            </div>
          `).join("")}
        </div>
        <footer class="black-footer"><span>${escapeHtml(companyName)}</span><span>Equipment Inventory</span></footer>
      </section>`
    : "";

  const disclaimersList = Array.isArray(disclaimers) ? disclaimers : [];
  const disclaimersPageHtml = disclaimersList.length
    ? `
      <section class="page report-page" id="disclaimers">
        ${miniHeader}
        <div class="section-head">
          <p class="section-eyebrow">Report Reference</p>
          <h2 class="section-name">Disclaimers</h2>
        </div>
        <p class="disc-intro">These disclaimers are part of the inspection report and should be reviewed with the same care as the findings.</p>
        ${disclaimersList.map((d) => `
          <div class="disc-item">
            ${d.topic ? `<h3 class="disc-topic">${escapeHtml(d.topic)}</h3>` : ""}
            ${d.text ? `<p class="disc-text">${escapeHtml(d.text)}</p>` : ""}
          </div>
        `).join("")}
        <footer class="black-footer"><span>${escapeHtml(companyName)}</span><span>Disclaimers</span></footer>
      </section>`
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${isFull ? "Full Report" : "Agent Report"} - ${escapeHtml(property)}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* A small top margin on every printed page so content (esp. on pages that
       continue a long section) isn't jammed against the very top edge. Sides and
       bottom stay 0 so the full-bleed footer/border keep reaching the page edges.
       The .page min-height in @media print is reduced by the same amount so a
       full-height section still fits one sheet without spilling a near-blank page. */
    @page { size: letter; margin: 0.3in 0 0 0; }
    html, body { margin: 0; padding: 0; }
    body { background: #0b1120; color: #263143; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 12.5px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
    a { color: #0f8f8f; text-decoration: none; }

    .screen-actions { max-width: 816px; margin: 18px auto 12px; padding: 0 12px; display: flex; gap: 10px; flex-wrap: wrap; }
    .screen-actions button { min-height: 44px; border: 1px solid #14b8a6; border-radius: 12px; background: #020617; color: #5eead4; padding: 10px 16px; font-weight: 900; cursor: pointer; }

    .document { width: 816px; margin: 0 auto 30px; background: #e5e7eb; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
    .page { position: relative; width: 816px; min-height: 1056px; overflow: hidden; background: #fff; padding: 42px 46px 62px; break-after: page; page-break-after: always; border-bottom: 10px solid #0b1120; }
    .page:last-child { break-after: auto; page-break-after: auto; }

    .page-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 3px solid #0f8f8f; padding-bottom: 14px; margin-bottom: 24px; }
    .mini-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .header-logo-img { width: 155px; max-height: 48px; object-fit: contain; object-position: left center; display: block; }
    .header-logo-fallback { min-height: 42px; max-width: 230px; display: flex; align-items: center; color: #020617; font-size: 18px; font-weight: 900; line-height: 1.05; text-transform: uppercase; }
    .header-address { text-align: right; font-size: 10px; color: #334155; font-weight: 800; line-height: 1.35; }

    .cover-page { text-align: center; }
    .cover-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 28px; }
    .cover-logo-img { width: 210px; max-height: 92px; object-fit: contain; object-position: left center; display: block; }
    .cover-logo-fallback { width: 210px; min-height: 72px; display: flex; align-items: center; color: #020617; font-size: 21px; font-weight: 900; line-height: 1.05; text-align: left; text-transform: uppercase; }
    .company { text-align: right; color: #334155; font-size: 10px; line-height: 1.5; }
    .company strong { color: #020617; font-size: 13px; }
    .cover-photo { width: 610px; height: 330px; object-fit: cover; display: block; margin: 0 auto 28px; border: 1px solid #cbd5e1; border-radius: 4px; }
    .cover-photo.no-photo { background: #f1f5f9; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 900; }
    .cover-eyebrow { color: #0f8f8f; font-weight: 900; text-transform: uppercase; letter-spacing: .16em; margin: 0 0 8px; }
    h1 { margin: 0; color: #020617; font-size: 34px; line-height: 1.08; text-transform: uppercase; }
    .cover-address { margin: 8px 0 0; color: #334155; font-weight: 900; font-size: 15px; }
    .cover-rule { width: 520px; border: 0; border-top: 3px solid #0f8f8f; margin: 28px auto 20px; }
    .cover-details { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 22px; }
    .detail-card { border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; padding: 14px; min-height: 88px; }
    .detail-card span { display: block; color: #64748b; font-size: 9px; text-transform: uppercase; letter-spacing: .12em; font-weight: 900; }
    .detail-card strong { display: block; margin-top: 8px; color: #020617; font-size: 14px; }
    .cover-agent { display: inline-flex; align-items: center; gap: 14px; margin: 24px auto 0; padding: 12px 18px; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; }
    .cover-agent-photo { width: 56px; height: 56px; object-fit: cover; border-radius: 10px; border: 1px solid #cbd5e1; }
    .cover-agent-info { text-align: left; }
    .cover-agent-info span { display: block; color: #0f8f8f; font-size: 9px; text-transform: uppercase; letter-spacing: .12em; font-weight: 700; }
    .cover-agent-info strong { display: block; color: #1f2937; font-size: 15px; font-weight: 600; margin-top: 2px; }
    .cover-agent-info em { display: block; color: #64748b; font-size: 12px; font-style: normal; margin-top: 1px; }

    .toc-title { margin: 8px 0 24px; color: #1f2937; font-size: 24px; font-weight: 400; letter-spacing: .01em; }
    .summary-title { text-align: center; margin: 4px 0 22px; color: #1f2937; font-size: 26px; font-weight: 400; letter-spacing: .04em; }
    .toc-row { display: grid; grid-template-columns: 34px auto 1fr 90px; align-items: end; gap: 9px; padding: 11px 0; border-bottom: 1px dotted #cbd5e1; }
    .toc-num { color: #0f8f8f; font-weight: 700; }
    .toc-name { color: #1f2937; font-weight: 500; letter-spacing: .01em; }
    .toc-count { color: #94a3b8; text-align: right; font-size: 10px; }

    .sum-circles { display: flex; justify-content: center; gap: 46px; margin: 10px 0 8px; flex-wrap: wrap; }
    .sum-circle { text-align: center; }
    .sum-num { width: 94px; height: 94px; border-radius: 999px; color: #fff; font-size: 36px; font-weight: 500; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
    .sum-lbl { margin-top: 12px; color: #64748b; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; }
    .sum-circle.safety-major .sum-num { background: ${sevColors.safety}; }
    .sum-circle.recommended-repair .sum-num { background: ${sevColors.repair}; }
    .sum-circle.maintenance-monitor .sum-num { background: ${sevColors.maintenance}; }
    .sum-circle.informational .sum-num { background: ${sevColors.info}; }
    .sum-divider { border: 0; border-top: 1px solid #e5e7eb; margin: 26px 0 20px; }

    .key-findings { margin: 0; padding: 0; list-style: none; }
    .key-findings li { border-bottom: 1px solid #f1f5f9; }
    .key-link { display: grid; grid-template-columns: 12px 1fr auto; gap: 13px; align-items: center; padding: 9px 0; color: #374151; text-decoration: none; }
    .key-dot { width: 10px; height: 10px; border-radius: 999px; background: ${sevColors.repair}; }
    .key-dot.safety-major { background: ${sevColors.safety}; }
    .key-dot.maintenance-monitor { background: ${sevColors.maintenance}; }
    .key-dot.informational { background: ${sevColors.info}; }
    .key-findings em { color: #94a3b8; font-style: normal; font-size: 9px; text-transform: uppercase; font-weight: 600; letter-spacing: .05em; }

    .section-head { text-align: center; margin: 4px 0 4px; }
    .section-eyebrow { margin: 0; color: #94a3b8; font-size: 10px; letter-spacing: .26em; text-transform: uppercase; font-weight: 600; }
    .section-name { margin: 6px 0 0; color: #1f2937; font-size: 28px; font-weight: 400; letter-spacing: .01em; }
    .sub-head { display: flex; align-items: baseline; gap: 10px; color: #0f8f8f; font-size: 15px; font-weight: 600; border-bottom: 1px solid #cbd5e1; padding-bottom: 7px; margin: 24px 0 18px; }
    .sub-count { color: #94a3b8; font-size: 11px; font-weight: 500; }
    .section-note { border-left: 3px solid #f59e0b; background: #fffbeb; color: #374151; padding: 10px 14px; margin: 0 0 18px; font-size: 12px; line-height: 1.6; white-space: pre-wrap; }

    .finding { break-inside: avoid; page-break-inside: avoid; padding: 0 0 20px; margin-bottom: 20px; border-bottom: 1px solid #eef2f7; }
    .finding:last-child { border-bottom: 0; margin-bottom: 0; padding-bottom: 2px; }
    .finding-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 9px; }
    .finding-ref { display: block; color: #94a3b8; font-size: 11px; font-weight: 400; margin-bottom: 3px; }
    .finding-title { margin: 0; color: #1f2937; font-size: 17px; font-weight: 600; line-height: 1.28; }
    .sev-pill { flex: none; border-radius: 999px; padding: 6px 14px; color: #fff; background: ${sevColors.repair}; font-size: 10px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; }
    .sev-pill.safety-major { background: ${sevColors.safety}; }
    .sev-pill.maintenance-monitor { background: ${sevColors.maintenance}; }
    .sev-pill.informational { background: ${sevColors.info}; }
    .finding-notes { margin: 0; }
    .note { margin: 0 0 8px; color: #374151; line-height: 1.62; white-space: pre-line; }
    .note:last-child { margin-bottom: 0; }
    .note-k { font-weight: 700; color: #111827; }
    .note-rec .note-k { color: #0f8f8f; }
    .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; align-items: start; }
    .photos.two { grid-template-columns: repeat(2, 1fr); }
    .photos.one { grid-template-columns: minmax(0, 520px); }
    /* NO object-fit and NO fixed height: each photo keeps its NATURAL shape
       (a landscape phone photo stays landscape) and is never cropped — so
       nothing gets cut off and nothing is forced vertical. No border/frame —
       the photo sits flush, Spectora-style. */
    .photos img { width: 100%; height: auto; display: block; border-radius: 4px; }
    h3 { margin: 0; font-weight: 600; color: #1f2937; }

    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 26px; margin-bottom: 4px; }
    .info-item { break-inside: avoid; }
    .info-k { display: block; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; margin-bottom: 3px; }
    .info-v { color: #1f2937; font-weight: 500; }
    .ref-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .ref-photo { margin: 0; break-inside: avoid; }
    .ref-photo img { width: 100%; height: auto; border-radius: 4px; display: block; }
    .ref-photo figcaption { margin-top: 5px; color: #64748b; font-size: 11px; line-height: 1.4; }

    .equip-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
    .equip-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; background: #fbfcfe; }
    .equip-img { width: 100%; height: auto; border-radius: 4px; display: block; margin-bottom: 12px; }
    .equip-type { margin: 0; color: #0f8f8f; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
    .equip-name { margin: 4px 0 10px; color: #1f2937; font-size: 16px; font-weight: 600; }
    .equip-rows { display: grid; gap: 5px; }
    .equip-row { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; }
    .equip-row span { color: #64748b; }
    .equip-row b { color: #1f2937; font-weight: 500; text-align: right; }
    .equip-note { margin: 10px 0 0; color: #374151; font-size: 12px; line-height: 1.55; white-space: pre-line; }

    .disc-intro { margin: 0 0 16px; color: #64748b; font-size: 12.5px; line-height: 1.6; }
    .disc-item { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #eef2f7; }
    .disc-topic { margin: 0 0 6px; color: #1f2937; font-size: 15px; font-weight: 600; }
    .disc-text { margin: 0; color: #374151; line-height: 1.62; white-space: pre-line; }

    .standards-title { border-left: 6px solid #0f8f8f; padding: 0 0 0 18px; margin-bottom: 18px; }
    .standards-title p { margin: 0; color: #0f8f8f; font-size: 10px; text-transform: uppercase; letter-spacing: .14em; font-weight: 900; }
    .standards-title h2 { margin: 4px 0 6px; color: #020617; font-size: 28px; text-transform: uppercase; }
    .standards-title span { display: block; color: #475569; font-size: 11px; line-height: 1.5; max-width: 650px; }
    .standards-grid { display: block; }
    .standards-block { margin: 0 0 20px; padding: 0 0 16px; border-bottom: 1px solid #e5e7eb; }
    .standards-block:last-child { border-bottom: 0; margin-bottom: 0; }
    .standards-block h3 { margin: 0 0 10px; color: #0f766e; font-size: 15px; font-weight: 700; letter-spacing: .01em; break-after: avoid; page-break-after: avoid; }
    .standards-block p { margin: 0 0 9px; color: #374151; font-size: 11px; line-height: 1.6; }
    .standards-block p:last-child { margin-bottom: 0; }

    .interactive-card { margin: 120px auto 0; max-width: 420px; text-align: center; }
    .interactive-icon { width: 90px; height: 90px; margin: 0 auto 18px; border-radius: 999px; background: #0f8f8f; color: white; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 900; }
    .qr-caption { margin: 22px 0 0; color: #020617; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; }
    .qr-box { width: 180px; height: 180px; margin: 24px auto; border: 2px dashed #0f8f8f; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #0f8f8f; font-weight: 900; }
    .qr-box.real { width: 220px; height: 220px; margin: 16px auto 14px; background: #fff; border: 0; border-radius: 18px; display: flex; justify-content: center; align-items: center; position: relative; padding: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
    .qr-image { width: 100%; height: 100%; object-fit: contain; display: block; }
    /* Match the inspector-profile QR center badge: a dark rounded box with a
       teal border and the logo padded inside (contain), instead of a plain white
       box that made a dark logo look like a cramped black square. */
    .qr-logo { position: absolute; width: 54px; height: 54px; background: #020617; border: 2px solid #14b8a6; border-radius: 13px; display: flex; justify-content: center; align-items: center; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.28); }
    .qr-logo img { width: 38px; height: 38px; object-fit: contain; display: block; }
    .online-link { color: #0f8f8f; overflow-wrap: anywhere; font-weight: 800; }

    .black-footer { position: absolute; left: 0; right: 0; bottom: 0; height: 36px; background: #020617; color: #cbd5e1; display: flex; align-items: center; justify-content: space-between; padding: 0 46px; font-size: 9px; }
    .teal-line { position: absolute; left: 46px; right: 46px; bottom: 42px; border-top: 1px solid #0f8f8f; }

    @media (max-width: 840px) {
      .document, .page { width: 100%; }
      .page { min-height: auto; overflow: visible; padding: 24px 20px 70px; break-after: auto; page-break-after: auto; }
      .cover-photo { width: 100%; height: auto; max-height: 320px; }
      .cover-details, .summary-cards, .section-info-strip { grid-template-columns: 1fr; }
      .finding-body, .finding-title-row { grid-template-columns: 1fr; }
      .black-footer { padding: 0 20px; }
    }

    @media print {
      body { background: #fff; }
      .screen-actions { display: none; }
      .document { width: 8.5in; margin: 0; box-shadow: none; background: #fff; }
      /* The PDF renders at Letter width (816px), below the 840px mobile
         breakpoint, so the mobile block above ALSO matches here and had turned
         off the per-section page break (break-after: auto) and left overflow
         hidden. Re-assert them: every section starts on a fresh page, and
         overflow:visible lets Chrome honor break-inside:avoid on findings so a
         finding is never split across a page boundary. */
      .page { width: 8.5in; min-height: 10.7in; overflow: visible; padding: 42px 46px 62px; break-after: page; page-break-after: always; }
      .page:last-child { break-after: auto; page-break-after: auto; }
      /* Keep a section title with its first finding, never orphaned at a page bottom. */
      .section-head { break-after: avoid; page-break-after: avoid; }
      .finding, .equip-card, .disc-item, .info-item, .ref-photo { break-inside: avoid; page-break-inside: avoid; }
      /* Standards blocks can be long reference text; let them flow across pages
         (only the heading stays glued to its first paragraph) so we don't get
         big whitespace gaps from trying to keep a whole section together. */
      .standards-block p { break-inside: avoid; page-break-inside: avoid; }
      .cover-details { grid-template-columns: repeat(3, 1fr); }
    }
  </style>
</head>
<body>
  <div class="screen-actions">
    <button onclick="window.print()">Print / Save PDF</button>
  </div>

  <main class="document">
    <section class="page cover-page">
      <div class="cover-top">
        ${coverLogoHtml}
        <div class="company">
          <strong>${escapeHtml(companyName)}</strong><br/>
          ${companyPhone ? `${escapeHtml(companyPhone)}<br/>` : ""}
          ${companyEmail ? `${escapeHtml(companyEmail)}<br/>` : ""}
          ${companyWebsite ? `${escapeHtml(companyWebsite)}<br/>` : ""}
          ${licenseInfo ? `<span>${escapeHtml(licenseInfo)}</span>` : ""}
        </div>
      </div>

      ${coverPhotoHtml}

      <p class="cover-eyebrow">${isFull ? "Residential Inspection Report" : "Agent Friendly Report"}</p>
      <h1>${escapeHtml(property)}</h1>
      <p class="cover-address">${escapeHtml(cityStateZip || "Inspection Location")}</p>
      <hr class="cover-rule" />

      <div class="cover-details">
        <div class="detail-card"><span>Inspector</span><strong>${escapeHtml(inspectorName)}</strong></div>
        <div class="detail-card"><span>Client</span><strong>${escapeHtml(clientName)}</strong></div>
        <div class="detail-card"><span>Realtor</span><strong>${escapeHtml(realtorName)}</strong></div>
        <div class="detail-card"><span>Inspection Date</span><strong>${escapeHtml(inspectionDate)}</strong></div>
        <div class="detail-card"><span>Report Type</span><strong>${isFull ? "Full Report" : "Agent Report"}</strong></div>
        <div class="detail-card"><span>Report ID</span><strong>${escapeHtml(reportId || "N/A")}</strong></div>
      </div>

      ${
        realtorBrand
          ? `
      <div class="cover-agent">
        ${realtorBrand.photo ? `<img class="cover-agent-photo" src="${escapeHtml(realtorBrand.photo)}" alt="Agent" />` : ""}
        <div class="cover-agent-info">
          <span>Your Agent</span>
          <strong>${escapeHtml(realtorBrand.name || realtorName)}</strong>
          ${realtorBrand.brokerage ? `<em>${escapeHtml(realtorBrand.brokerage)}</em>` : ""}
        </div>
      </div>`
          : ""
      }

      <div class="teal-line"></div>
      <footer class="black-footer">
        <span>${escapeHtml(footerBranding)}</span>
        <span>${escapeHtml(companyName)}</span>
      </footer>
    </section>

    ${isFull ? `
    <section class="page">
      <header class="page-header">
        <div class="mini-brand">${headerLogoHtml}</div>
        <div class="header-address">${escapeHtml(property)}<br/>${escapeHtml(cityStateZip)}</div>
      </header>
      <h2 class="toc-title">Table of Contents</h2>
      ${tocHtml || "<p>No sections with findings.</p>"}
      ${equipmentTocHtml}
      ${disclaimersTocHtml}
      ${standardsTocHtml}
      <footer class="black-footer"><span>${escapeHtml(companyName)}</span><span>Table of Contents</span></footer>
    </section>
    ` : ""}

    <section class="page">
      <header class="page-header">
        <div class="mini-brand">${headerLogoHtml}</div>
        <div class="header-address">${escapeHtml(property)}<br/>${escapeHtml(cityStateZip)}</div>
      </header>

      <h2 class="summary-title">Summary</h2>
      ${summaryCards}

      <hr class="sum-divider" />

      <h2 class="summary-title">Key Findings</h2>
      <ul class="key-findings">
        ${keyFindingsHtml || "<li>No report findings were found.</li>"}
      </ul>

      <footer class="black-footer">
        <span>Summary</span>
        <span>${defects.length} documented finding${defects.length === 1 ? "" : "s"}</span>
      </footer>
    </section>

    ${pagesHtml || `
      <section class="page">
        <header class="page-header">
          <div class="mini-brand">${headerLogoHtml}</div>
          <div class="header-address">${escapeHtml(property)}</div>
        </header>
        <h2>No Findings</h2>
        <p>No report findings were found.</p>
        <footer class="black-footer"><span>${escapeHtml(companyName)}</span><span>No Findings</span></footer>
      </section>
    `}

    ${equipmentPageHtml}

    ${limitationsPageHtml}

    ${disclaimersPageHtml}

    ${standardsPagesHtml}

    ${isFull && onlineReportUrl ? `
    <section class="page">
      <header class="page-header">
        <div class="mini-brand">${headerLogoHtml}</div>
        <div class="header-address">${escapeHtml(property)}<br/>${escapeHtml(cityStateZip)}</div>
      </header>

      <div class="interactive-card">
        <div class="interactive-icon">↗</div>
        <h2 class="summary-title">Interactive Online Report</h2>
        <p>View the complete online report with photos, videos, repair requests, addenda, and client-friendly tools.</p>
        <p class="qr-caption">Scan to View Full Inspection Report</p>
        ${qrHtml}
        <p class="online-link">${escapeHtml(onlineReportUrl)}</p>
      </div>

      <footer class="black-footer">
        <span>Interactive Report</span>
        <span>${escapeHtml(companyName)}</span>
      </footer>
    </section>
    ` : ""}
  </main>
</body>
</html>`;
}


const REMOTE_CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v138.0.2/chromium-v138.0.2-pack.x64.tar";

async function getChromiumExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  if (process.env.VERCEL || process.env.AWS_REGION) {
    // Prefer the binary traced into the function bundle (see
    // outputFileTracingIncludes in next.config.js). Fetching the remote pack
    // costs 15-30s of a cold start and fails outright when GitHub is slow, which
    // is what pushed big reports past the function timeout. It stays only as a
    // fallback for the case the trace didn't include the binary.
    try {
      const bundled = await chromium.executablePath();
      if (bundled) return bundled;
    } catch (error) {
      console.error("Bundled Chromium unavailable, falling back to remote pack:", error);
    }

    return chromium.executablePath(REMOTE_CHROMIUM_PACK_URL);
  }

  const localCandidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];

  const localPath = localCandidates.find((candidate) => existsSync(candidate));
  if (localPath) return localPath;

  return chromium.executablePath();
}

async function renderHtmlToPdf(html: string) {
  let browser: any = null;
  const startedAt = Date.now();

  // Time left before Vercel kills us, floored so a stage never gets a
  // nonsensical zero/negative timeout.
  const remaining = () => Math.max(5_000, RENDER_BUDGET_MS - (Date.now() - startedAt));

  try {
    // Run Chromium without the graphics/WebGL stack on serverless. It's dead
    // weight for a print job and its memory footprint is a common trigger of
    // "Page.printToPDF: Printing failed" on large reports.
    if (process.env.VERCEL || process.env.AWS_REGION) {
      try {
        (chromium as any).setGraphicsMode = false;
      } catch {}
    }

    const executablePath = await getChromiumExecutablePath();

    browser = await puppeteer.launch({
      args: process.env.VERCEL || process.env.AWS_REGION
        ? chromium.args
        : [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--disable-background-networking",
          ],
      defaultViewport: {
        width: 816,
        height: 1056,
        deviceScaleFactor: 1,
      },
      executablePath,
      // @sparticuz/chromium ships the headless-SHELL binary. Driving it with the
      // new headless engine (headless: true) renders fine but makes the print
      // compositor fail -> "Protocol error (Page.printToPDF): Printing failed".
      // Use the headless value the package prescribes for its own binary.
      headless:
        process.env.VERCEL || process.env.AWS_REGION
          ? (chromium as any).headless
          : true,
    });

    const page = await browser.newPage();

    // 0 means "wait forever", which guarantees the platform kills the request
    // instead of us returning a real error. Bound everything to what's left.
    page.setDefaultNavigationTimeout(remaining());
    page.setDefaultTimeout(remaining());

    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: remaining(),
    });

    // Cap the image wait at a third of what's left, so a few slow/broken photo
    // URLs can't consume the whole budget and starve the actual PDF render.
    const imageWaitMs = Math.min(15_000, Math.floor(remaining() / 3));

    await page.evaluate(async (waitMs: number) => {
      const images = Array.from(document.images);

      await Promise.all(
        images.map(
          (image) =>
            new Promise<void>((resolve) => {
              if (image.complete) {
                resolve();
                return;
              }

              const finish = () => resolve();
              image.addEventListener("load", finish, { once: true });
              image.addEventListener("error", finish, { once: true });
              window.setTimeout(finish, waitMs);
            })
        )
      );
    }, imageWaitMs);

    await page.emulateMediaType("print");

    // "Protocol error (Page.printToPDF): Printing failed" is what Chromium throws
    // when the print step runs out of memory or the renderer hiccups on a
    // photo-heavy report. First try with the CSS @page size; if that specific
    // failure hits, retry once with an explicit Letter size (no preferCSSPageSize
    // and a fresh call), which sidesteps most transient print crashes.
    const zeroMargin = { top: "0in", right: "0in", bottom: "0in", left: "0in" };

    let pdf: Uint8Array;
    try {
      pdf = await page.pdf({
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
        margin: zeroMargin,
        timeout: remaining(),
      });
    } catch (printError: any) {
      const message = String(printError?.message || "");
      if (!/printToPDF|Printing failed/i.test(message)) throw printError;

      console.error("printToPDF failed once, retrying without CSS page size:", message);
      await new Promise((resolve) => setTimeout(resolve, 750));
      pdf = await page.pdf({
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: false,
        margin: zeroMargin,
        timeout: remaining(),
      });
    }

    // Chrome's serverless printToPDF stores every photo as a LOSSLESS bitmap,
    // which makes reports 5-10x bigger than they should be. Re-encode those
    // images to JPEG in place — same pixels, a fraction of the size (a 26 MB
    // report drops to ~3 MB). Never fatal: on any failure we keep Chrome's PDF.
    try {
      const before = pdf.length;
      const { bytes, changed, recompressed } = await recompressPdfImages(pdf, { quality: 72 });
      if (changed) {
        console.log(
          `PDF image recompress: ${recompressed} images, ${(before / 1048576).toFixed(1)}MB -> ${(bytes.length / 1048576).toFixed(1)}MB`,
        );
        return Buffer.from(bytes);
      }
    } catch (recompressError) {
      console.error("PDF image recompress failed, sending original:", recompressError);
    }

    return Buffer.from(pdf);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

// When the PDF is opened in a new tab (the Apple-friendly download path), an
// error must not dump raw JSON at the viewer. If the request looks like a
// browser navigation (Accept: text/html), render a small styled page instead.
function wantsHtmlResponse(req: Request) {
  return (req.headers.get("accept") || "").toLowerCase().includes("text/html");
}

function reportErrorResponse(req: Request, message: string, status: number) {
  if (wantsHtmlResponse(req)) {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Report unavailable</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #0b1120; color: #e2e8f0; }
  .card { max-width: 440px; text-align: center; background: #111827; border: 1px solid #1f2937; border-radius: 18px; padding: 30px 28px; }
  h1 { font-size: 19px; margin: 0 0 12px; }
  p { color: #94a3b8; font-size: 15px; line-height: 1.55; margin: 0; }
</style></head><body><div class="card">
  <h1>Report unavailable</h1>
  <p>${escapeHtml(message)}</p>
</div></body></html>`;
    return new NextResponse(html, {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return NextResponse.json({ error: message }, { status });
}

function getDownloadName(property: string, reportMode: "agent" | "full") {
  const slug = cleanText(property)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return `${slug || "inspection-report"}-${reportMode === "full" ? "full-report" : "agent-report"}.pdf`;
}

export async function GET(req: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const lookupValue = cleanText(id);
    const url = new URL(req.url);
    const reportMode = url.searchParams.get("type") === "full" ? "full" : "agent";
    // Language for the PDF (#23) — same cache/translation as the web report.
    const pdfLang = String(url.searchParams.get("lang") || "").trim().toLowerCase();
    // Apple surfaces open the PDF in a new tab and need it served inline so the
    // OS PDF viewer (with its native Save/Share) takes over. Default stays
    // attachment for the classic blob-download path on other platforms.
    const disposition =
      url.searchParams.get("disposition") === "inline" ? "inline" : "attachment";

    if (!lookupValue) {
      return NextResponse.json({ error: "Missing report token." }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
    }

    const admin = createAdminClient();

    // Public downloads are authorized by the same secure report token used to open the share page.
    // Numeric IDs are only accepted for logged-in inspectors/linked realtor portal users.
    // Look up token columns one at a time so a missing legacy column does not break all public downloads.
    let tokenInspection: any = null;

    const tokenColumns = [
      "public_share_token",
      "share_token",
      "report_share_token",
    ];

    for (const column of tokenColumns) {
      const { data, error } = await admin
        .from("inspections")
        .select("*")
        .eq(column, lookupValue)
        .maybeSingle();

      if (data) {
        tokenInspection = data;
        break;
      }

      if (error) {
        console.warn(`Skipping secure report token lookup for ${column}:`, error.message);
      }
    }

    let inspection = tokenInspection || null;
    let inspectionId = inspection ? cleanText(inspection.id) : "";
    let allowedByShareToken = Boolean(inspection);
    let user: any = null;
    let userEmail = "";

    // Always read the session, even when the inspection was resolved via a share
    // token. Otherwise the owning inspector/owner downloading their own report
    // through the token link is treated as anonymous and blocked by the delivery
    // gate on an unpublished/unpaid report.
    try {
      const sessionClient = await createSupabaseServerClient();
      const sessionResult = await sessionClient.auth.getUser();
      user = sessionResult.data.user || null;
      userEmail = cleanEmail(user?.email);
    } catch {}

    if (!inspection) {
      if (!/^\d+$/.test(lookupValue)) {
        return reportErrorResponse(req, "Report link is invalid or expired.", 404);
      }

      const authClient = await createSupabaseServerClient();
      const authResult = await authClient.auth.getUser();
      user = authResult.data.user;
      userEmail = cleanEmail(user?.email);

      if (!user?.email) {
        return reportErrorResponse(
          req,
          "This download link requires a valid shared report link.",
          401,
        );
      }

      inspectionId = lookupValue;

      const { data: inspectionById, error: inspectionError } = await admin
        .from("inspections")
        .select("*")
        .eq("id", inspectionId)
        .maybeSingle();

      if (inspectionError || !inspectionById) {
        return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
      }

      inspection = inspectionById;
    }

    if (!inspection || !inspectionId) {
      return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
    }

    let secureShareToken = getInspectionShareToken(inspection);

    // Only create a missing token when a logged-in authorized user is downloading by numeric ID.
    // Public/token downloads never expose or create predictable numeric access.
    if (!secureShareToken && !allowedByShareToken && user?.email) {
      secureShareToken = randomUUID().replace(/-/g, "");

      const { error: tokenError } = await admin
        .from("inspections")
        .update({ public_share_token: secureShareToken })
        .eq("id", inspectionId);

      if (tokenError) {
        console.error("Secure share token create error:", tokenError);
      } else {
        inspection.public_share_token = secureShareToken;
      }
    }

    let allowed = allowedByShareToken;

    if (!allowed) {
      allowed =
        inspectionBelongsToUser(inspection, user) ||
        inspectionHasRealtorEmail(inspection, userEmail);
    }

    if (!allowed && userEmail) {
      const { data: contact } = await admin
        .from("inspection_contacts")
        .select("id, role, email, portal_access")
        .eq("inspection_id", inspectionId)
        .ilike("email", userEmail)
        .maybeSingle();

      allowed = Boolean(contact && contact.portal_access !== false && roleLooksLikeRealtor(contact.role));
    }

    if (!allowed) {
      return reportErrorResponse(req, "You do not have access to this report.", 403);
    }

    // Delivery gate (audit C3): the owning inspector/owner may always download,
    // but everyone else (public share token, realtor, portal client) only gets
    // the PDF once the report is deliverable - published + payment/agreement
    // complete, or an owner "Deliver anyway" override. Public demo and sample
    // reports stay open.
    let isPrivilegedViewer = false;
    if (user?.id) {
      const owned = await authorizeInspection(admin, user.id, inspectionId);
      if (owned) isPrivilegedViewer = true;
    }

    if (!isPrivilegedViewer && inspection.is_demo !== true) {
      const { data: sampleRow } = await admin
        .from("public_sample_reports")
        .select("inspection_id")
        .eq("inspection_id", inspectionId)
        .maybeSingle();

      if (!sampleRow) {
        const delivery = await getReportDeliveryState(admin, inspection);
        if (!delivery.deliverable) {
          return reportErrorResponse(
            req,
            "This report isn't available for download yet.",
            403,
          );
        }
      }
    }

    // -------- PDF cache (fast repeat downloads, self-invalidating) --------
    // Building the PDF takes ~10s (Puppeteer + image compression). Cache the
    // result in storage keyed by a content SIGNATURE; when nothing that affects
    // the report has changed, serve the stored PDF instead of rebuilding — this
    // is how a pre-generated report (e.g. Spectora) feels instant. Best-effort:
    // any failure just falls through to a normal on-demand build.
    const pdfVariant = `${reportMode}-${pdfLang || "en"}`;
    const pdfCachePath = `_pdf-cache/${inspectionId}/${pdfVariant}.pdf`;

    // Hash the actual content of every table that feeds the PDF (these tables
    // only have created_at, not updated_at, so a value-edit wouldn't show up in
    // counts/timestamps — hashing the rows catches ANY add, edit, or delete).
    const sigRealtorEmail = cleanEmail(
      inspection.realtor_email ||
        inspection.agent_email ||
        inspection.buyer_agent_email ||
        inspection.buyers_agent_email ||
        "",
    );

    let pdfSignature = "";
    try {
      const sel = (table: string, cols: string) =>
        admin.from(table).select(cols).eq("inspection_id", inspectionId).order("created_at", { ascending: true });
      const [f, ph, eq, di, ch, rf, li, nt, rb] = await Promise.all([
        sel("findings", "id,title,observation,implication,recommendation,severity,section,component,report_item_number,defect_type"),
        sel("photos", "id,finding_id,file_path,thumbnail_path,caption,is_video"),
        sel("equipment_inventory", "id,equipment_type,manufacturer,model,serial,manufacture_year,estimated_age,capacity,fuel_type,condition,notes,file_path,thumbnail_path"),
        sel("report_disclaimers", "id,topic,disclaimer_text"),
        sel("section_checklist_selections", "id,section,group_title,value,custom_text"),
        sel("section_reference_photos", "id,section,caption,file_path,thumbnail_path"),
        sel("section_limitations", "id,section,label,limitation_comment,custom_text"),
        admin.from("report_section_notes").select("section_name,notes").eq("inspection_id", inspectionId).order("section_name", { ascending: true }),
        sigRealtorEmail
          ? admin.from("realtor_profiles").select("name,brokerage,photo_url").ilike("email", sigRealtorEmail).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      pdfSignature = createHash("sha1")
        .update(
          JSON.stringify({
            t: PDF_TEMPLATE_VERSION,
            u: inspection.updated_at,
            v: pdfVariant,
            logo: cleanText(inspection.company_id),
            f: f.data, ph: ph.data, eq: eq.data, di: di.data,
            ch: ch.data, rf: rf.data, li: li.data, nt: nt.data,
            re: sigRealtorEmail, rn: cleanText(inspection.realtor_name), rb: rb.data,
          }),
        )
        .digest("hex");
    } catch {
      pdfSignature = "";
    }

    if (pdfSignature) {
      try {
        const { data: cacheRow } = await admin
          .from("report_pdf_cache")
          .select("signature, storage_path")
          .eq("inspection_id", String(inspectionId))
          .eq("variant", pdfVariant)
          .maybeSingle();
        if (cacheRow?.signature === pdfSignature && cacheRow?.storage_path) {
          const { data: file } = await admin.storage
            .from("inspection-photos")
            .download(cacheRow.storage_path);
          if (file) {
            const cached = Buffer.from(await file.arrayBuffer());
            return new NextResponse(new Uint8Array(cached), {
              status: 200,
              headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `${disposition}; filename="${getDownloadName(getPropertyAddress(inspection), reportMode)}"`,
                "Cache-Control": allowedByShareToken
                  ? "public, max-age=120, s-maxage=600, stale-while-revalidate=86400"
                  : "private, max-age=20, stale-while-revalidate=120",
                "X-Pdf-Cache": "hit",
              },
            });
          }
        }
      } catch {
        /* cache read failed — fall through to build */
      }
    }

    const secureOnlineReportUrl = onlineReportUrlForInspection(inspection);

    const brandingPromise = loadCompanyBranding(admin, inspection, userEmail);
    const qrCodePromise =
      reportMode === "full" && secureOnlineReportUrl
        ? QRCode.toDataURL(secureOnlineReportUrl, {
            errorCorrectionLevel: "H",
            margin: 1,
            width: 420,
            color: {
              dark: "#18c8bf",
              light: "#ffffff",
            },
          })
        : Promise.resolve("");

    const { data: findingsRaw } = await admin
      .from("findings")
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });

    const normalizedFindings = (findingsRaw || []).map((finding: any) => ({
      ...finding,
      section: normalizeSection(finding.section),
    }));

    const { data: reportSectionsRaw } = await admin
      .from("report_section_overrides")
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("sort_order", { ascending: true });

    const { data: sectionNotesRaw } = await admin
      .from("report_section_notes")
      .select("section_name, notes")
      .eq("inspection_id", inspectionId);

    const sectionNotesMap: Record<string, string> = {};
    for (const row of sectionNotesRaw || []) {
      if (row?.section_name && String(row.notes || "").trim()) {
        sectionNotesMap[row.section_name] = row.notes;
      }
    }

    const activeSectionOrder = resolveReportSections({
      overrides: reportSectionsRaw || [],
      customOrder: (inspection as any).report_section_order,
      serviceMode: inspection.service_mode,
      templateSections: (inspection as any).template_sections,
    });

    const findingIds = normalizedFindings.map((finding: any) => cleanText(finding.id)).filter(Boolean);
    const photosRaw = await loadPhotos(admin, inspectionId, findingIds);

    // Section limitations (access/visibility/testing restrictions) — the realtor
    // report previously omitted these entirely.
    const { data: limitationsRaw } = await admin
      .from("section_limitations")
      .select("section, label, limitation_comment, ai_notes, custom_text, created_at")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });
    const limitations = (limitationsRaw || []).map((lim: any) => ({
      section: cleanText(lim.section),
      label: cleanText(lim.custom_text || lim.label) || "Limitation",
      comment: cleanText(lim.limitation_comment || lim.ai_notes),
    }));

    // "Information" (what was inspected — materials/methods) + section reference
    // photos, so the PDF is as complete as the web report / Spectora: each
    // section shows its inspected details and reference pics, not only defects.
    const { data: checklistRows } = await admin
      .from("section_checklist_selections")
      .select("section, group_title, value, custom_text")
      .eq("inspection_id", inspectionId);
    const checklistBySection: Record<string, Record<string, string[]>> = {};
    for (const row of (checklistRows as any[]) || []) {
      const sec = normalizeSection(row.section);
      const group = cleanText(row.group_title) || "Details";
      const val = cleanText(row.custom_text || row.value);
      if (!val || val === "__TEXT_VALUE__") continue;
      if (!checklistBySection[sec]) checklistBySection[sec] = {};
      if (!checklistBySection[sec][group]) checklistBySection[sec][group] = [];
      checklistBySection[sec][group].push(val);
    }

    const { data: refPhotosRaw } = await admin
      .from("section_reference_photos")
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });
    const refPhotoPaths = ((refPhotosRaw as any[]) || []).flatMap((p: any) =>
      [p.thumbnail_path, p.file_path].filter(Boolean),
    );
    const [refPdfSigned, refFullSigned] = await Promise.all([
      signedPdfImageUrlMap(admin, refPhotoPaths),
      signedUrlMap(admin, refPhotoPaths),
    ]);
    const referencePhotosBySection: Record<string, Array<{ url: string; caption: string }>> = {};
    for (const p of (refPhotosRaw as any[]) || []) {
      const sec = normalizeSection(p.section);
      if (!sec) continue;
      const path = p.thumbnail_path || p.file_path;
      const refUrl =
        (path && (refPdfSigned[path] || refFullSigned[path])) ||
        cleanText(p.signed_thumbnail_url) ||
        cleanText(p.thumbnail_url) ||
        cleanText(p.signed_url) ||
        cleanText(p.public_url) ||
        "";
      if (!refUrl) continue;
      if (!referencePhotosBySection[sec]) referencePhotosBySection[sec] = [];
      referencePhotosBySection[sec].push({ url: refUrl, caption: cleanText(p.caption) });
    }

    // Report disclaimers + equipment inventory — part of the full report.
    const { data: disclaimerRows } = await admin
      .from("report_disclaimers")
      .select("topic, disclaimer_text, created_at")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });
    const disclaimers = ((disclaimerRows as any[]) || [])
      .map((d: any) => ({ topic: cleanText(d.topic), text: cleanText(d.disclaimer_text) }))
      .filter((d) => d.topic || d.text);

    const { data: equipRows } = await admin
      .from("equipment_inventory")
      .select("*")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });
    const equipPhotoPaths = ((equipRows as any[]) || []).flatMap((e: any) =>
      [e.thumbnail_path, e.file_path].filter(Boolean),
    );
    const [equipPdfSigned, equipFullSigned] = await Promise.all([
      signedPdfImageUrlMap(admin, equipPhotoPaths),
      signedUrlMap(admin, equipPhotoPaths),
    ]);
    const equipment = ((equipRows as any[]) || []).map((e: any) => {
      const path = e.thumbnail_path || e.file_path;
      const photoUrl =
        (path && (equipPdfSigned[path] || equipFullSigned[path])) ||
        cleanText(e.signed_thumbnail_url) || cleanText(e.thumbnail_url) ||
        cleanText(e.signed_image_url) || cleanText(e.image_url) || cleanText(e.public_url) || "";
      return {
        type: cleanText(e.equipment_type) || "Equipment",
        name: [cleanText(e.manufacturer), cleanText(e.model)].filter(Boolean).join(" ") || "Equipment Record",
        photoUrl: /\.(mp4|mov|m4v|webm|avi)(\?|#|$)/i.test(photoUrl) ? "" : photoUrl,
        rows: ([
          ["Serial", cleanText(e.serial)],
          ["Manufacture Year", cleanText(e.manufacture_year)],
          ["Estimated Age", cleanText(e.estimated_age)],
          ["Capacity", cleanText(e.capacity)],
          ["Fuel Type", cleanText(e.fuel_type)],
          ["Condition", cleanText(e.condition)],
        ] as Array<[string, string]>).filter(([, v]) => v),
        note: cleanText(e.notes || e.inspector_note || e.ai_notes),
        prognosis: (() => {
          const p = estimatePrognosis(
            cleanText(e.equipment_type),
            deriveAgeYears(new Date().getFullYear(), e.manufacture_year, e.estimated_age),
          );
          return p.matched && (p.status === "past" || p.status === "near") ? p.summary : "";
        })(),
      };
    });

    // PDF files can't play video, but a finding's video should still appear as
    // its poster/thumbnail frame (getPhotoStoragePath prefers the thumbnail for
    // videos) rather than being dropped entirely.
    const photoPaths = photosRaw
      .map((photo: any) => getPhotoStoragePath(photo, true))
      .filter(Boolean);

    const legacyFindingPhotoPaths = normalizedFindings
      .flatMap((finding: any) =>
        getLegacyFindingPhotoCandidates(finding)
          .filter((candidate: any) => !isVideoPhoto({}, cleanText(candidate)))
          .map((candidate: any) => getStoragePathFromUrl(candidate))
      )
      .filter(Boolean);

    const propertyPhotoPath = getPropertyPhotoPath(inspection);
    const allImagePaths = [...photoPaths, ...legacyFindingPhotoPaths, propertyPhotoPath].filter(Boolean);

    const [signedMap, pdfImageMap] = await Promise.all([
      signedUrlMap(admin, allImagePaths),
      signedPdfImageUrlMap(admin, allImagePaths),
    ]);

    const photosWithUrls = photosRaw.map((photo: any) => {
      // For a video, getPhotoStoragePath(true) yields the poster/thumbnail image
      // path, so it renders as a still frame in the PDF instead of being dropped.
      const path = getPhotoStoragePath(photo, true);

      return {
        ...photo,
        download_url:
          (path && pdfImageMap[path]) ||
          (path && signedMap[path]) ||
          getPhotoFallbackUrl(photo, true) ||
          "",
      };
    });

    const photosByFindingId = photosWithUrls.reduce((acc: Record<string, any[]>, photo: any) => {
      const findingId = cleanText(photo.finding_id || photo.findingId);
      if (!findingId || !photo.download_url) return acc;
      if (!acc[findingId]) acc[findingId] = [];
      acc[findingId].push(photo);
      return acc;
    }, {});

    const findings = normalizedFindings.map((finding: any) => {
      const findingId = cleanText(finding.id);
      const directPhotos = photosByFindingId[findingId] || [];
      const legacyPhotos = getLegacyFindingPhotoCandidates(finding)
        .filter((candidate: any) => !isVideoPhoto({}, cleanText(candidate)))
        .map((candidate: any) => {
          const path = getStoragePathFromUrl(candidate);
          const urlValue =
            (path && pdfImageMap[path]) ||
            (path && signedMap[path]) ||
            candidate ||
            "";

          return urlValue ? { download_url: urlValue } : null;
        })
        .filter(Boolean);

      const finalPhotos = directPhotos.length > 0 ? directPhotos : legacyPhotos;

      return {
        ...finding,
        photos: dedupeDownloadPhotos(finalPhotos.filter((photo: any) => photo?.download_url)),
      };
    });

    // #23: translate the PDF's findings + section notes into the requested
    // language (same cache the web report uses), applied in the data so the
    // HTML builder below renders the translated report.
    if (pdfLang && pdfLang !== "en" && isSupportedLanguage(pdfLang)) {
      try {
        const sources: string[] = [];
        for (const f of findings) {
          sources.push(
            cleanText(f.title), cleanText(f.observation), cleanText(f.implication),
            cleanText(f.recommendation), cleanText(f.location), cleanText(f.comment),
          );
        }
        for (const k of Object.keys(sectionNotesMap)) sources.push(sectionNotesMap[k]);

        const tmap = await getReportTranslations(
          admin,
          inspectionId,
          pdfLang,
          sources.filter(Boolean),
        );
        const t = makeTranslator(tmap);
        for (const f of findings) {
          if (f.title) f.title = t(f.title);
          if (f.observation) f.observation = t(f.observation);
          if (f.implication) f.implication = t(f.implication);
          if (f.recommendation) f.recommendation = t(f.recommendation);
          if (f.location) f.location = t(f.location);
          if (f.comment) f.comment = t(f.comment);
        }
        for (const k of Object.keys(sectionNotesMap)) {
          sectionNotesMap[k] = t(sectionNotesMap[k]);
        }
      } catch (translateError) {
        console.error("PDF translation error:", translateError);
      }
    }

    const { data: reportClientContactsRaw, error: reportClientContactsError } =
      await admin
        .from("inspection_contacts")
        .select("id, name, email, role, created_at")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true });

    if (reportClientContactsError) {
      console.error(
        "PDF client contacts load error:",
        reportClientContactsError,
      );
    }

    const reportClientContacts = (reportClientContactsRaw || []).filter(
      (contact: any) => {
        const role = cleanText(contact?.role).toLowerCase();
        return role === "client" || role === "co-client" || role.includes("client");
      },
    );

    const reportClientNames = Array.from(
      new Set(
        reportClientContacts
          .map((contact: any) => cleanText(contact?.name))
          .filter(
            (name: string) =>
              Boolean(name) &&
              !["test", "client test", "test client"].includes(name.toLowerCase()),
          ),
      ),
    );

    const reportClientEmails = Array.from(
      new Set(
        reportClientContacts
          .map((contact: any) => cleanEmail(contact?.email))
          .filter(Boolean),
      ),
    );

    const clientNameOverride =
      reportClientNames.join(" & ") ||
      cleanText(inspection.client_name || inspection.client) ||
      "N/A";

    const clientEmailOverride =
      reportClientEmails.join(", ") ||
      cleanText(inspection.client_email) ||
      "N/A";

    const rawPropertyPhoto = getPropertyPhoto(inspection);
    const propertyPhotoUrl =
      (propertyPhotoPath && pdfImageMap[propertyPhotoPath]) ||
      (propertyPhotoPath && signedMap[propertyPhotoPath]) ||
      rawPropertyPhoto ||
      "";

    const [branding, qrCodeDataUrl] = await Promise.all([
      brandingPromise,
      qrCodePromise,
    ]);

    const standardsOfPractice = getCompanyStandards(branding.company);
    const includeStandardsInPdf = shouldIncludeStandardsInPdf(branding.company);

    // Realtor co-branding on the report cover (if the agent set up a profile in
    // the Realtor Portal). Photo is compressed to a data URI to keep it small.
    const realtorBrandEmail = cleanEmail(
      inspection.realtor_email ||
        inspection.agent_email ||
        inspection.buyer_agent_email ||
        inspection.buyers_agent_email ||
        "",
    );
    let realtorBrand: { name: string; brokerage: string; photo: string } | null = null;
    if (realtorBrandEmail) {
      try {
        const { data: rp } = await admin
          .from("realtor_profiles")
          .select("name, brokerage, photo_url")
          .ilike("email", realtorBrandEmail)
          .maybeSingle();
        if (rp && (rp.photo_url || rp.name)) {
          realtorBrand = {
            name: cleanText(rp.name),
            brokerage: cleanText(rp.brokerage),
            photo: rp.photo_url ? await imageUrlToDataUri(rp.photo_url, 360) : "",
          };
        }
      } catch {
        /* co-branding never blocks the report */
      }
    }

    // Company custom severity colors for the PDF badges/summary. Renamed/
    // recolored defaults are reflected; the resolver falls back to the built-in
    // hex if nothing custom is set.
    const severityConfig = await loadSeverityConfigForInspection(inspection?.id ?? id);
    const sevColors = {
      safety: resolveSeverity(severityConfig, "Safety Concern").color,
      repair: resolveSeverity(severityConfig, "Recommended Repair").color,
      maintenance: resolveSeverity(severityConfig, "Maintenance").color,
      info: resolveSeverity(severityConfig, "Informational").color,
    };

    const html = buildAgentReportHtml({
      inspection,
      findings,
      reportMode,
      propertyPhotoUrl,
      branding,
      qrCodeDataUrl,
      sevColors,
      standardsOfPractice,
      includeStandardsInPdf,
      clientNameOverride,
      clientEmailOverride,
      sectionOrder: activeSectionOrder,
      sectionNotes: sectionNotesMap,
      limitations,
      checklistBySection,
      referencePhotosBySection,
      disclaimers,
      equipment,
      realtorBrand,
    });
    const property = getPropertyAddress(inspection);

    const pdf = await renderHtmlToPdf(html);

    // Store the freshly built PDF so the next matching download is served from
    // cache instead of rebuilt. Best-effort — never blocks the response.
    if (pdfSignature) {
      try {
        await admin.storage
          .from("inspection-photos")
          .upload(pdfCachePath, pdf, { contentType: "application/pdf", upsert: true });
        await admin.from("report_pdf_cache").upsert(
          {
            inspection_id: String(inspectionId),
            variant: pdfVariant,
            signature: pdfSignature,
            storage_path: pdfCachePath,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "inspection_id,variant" },
        );
      } catch (cacheStoreError) {
        console.error("PDF cache store failed:", cacheStoreError);
      }
    }

    // The PDF takes ~10s to build. For public share-link downloads (token in the
    // URL, which is itself the access control), let Vercel's CDN cache the result
    // so repeat downloads are served instantly from the edge instead of being
    // regenerated — with stale-while-revalidate so it's instant after the first
    // download and refreshes in the background. Authenticated (numeric-id)
    // downloads stay private.
    const cacheControl = allowedByShareToken
      ? "public, max-age=120, s-maxage=600, stale-while-revalidate=86400"
      : "private, max-age=20, stale-while-revalidate=120";

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${getDownloadName(property, reportMode)}"`,
        "Cache-Control": cacheControl,
      },
    });
  } catch (error: any) {
    return reportErrorResponse(
      req,
      error?.message || "Could not download realtor report.",
      500,
    );
  }
}
