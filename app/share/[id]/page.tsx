import Link from "next/link";
import { loadSeverityConfigForInspection } from "../../../lib/severity/loadSeverityConfig";
import { severityBadgeStyle } from "../../../lib/severity/severityConfig";
import { headers } from "next/headers";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveReportSections } from "../../../lib/reportSections";
import { matchStandards } from "../../../lib/ai/standardsReference";
import { estimatePrognosis, deriveAgeYears } from "../../../lib/ai/serviceLife";
import { formatClockTime } from "../../../lib/app-time";
import PdfExportButton from "../../../components/PdfExportButton";
import ReportTimeTracker from "../../../components/ReportTimeTracker";
import ClientSummaryAccordion from "../../../components/ClientSummaryAccordion";
import FindingsSeverityFilter from "../../../components/FindingsSeverityFilter";
import ExpandableReportImage from "../../../components/ExpandableReportImage";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import ShareReportTabs from "../../../components/ShareReportTabs";
import Secure24ReferralCard from "../../../components/Secure24ReferralCard";
import InsuranceReferralCard from "../../../components/InsuranceReferralCard";
import SocialMediaConsentCard from "../../../components/SocialMediaConsentCard";
import { normalizeCompanyBranding } from "../../../lib/companyBranding";
import { sendPushNotification } from "../../../lib/push";
import { getReportDeliveryState } from "../../../lib/reportDelivery";
import { getSessionUser, authorizeInspection } from "../../../lib/apiAuth";
import { getInspectionShareToken, getOrCreateShareToken } from "../../../lib/shareToken";
import { isReportViewReload } from "../../../lib/reportViewThrottle";
import ReportLanguageSwitcher from "../../../components/ReportLanguageSwitcher";
import UiAutoTranslate from "../../../components/UiAutoTranslate";
import CommonGroundPanel from "../../../components/CommonGroundPanel";
import CommonGroundSummary from "../../../components/CommonGroundSummary";
import { classifyDefect } from "../../../lib/dealCatalog";
import { getPrevalenceMap, buildCommonGround, type CommonGround } from "../../../lib/dealInsights";
import { REPORT_UI_STRINGS } from "../../../lib/uiStrings";
import {
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  getReportTranslations,
  getUiTranslations,
  makeTranslator,
} from "../../../lib/translate";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);


// Hash an IP the same salted SHA-256 way as /api/public-profile-analytics so
// we never store or log a raw IP - only an opaque, per-inspection-comparable
// fingerprint used to tell a returning device from a new one.
function hashIp(value: string) {
  const salt =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "on-point-inspect";

  return crypto.createHash("sha256").update(`${value}:${salt}`).digest("hex");
}

// A short, human-readable device label parsed from the user-agent, e.g.
// "iPhone", "Android", "iPad", "Mac", "Windows PC", else "browser".
function getDeviceLabel(userAgent: string | null | undefined) {
  const ua = String(userAgent || "").toLowerCase();

  if (!ua) return "browser";
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android";
  if (ua.includes("windows")) return "Windows PC";
  if (ua.includes("macintosh") || ua.includes("mac os")) return "Mac";
  if (ua.includes("linux")) return "Linux";
  return "browser";
}

async function recordInspectionView({
  inspectionId,
  viewType,
  contactId,
  viewerRole,
  viewerEmail,
  viewerName,
  sharePathId,
  userAgent,
  ipHash,
}: {
  inspectionId: string | number;
  viewType: string;
  contactId?: string | null;
  viewerRole?: string | null;
  viewerEmail?: string | null;
  viewerName?: string | null;
  sharePathId?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
}) {
  try {
    const numericInspectionId = Number(inspectionId);

    if (!numericInspectionId || !Number.isFinite(numericInspectionId)) return;

    const baseRow: Record<string, any> = {
      inspection_id_bigint: numericInspectionId,
      view_type: viewType,
      contact_id: contactId || null,
      viewer_role: viewerRole || null,
      viewer_email: viewerEmail || null,
      path: `/public-report/${sharePathId || inspectionId}`,
      metadata: {
        source: "public_share_page",
        ...(viewerName ? { viewer_name: viewerName } : {}),
      },
    };

    // Best-effort: include the new attribution columns, but if the migration
    // (supabase/view-attribution.sql) has not been applied yet the insert would
    // 400 on the unknown columns and drop the whole view event. So try with the
    // columns and, on failure, retry without them - tracking must never break.
    const { error: insertError } = await supabase
      .from("inspection_view_events")
      .insert({
        ...baseRow,
        user_agent: userAgent || null,
        ip_hash: ipHash || null,
      });

    if (insertError) {
      await supabase.from("inspection_view_events").insert(baseRow);
    }

    // This insert bypasses /api/track-inspection-view, so it needs its own
    // push - otherwise report views via a public share link (which is how
    // realtors typically see a report) never notify the inspector at all.
    const { data: inspection } = await supabase
      .from("inspections")
      .select("id, inspector_id, property_address, address")
      .eq("id", numericInspectionId)
      .maybeSingle();

    if (inspection?.inspector_id) {
      const property =
        inspection.property_address || inspection.address || "your report";
      const role = String(viewerRole || "").trim().toLowerCase();
      const isRealtor = role.includes("realtor") || role.includes("agent") || role.includes("coordinator");
      const name = String(viewerName || "").trim();

      // Who opened it: a named tracking link wins, then role, then email.
      let viewerLabel: string;
      if (name) {
        viewerLabel = isRealtor ? `${name} (realtor)` : name;
      } else if (isRealtor) {
        viewerLabel = "A realtor";
      } else {
        viewerLabel = viewerEmail || "Someone";
      }

      // Device + returning-vs-first-view context, best-effort. Never let these
      // extra lookups throw and swallow the push.
      const deviceLabel = getDeviceLabel(userAgent);
      let seenBefore = false;
      if (ipHash) {
        try {
          const { data: priorView } = await supabase
            .from("inspection_view_events")
            .select("id")
            .eq("inspection_id_bigint", numericInspectionId)
            .eq("ip_hash", ipHash)
            .limit(1)
            .maybeSingle();
          seenBefore = Boolean(priorView);
        } catch (lookupError) {
          console.error("Return-viewer lookup error:", lookupError);
        }
      }

      const viewerContext = `${deviceLabel} · ${
        seenBefore ? "returning viewer" : "first view"
      }`;

      // Don't re-notify on reloads: skip the push if this same viewer already
      // opened this report within the last 30 minutes.
      const reload = await isReportViewReload(supabase, {
        inspectionId: numericInspectionId,
        ipHash,
        viewerEmail,
      });

      if (!reload) {
        await sendPushNotification({
          title: isRealtor ? "Realtor Viewed Report" : "Report Viewed",
          body: `${viewerLabel} opened ${property} (${viewerContext}).`,
          url: `/reports/${numericInspectionId}`,
          eventType: "report_share",
          target: "user",
          targetUserId: inspection.inspector_id,
        });
      }
    }
  } catch (error) {
    console.error("Share view tracking error:", error);
  }
}

const SECTION_ORDER = [
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
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

function getCompanyStandards(company: any) {
  const customBody = String(company?.standards_of_practice_body || "").trim();
  const customTitle = String(
    company?.standards_of_practice_title || "Standards of Practice"
  ).trim();

  if (customBody) {
    return [
      {
        title: customTitle || "Standards of Practice",
        body: customBody,
      },
    ];
  }

  return [...STANDARDS_OF_PRACTICE];
}

function shouldShowStandardsInShare(company: any) {
  return company?.standards_include_in_share !== false;
}


function normalizeSection(section: string | null | undefined) {
  if (!section) return "Inspection Details";

  const clean = section.trim();

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

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";

  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);

  if (index === -1) return "";

  const rawPath = url.substring(index + marker.length).split("?")[0].split("#")[0];

  return decodeURIComponent(rawPath);
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

function getServiceType(inspection: any) {
  return String(
    inspection?.service_mode ||
      inspection?.inspection_type ||
      inspection?.services ||
      ""
  ).toLowerCase();
}

function hasMoldService(inspection: any) {
  const serviceType = getServiceType(inspection);

  return serviceType.includes("mold") || inspection?.mold === true;
}

function hasRadonService(inspection: any) {
  const serviceType = getServiceType(inspection);

  return serviceType.includes("radon") || inspection?.radon === true;
}

function getPhotoStoragePath(photo: any) {
  return (
    photo?.file_path ||
    photo?.storage_path ||
    photo?.photo_path ||
    getStoragePathFromUrl(photo?.public_url) ||
    getStoragePathFromUrl(photo?.image_url) ||
    getStoragePathFromUrl(photo?.photo_url) ||
    ""
  );
}

function getFallbackPhotoUrl(photo: any) {
  return (
    photo?.signed_url ||
    photo?.public_url ||
    photo?.image_url ||
    photo?.photo_url ||
    photo?.url ||
    ""
  );
}

function isReportDefect(finding: any) {
  const section = String(finding?.section || "").toLowerCase().trim();
  const title = String(finding?.title || "").toLowerCase().trim();

  const nonDefectTitles = new Set([
    "in attendance",
    "occupancy",
    "style",
    "temperature",
    "type of building",
    "weather conditions",
  ]);

  if (section === "inspection details") return false;
  if (section === "disclaimers") return false;
  if (nonDefectTitles.has(title)) return false;

  // Section Reference Photos are stored in section_reference_photos,
  // not findings. This extra guard prevents old/misfiled reference
  // photo records from being counted as defects.
  if (title.includes("section reference photo")) return false;
  if (title.includes("reference photo")) return false;

  return true;
}

function getSeverityBucket(severityValue: any) {
  const severity = String(severityValue || "Recommended Repair").toLowerCase();

  if (
    severity.includes("safety") ||
    severity.includes("hazard") ||
    severity.includes("major")
  ) {
    return "safety";
  }

  if (severity.includes("repair") || severity.includes("defect")) {
    return "repair";
  }

  if (
    severity.includes("maintenance") ||
    severity.includes("monitor") ||
    severity.includes("minor")
  ) {
    return "maintenance";
  }

  if (
    severity.includes("information") ||
    severity.includes("info") ||
    severity.includes("client")
  ) {
    return "information";
  }

  return "repair";
}

function buildDefectTotals(findings: any[]) {
  return (findings || [])
    .filter(isReportDefect)
    .reduce(
      (acc: Record<string, number>, finding: any) => {
        const bucket = getSeverityBucket(finding.severity);

        if (bucket === "information") {
          acc.information += 1;
          return acc;
        }

        acc.total += 1;

        if (bucket === "safety") {
          acc.safety += 1;
        } else if (bucket === "maintenance") {
          acc.maintenance += 1;
        } else {
          acc.repair += 1;
        }

        return acc;
      },
      {
        total: 0,
        safety: 0,
        repair: 0,
        maintenance: 0,
        information: 0,
      }
    );
}

function getSeverityClass(severityValue: any) {
  const bucket = getSeverityBucket(severityValue);

  if (bucket === "safety") {
    return "border-red-500/50 bg-red-500/15 text-[var(--fl-crit-text)]";
  }

  if (bucket === "maintenance") {
    return "border-yellow-500/50 bg-yellow-500/15 text-[var(--fl-warn-text)]";
  }

  if (bucket === "information") {
    return "border-blue-500/50 bg-blue-500/15 text-[var(--fl-info-text)]";
  }

  return "border-teal-500/50 bg-teal-500/15 text-[var(--fl-accent-text)]";
}

function getRepairNumberTitle(finding: any) {
  const rawTitle = String(
    finding?.title ||
      finding?.finding_title ||
      finding?.defect_title ||
      finding?.name ||
      "Untitled Finding"
  ).trim();

  return rawTitle.replace(/^\d+\.\d+\.\d+\s*[-–—:]\s*/g, "");
}

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
    const sectionNumberRaw = sectionOrder.indexOf(section) + 1;
    const sectionNumber = sectionNumberRaw > 0 ? sectionNumberRaw : sectionOrder.length + 1;
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
      original_title: getRepairNumberTitle(finding),
      item_number: repairItemNumber,
      repair_item_number: repairItemNumber,
    };
  });
}

function getNumberedFindingTitle(finding: any) {
  const itemNumber = String(finding?.repair_item_number || finding?.item_number || "").trim();
  const title = getRepairNumberTitle(finding);

  return itemNumber ? `${itemNumber} - ${title}` : title;
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

function getFindingSummary(finding: any) {
  return (
    finding?.observation ||
    finding?.recommendation ||
    finding?.implication ||
    finding?.comment ||
    "Tap to view finding details."
  );
}

function getMediaUrl(media: any) {
  if (!media) return "";

  return (
    media?.signed_url ||
    media?.public_url ||
    media?.image_url ||
    media?.photo_url ||
    media?.video_url ||
    media?.url ||
    ""
  );
}

function getVideoPreviewSrc(url: string) {
  if (!url) return "";
  if (url.includes("#t=")) return url;
  return `${url}#t=0.1`;
}

function getMediaPreviewUrl(media: any) {
  if (!media) return "";

  const thumbnailUrl = String(
    media?.signed_thumbnail_url ||
      media?.thumbnail_url ||
      media?.poster_url ||
      media?.video_thumbnail_url ||
      ""
  ).trim();

  const fullUrl = getMediaUrl(media);

  // Some rows fall back signed_thumbnail_url to the full video URL.
  // Keep real image thumbnails, but do not try to render a video URL in an <img>.
  if (thumbnailUrl && thumbnailUrl !== fullUrl && !isVideoMedia(media, thumbnailUrl)) {
    return thumbnailUrl;
  }

  if (isVideoMedia(media, fullUrl)) {
    return "";
  }

  return fullUrl;
}

function getFindingPrimaryMedia(finding: any) {
  const photos = Array.isArray(finding?.photos) ? finding.photos : [];

  const imagePhoto = photos.find((photo: any) => {
    const url = getMediaUrl(photo);
    return url && !isVideoMedia(photo, url);
  });

  if (imagePhoto) return imagePhoto;

  const firstUsablePhoto = photos.find((photo: any) => getMediaUrl(photo));
  if (firstUsablePhoto) return firstUsablePhoto;

  const legacyUrl =
    finding?.signed_image_url ||
    finding?.image_url ||
    finding?.public_image_url ||
    "";

  if (!legacyUrl) return null;

  return {
    signed_url: legacyUrl,
    public_url: legacyUrl,
    image_url: legacyUrl,
    photo_url: legacyUrl,
    file_path:
      finding?.file_path ||
      finding?.storage_path ||
      finding?.photo_path ||
      finding?.image_path ||
      "",
    mime_type:
      finding?.mime_type ||
      finding?.media_type ||
      finding?.content_type ||
      finding?.file_type ||
      "",
    is_video: finding?.is_video || finding?.media_type === "video",
  };
}

function getFindingPhotoUrl(finding: any) {
  const primaryMedia = getFindingPrimaryMedia(finding);
  return getMediaUrl(primaryMedia);
}

function getFindingMediaList(finding: any) {
  const photos = Array.isArray(finding?.photos) ? finding.photos : [];

  const usablePhotos = photos.filter((photo: any) => Boolean(getMediaUrl(photo)));

  if (usablePhotos.length > 0) {
    return usablePhotos;
  }

  const primaryMedia = getFindingPrimaryMedia(finding);

  return primaryMedia && getMediaUrl(primaryMedia) ? [primaryMedia] : [];
}

function isVideoMedia(media: any, urlValue?: string) {
  const url = String(urlValue || "").toLowerCase();
  const path = String(
    media?.file_path ||
      media?.storage_path ||
      media?.photo_path ||
      media?.image_path ||
      ""
  ).toLowerCase();
  const type = String(
    media?.mime_type ||
      media?.media_type ||
      media?.content_type ||
      media?.file_type ||
      ""
  ).toLowerCase();

  return (
    Boolean(media?.is_video) ||
    Boolean(media?.video_url) ||
    type.startsWith("video/") ||
    type.includes("quicktime") ||
    path.match(/\.(mp4|mov|m4v|webm|avi|quicktime)$/) !== null ||
    url.match(/\.(mp4|mov|m4v|webm|avi|quicktime)(\?|$)/) !== null
  );
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_CACHE_TTL_MS = 1000 * 60 * 45;

async function createSignedUrlMap(paths: string[]) {
  const uniquePaths = Array.from(
    new Set(paths.filter((path) => Boolean(path)))
  );

  const signedMap: Record<string, string> = {};

  if (uniquePaths.length === 0) return signedMap;

  const now = Date.now();
  const missingPaths: string[] = [];

  uniquePaths.forEach((path) => {
    const cached = signedUrlCache.get(path);

    if (cached && cached.expiresAt > now) {
      signedMap[path] = cached.url;
      return;
    }

    missingPaths.push(path);
  });

  if (missingPaths.length === 0) return signedMap;

  const chunkSize = 50;

  await Promise.all(
    Array.from({ length: Math.ceil(missingPaths.length / chunkSize) }).map(
      async (_, chunkIndex) => {
        const chunk = missingPaths.slice(
          chunkIndex * chunkSize,
          chunkIndex * chunkSize + chunkSize
        );

        const { data, error } = await supabase.storage
          .from("inspection-photos")
          .createSignedUrls(chunk, 60 * 60 * 24 * 7);

        if (error) {
          console.error("Share batch signed photo error:", error);
          return;
        }

        (data || []).forEach((item: any, index: number) => {
          const path = item?.path || chunk[index];
          if (path && item?.signedUrl) {
            signedMap[path] = item.signedUrl;
            signedUrlCache.set(path, {
              url: item.signedUrl,
              expiresAt: now + SIGNED_URL_CACHE_TTL_MS,
            });
          }
        });
      }
    )
  );

  return signedMap;
}


async function createSignedImagePreviewUrlMap(paths: string[]) {
  const uniquePaths = Array.from(
    new Set(paths.filter((path) => Boolean(path))),
  );

  const signedMap: Record<string, string> = {};

  if (uniquePaths.length === 0) return signedMap;

  const chunkSize = 12;

  for (let index = 0; index < uniquePaths.length; index += chunkSize) {
    const chunk = uniquePaths.slice(index, index + chunkSize);

    await Promise.all(
      chunk.map(async (path) => {
        const { data, error } = await supabase.storage
          .from("inspection-photos")
          .createSignedUrl(path, 60 * 60 * 24 * 7, {
            transform: {
              width: 640,
              quality: 72,
              resize: "contain",
            },
          });

        if (error) {
          console.error("Share preview signed photo error:", {
            path,
            error,
          });
          return;
        }

        if (data?.signedUrl) {
          signedMap[path] = data.signedUrl;
        }
      }),
    );
  }

  return signedMap;
}

function isVideoPathOrPhoto(photo: any, pathValue: any = "") {
  const path = String(
    pathValue ||
      photo?.file_path ||
      photo?.storage_path ||
      photo?.photo_path ||
      photo?.image_path ||
      ""
  ).toLowerCase();

  const type = String(
    photo?.mime_type ||
      photo?.media_type ||
      photo?.content_type ||
      photo?.file_type ||
      ""
  ).toLowerCase();

  return (
    Boolean(photo?.is_video) ||
    Boolean(photo?.video_url) ||
    type.startsWith("video/") ||
    type.includes("quicktime") ||
    path.match(/\.(mp4|mov|m4v|webm|avi|quicktime)$/) !== null
  );
}

function groupChecklistRows(rows: any[]) {
  const grouped: Record<string, Record<string, any[]>> = {};

  (rows || []).forEach((row: any) => {
    const section = normalizeSection(row.section);
    if (!grouped[section]) grouped[section] = {};
    if (!grouped[section][row.group_title]) grouped[section][row.group_title] = [];
    grouped[section][row.group_title].push(row);
  });

  return grouped;
}

function groupLimitations(rows: any[], photosByLimitationId: Record<string, any[]>) {
  const grouped: Record<string, any[]> = {};

  (rows || []).forEach((row: any) => {
    const section = normalizeSection(row.section);
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push({
      ...row,
      section,
      photos: photosByLimitationId[row.id] || [],
    });
  });

  return grouped;
}


function isKnownEquipmentValue(value: any) {
  const clean = String(value ?? "").trim();
  const lower = clean.toLowerCase();

  if (!clean) return false;

  return ![
    "unknown",
    "n/a",
    "na",
    "not available",
    "not visible",
    "not readable",
    "unreadable",
    "unable to determine",
    "unable to confirm",
    "cannot determine",
    "not determined",
    "none",
    "null",
    "undefined",
  ].includes(lower);
}

function getTypicalIndustryRange(value: any) {
  const clean = String(value || "").trim();
  if (!isKnownEquipmentValue(clean)) return "";

  const rangeMatch = clean.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return `${rangeMatch[1]}–${rangeMatch[2]} years`;
  }

  const numberMatch = clean.match(/\d+/);
  if (!numberMatch) return clean;

  const upper = Number(numberMatch[0]);
  if (!Number.isFinite(upper) || upper <= 0) return clean;

  const lower = Math.max(1, upper - 5);
  return `${lower}–${upper} years`;
}

function getEquipmentConditionNote(value: any) {
  const clean = String(value || "").trim();
  const lower = clean.toLowerCase();

  if (!isKnownEquipmentValue(clean)) return "";

  if (
    lower.includes("remaining") ||
    lower.includes("service life") ||
    lower.includes("life remaining")
  ) {
    return "No specific deficiency noted";
  }

  return clean;
}

function getEquipmentInspectorNote(item: any) {
  return (
    item?.inspector_note ||
    item?.inspection_note ||
    item?.note ||
    item?.notes ||
    ""
  );
}

function getEquipmentMaintenanceNote(item: any) {
  return (
    item?.maintenance_note ||
    item?.maintenance ||
    item?.service_note ||
    ""
  );
}

// Percent of typical service life already used (age / max service life).
// 0 means age could not be determined, so treat it as unconfirmed and hide it
// rather than printing a misleading "0%" on the client's report.
function getEquipmentLifeUsed(item: any) {
  const num = Number(item?.life_expectancy_percent);
  if (!Number.isFinite(num) || num <= 0) return "";
  const capped = Math.min(Math.round(num), 150);
  return `About ${capped}% of typical service life`;
}

// Generic, low-risk maintenance cadence for the equipment category.
// Blank/unknown values are suppressed by the note block itself.
function getEquipmentMaintenanceSchedule(item: any) {
  return getEquipmentLongNote(item, [
    "maintenance_schedule",
    "recommended_maintenance",
  ]);
}








function getEquipmentLongNote(item: any, keys: string[]) {
  for (const key of keys) {
    const value = item?.[key];
    const clean = String(value || "").trim();

    if (isKnownEquipmentValue(clean)) {
      return clean;
    }
  }

  return "";
}

function ShareEquipmentLine({ label, value }: { label: string; value?: any }) {
  if (!isKnownEquipmentValue(value)) return null;

  return (
    <div className="flex flex-col gap-1 border-b border-[var(--fl-raised)] py-2 sm:flex-row sm:items-start sm:justify-between">
      <span className="text-xs font-bold uppercase tracking-wide text-[var(--fl-faint)]">
        {label}
      </span>
      <span className="whitespace-pre-line text-left text-sm font-semibold leading-6 text-[var(--fl-text)] sm:max-w-[70%] sm:text-right">
        {String(value)}
      </span>
    </div>
  );
}

function ShareEquipmentNoteBlock({
  label,
  value,
}: {
  label: string;
  value?: any;
}) {
  const clean = String(value || "").trim();

  if (!isKnownEquipmentValue(clean)) return null;

  return (
    <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--fl-text)]">
        {clean}
      </p>
    </div>
  );
}


function getEquipmentStatusValue(item: any) {
  const explicit =
    item?.equipment_status ||
    item?.equipmentStatus ||
    item?.status ||
    "";

  if (isKnownEquipmentValue(explicit)) return explicit;

  const condition = String(item?.condition || "").toLowerCase();
  const severity = String(item?.severity || "").toLowerCase();

  if (
    condition.includes("beyond") ||
    condition.includes("near end") ||
    severity.includes("repair") ||
    severity.includes("monitor")
  ) {
    return "⚠ Monitor / Budget for Replacement";
  }

  if (condition.includes("service") || condition.includes("repair")) {
    return "⚠ Service Recommended";
  }

  return "✓ No Specific Deficiency Noted";
}


function isHvacEquipmentItem(item: any) {
  const text = [
    item?.equipment_type,
    item?.equipmentType,
    item?.section,
    item?.manufacturer,
    item?.model,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return (
    text.includes("heat pump") ||
    text.includes("air handler") ||
    text.includes("condenser") ||
    text.includes("air conditioner") ||
    text.includes("ac condenser") ||
    text.includes("cooling") ||
    text.includes("furnace") ||
    text.includes("hvac")
  );
}

function getEquipmentStatusClass(value: any) {
  const clean = String(value || "").toLowerCase();

  if (clean.includes("no specific")) {
    return "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]";
  }

  if (clean.includes("monitor / budget") || clean.includes("replacement")) {
    return "border-red-500/50 bg-red-500/10 text-[var(--fl-crit-text)]";
  }

  if (clean.includes("service")) {
    return "border-orange-500/50 bg-orange-500/10 text-[var(--fl-warn-text)]";
  }

  if (clean.includes("monitor")) {
    return "border-yellow-500/50 bg-yellow-500/10 text-[var(--fl-warn-text)]";
  }

  return "border-cyan-500/40 bg-cyan-500/10 text-[var(--fl-info-text)]";
}

function EquipmentStatusBadge({ value }: { value?: any }) {
  if (!isKnownEquipmentValue(value)) return null;

  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${getEquipmentStatusClass(value)}`}>
      <span className="mr-2 text-xs uppercase tracking-wide opacity-80">
        Equipment Status
      </span>
      {String(value)}
    </div>
  );
}

export default async function PublicSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ defect_filter?: string; contact?: string; role?: string; email?: string; v?: string; viewer?: string; lang?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const shareLookup = resolvedParams.id;
  let inspectionId = shareLookup;

  const isDemo =
    resolvedSearchParams?.role === "demo";

  const requestedDefectFilter = String(
    resolvedSearchParams?.defect_filter || "all"
  ).toLowerCase();

  const activeDefectFilter = ["safety", "repair", "maintenance", "information"].includes(
    requestedDefectFilter
  )
    ? requestedDefectFilter
    : "all";

  const activeDefectFilterLabel: Record<string, string> = {
    all: "All Findings",
    safety: "Safety / Major",
    repair: "Recommended Repair",
    maintenance: "Maintenance / Monitor",
    information: "Informational",
  };

  const { data: inspectionByToken, error: tokenLookupError } = await supabase
    .from("inspections")
    .select("*")
    .eq("public_share_token", shareLookup)
    .maybeSingle();

  let inspection = inspectionByToken;
  let inspectionError = tokenLookupError;

  if (!inspection && /^\d+$/.test(shareLookup)) {
    const fallbackResult = await supabase
      .from("inspections")
      .select("*")
      .eq("id", shareLookup)
      .maybeSingle();

    inspection = fallbackResult.data;
    inspectionError = fallbackResult.error;
  }

  // Company custom severity colors/labels for the client-facing badges.
  const severityConfig = await loadSeverityConfigForInspection((inspection as any)?.id);

  // Client-report intelligence (standards references) must NEVER change a report
  // already delivered. Gate on the publish timestamp: reports published before
  // this feature launched render exactly as they did; drafts and reports
  // published after get the new references.
  const CLIENT_INTELLIGENCE_LAUNCH = new Date("2026-09-01T00:00:00Z");
  const publishedAtRaw = (inspection as any)?.published_at;
  const wasPublished = Boolean(
    (inspection as any)?.is_published || (inspection as any)?.published || publishedAtRaw,
  );
  const publishedAfterLaunch =
    Boolean(publishedAtRaw) && new Date(publishedAtRaw) >= CLIENT_INTELLIGENCE_LAUNCH;
  // Fail-safe: show only on not-yet-published drafts or reports confirmed
  // published after launch. A published report with no/earlier timestamp stays
  // frozen — never retroactively changed.
  const showClientIntelligence = publishedAfterLaunch || !wasPublished;

  if (inspection) {
    inspectionId = String(inspection.id);
  }

  if (inspectionError || !inspection) {
    return (
      <main className="min-h-screen bg-[var(--fl-ground)] p-10 text-[var(--fl-text)]">
        Report not found.
      </main>
    );
  }

  // --- Delivery gate (audit findings C3, H10) -----------------------------
  // A real client report is only viewable once it is deliverable: published
  // AND (payment + required agreements complete, OR an owner/inspector set the
  // "Deliver anyway" override). Public demo reports and inspector sample
  // reports stay open, and the owning inspector/owner can always preview an
  // undelivered report.
  let allowShareView = isDemo || (inspection as any).is_demo === true;

  if (!allowShareView) {
    const { data: sampleRow } = await supabase
      .from("public_sample_reports")
      .select("inspection_id")
      .eq("inspection_id", inspectionId)
      .maybeSingle();
    if (sampleRow) allowShareView = true;
  }

  if (!allowShareView) {
    const delivery = await getReportDeliveryState(supabase, inspection as any);

    if (delivery.deliverable) {
      allowShareView = true;
    } else {
      const viewer = await getSessionUser();
      if (viewer) {
        const owned = await authorizeInspection(supabase, viewer.id, inspectionId);
        if (owned) allowShareView = true;
      }
    }
  }

  if (!allowShareView) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--fl-ground)] p-6 text-[var(--fl-text)]">
        <div className="max-w-md rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-8 text-center">
          <h1 className="text-2xl font-semibold text-[var(--fl-accent-text)]">
            Report not available yet
          </h1>
          <p className="mt-3 leading-7 text-[var(--fl-muted)]">
            This inspection report hasn&apos;t been released for viewing yet.
            Once your inspector completes delivery, this link will show your
            full report. Please contact your inspector if you believe this is a
            mistake.
          </p>
        </div>
      </main>
    );
  }

  // Guarantee a share token so the report DOWNLOAD link is token-based. Without
  // one, sharePathId falls back to the numeric id and the download route rejects
  // the (unauthenticated) client with "This download link requires a valid
  // shared report link". supabase here is the service-role client.
  if (!getInspectionShareToken(inspection)) {
    const ensured = await getOrCreateShareToken(supabase, inspection);
    if (ensured && ensured !== String(inspection.id)) {
      inspection.public_share_token = ensured;
    }
  }

  const sharePathId = String(
    inspection.public_share_token ||
      inspection.share_token ||
      inspection.report_share_token ||
      shareLookup
  );

  if (!isDemo) {
    // Capture the request device (user-agent) and a hashed client IP so the
    // owner's push can name the device and flag returning viewers. Best-effort:
    // never let header/hash work break the page.
    let requestUserAgent: string | null = null;
    let requestIpHash: string | null = null;
    try {
      const requestHeaders = await headers();
      requestUserAgent = requestHeaders.get("user-agent") || null;
      const forwardedFor = requestHeaders.get("x-forwarded-for") || "";
      const rawIp =
        forwardedFor.split(",")[0]?.trim() ||
        requestHeaders.get("x-real-ip")?.trim() ||
        "";
      requestIpHash = rawIp ? hashIp(rawIp) : null;
    } catch (headerError) {
      console.error("Share view header capture error:", headerError);
    }

    const viewerName = String(
      resolvedSearchParams?.v || resolvedSearchParams?.viewer || ""
    ).trim();

    await recordInspectionView({
      inspectionId,
      viewType: "report_share",
      contactId: resolvedSearchParams?.contact || null,
      viewerRole: resolvedSearchParams?.role || null,
      viewerEmail: resolvedSearchParams?.email || null,
      viewerName: viewerName || null,
      sharePathId,
      userAgent: requestUserAgent,
      ipHash: requestIpHash,
    });
  }

  const { data: findingsRaw, error: findingsError } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  const { data: reportSectionsRaw } = await supabase
    .from("report_section_overrides")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("sort_order", { ascending: true });

  // Per-section notes written by the inspector, shown above each section.
  const { data: sectionNotesRaw } = await supabase
    .from("report_section_notes")
    .select("section_name, notes")
    .eq("inspection_id", inspectionId);

  const notesBySection: Record<string, string> = {};
  for (const row of sectionNotesRaw || []) {
    if (row?.section_name && String(row.notes || "").trim()) {
      notesBySection[row.section_name] = row.notes;
    }
  }

  const activeSectionOrder = resolveReportSections({
    overrides: reportSectionsRaw || [],
    customOrder: (inspection as any).report_section_order,
    serviceMode: inspection.service_mode,
    templateSections: (inspection as any).template_sections,
  });

  if (findingsError) {
    return (
      <main className="min-h-screen bg-[var(--fl-ground)] p-10 text-[var(--fl-text)]">
        Error loading report findings.
      </main>
    );
  }

  const findingIds = (findingsRaw || []).map((finding: any) => finding.id);

  // Supabase caps a single query at 1000 rows. Photo-heavy inspections exceed
  // that, which silently truncated later findings' media (videos, added last, got
  // cut first) — so page through until every photo/video row is loaded.
  let photosRaw: any[] = [];
  let photosError: any = null;
  if (findingIds.length > 0) {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("photos")
        .select("*")
        .in("finding_id", findingIds)
        // NOTE: the photos table has no sort_order column. Ordering by it makes
        // PostgREST 400 and return ZERO rows, which silently drops every photo
        // and video from the client report (findings fall back to their single
        // legacy image_url). Order by created_at only.
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        photosError = error;
        break;
      }
      photosRaw = photosRaw.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
  }

  if (photosError) {
    console.error("Share photos load error:", photosError);
  }

  const photoStoragePaths = (photosRaw || [])
    .map((photo: any) => getPhotoStoragePath(photo))
    .filter(Boolean);

  const photoThumbnailPaths = (photosRaw || [])
    .map((photo: any) => photo.thumbnail_path)
    .filter(Boolean);


  const oldFindingImagePaths = (findingsRaw || [])
    .map((finding: any) => getStoragePathFromUrl(finding.image_url))
    .filter(Boolean);

  const signedUrlMap = await createSignedUrlMap([
    ...photoStoragePaths,
    ...oldFindingImagePaths,
  ]);

  const signedThumbnailUrlMap = await createSignedUrlMap(photoThumbnailPaths);

  const legacyPhotoPreviewPaths = (photosRaw || [])
    .filter((photo: any) => !photo.thumbnail_path)
    .map((photo: any) => getPhotoStoragePath(photo))
    .filter((path: string) => Boolean(path) && !isVideoPathOrPhoto({}, path));

  const signedPreviewUrlMap = await createSignedImagePreviewUrlMap([
    ...legacyPhotoPreviewPaths,
    ...oldFindingImagePaths,
  ]);

  const photosWithUrls = (photosRaw || []).map((photo: any) => {
    const path = getPhotoStoragePath(photo);

    const fastUrl = getFallbackPhotoUrl(photo);

    return {
      ...photo,
      signed_url: (path && signedUrlMap[path]) || fastUrl || "",
      signed_thumbnail_url:
        (photo.thumbnail_path && signedThumbnailUrlMap[photo.thumbnail_path]) ||
        photo.thumbnail_url ||
        (path && signedPreviewUrlMap[path]) ||
        (path && signedUrlMap[path]) ||
        fastUrl ||
        "",
      signed_preview_url:
        (path && signedPreviewUrlMap[path]) ||
        (photo.thumbnail_path && signedThumbnailUrlMap[photo.thumbnail_path]) ||
        photo.thumbnail_url ||
        "",
    };
  });

  const photosByFindingId = photosWithUrls.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.finding_id) return acc;
      if (!acc[photo.finding_id]) acc[photo.finding_id] = [];
      acc[photo.finding_id].push(photo);
      return acc;
    },
    {}
  );

  const findings = (findingsRaw || []).map((finding: any) => {
    const oldImagePath = getStoragePathFromUrl(finding.image_url);
    const signedImageUrl =
      (oldImagePath && signedUrlMap[oldImagePath]) ||
      finding.signed_image_url ||
      finding.public_image_url ||
      finding.image_url ||
      null;

    return {
      ...finding,
      section: normalizeSection(finding.section),
      signed_image_url: signedImageUrl,
      signed_preview_image_url:
        (oldImagePath && signedPreviewUrlMap[oldImagePath]) ||
        finding.signed_preview_image_url ||
        finding.signed_thumbnail_url ||
        null,
      image_url: signedImageUrl || finding.image_url || null,
      photos: photosByFindingId[finding.id] || [],
    };
  });

  // #23 Multi-language: when a supported non-English language is requested,
  // translate the report's client-facing text ONCE (cached in
  // report_translations) and apply it in place, so every downstream render —
  // findings, summary groups, section notes — shows the translated report with
  // no changes to the rendering code. The English report stays the source.
  // The client's explicit choice wins; otherwise fall back to the company's
  // default report language (set at signup / in Settings).
  const explicitLang = String((resolvedSearchParams as any)?.lang || "")
    .trim()
    .toLowerCase();
  let companyDefaultLang = "en";
  try {
    if (inspection.company_id) {
      const { data: co } = await supabase
        .from("companies")
        .select("preferred_language")
        .eq("id", inspection.company_id)
        .maybeSingle();
      companyDefaultLang = String((co as any)?.preferred_language || "en").toLowerCase();
    }
  } catch {
    companyDefaultLang = "en";
  }
  const requestedLang = explicitLang || companyDefaultLang || "en";
  const isTranslated =
    Boolean(requestedLang) && requestedLang !== "en" && isSupportedLanguage(requestedLang);
  let uiTranslationMap: Record<string, string> = {};
  if (isTranslated) {
    const sources: string[] = [];
    for (const f of findings) {
      sources.push(
        f.title, f.observation, f.implication, f.recommendation, f.location, f.comment,
      );
    }
    for (const k of Object.keys(notesBySection)) sources.push(notesBySection[k]);
    if (inspection.executive_summary) sources.push(inspection.executive_summary);

    const tmap = await getReportTranslations(
      supabase,
      inspectionId,
      requestedLang,
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
    for (const k of Object.keys(notesBySection)) notesBySection[k] = t(notesBySection[k]);
    if (inspection.executive_summary) {
      inspection.executive_summary = t(inspection.executive_summary);
    }

    // UI chrome labels (buttons/tabs/headers) — translated once per language,
    // cached globally, and applied client-side by exact match.
    try {
      uiTranslationMap = await getUiTranslations(supabase, requestedLang, REPORT_UI_STRINGS);
    } catch {
      uiTranslationMap = {};
    }
  }

  const numberedFindings = addRepairItemNumbers(findings, activeSectionOrder);

  // Common Ground (deal insights): classify each finding to a canonical defect
  // type, look up its prevalence (national + this state), and build the panel
  // data keyed by finding id (robust to any downstream copying of findings).
  const commonGroundById = new Map<string, CommonGround>();
  let showCommonGroundCosts = false;
  if (inspection.company_id) {
    try {
      const { data: cgSettings } = await supabase
        .from("companies")
        .select("show_common_ground, show_common_ground_costs")
        .eq("id", inspection.company_id)
        .maybeSingle();
      const cgOn = (cgSettings as any)?.show_common_ground !== false; // default on
      showCommonGroundCosts = Boolean((cgSettings as any)?.show_common_ground_costs);
      if (cgOn) {
        const typed = findings.map((f: any) => ({
          f,
          dt: f.defect_type || classifyDefect(f),
        }));
        const types = typed.map((x) => x.dt).filter(Boolean) as string[];
        const prevMap = await getPrevalenceMap(supabase, types, inspection.state);
        for (const { f, dt } of typed) {
          if (!dt) continue;
          const cg = buildCommonGround({ defect_type: dt, severity: f.severity }, prevMap, inspection.state);
          if (cg) commonGroundById.set(String(f.id), cg);
        }
      }
    } catch {
      /* Common Ground never blocks the report */
    }
  }

  const cgValues = Array.from(commonGroundById.values());
  const cgSummary = cgValues.length
    ? {
        total: cgValues.length,
        standsOut: cgValues.filter((c) => c.standsOut).length,
        routine: cgValues.filter((c) => c.tier === "common" || c.tier === "typical").length,
        uncommon: cgValues.filter((c) => c.tier === "uncommon").length,
      }
    : null;

  const { data: checklistRows } = await supabase
    .from("section_checklist_selections")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  const { data: limitationRows } = await supabase
    .from("section_limitations")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  const limitationIds = (limitationRows || []).map((item: any) => item.id);

  const { data: limitationPhotosRaw } =
    limitationIds.length > 0
      ? await supabase
          .from("limitation_photos")
          .select("*")
          .in("limitation_id", limitationIds)
      : { data: [] };

  // limitation_photos has no file_path column - it stores photo_url (full
  // size) and thumbnail_path/thumbnail_url instead. The inspection-photos
  // bucket is private, so photo_url's "public" URL 404s if used directly -
  // derive the real storage path from it and sign it, same as every other
  // photo table.
  const limitationPhotoPaths = (limitationPhotosRaw || [])
    .map((photo: any) => getStoragePathFromUrl(photo.photo_url))
    .filter(Boolean);

  const limitationThumbnailPaths = (limitationPhotosRaw || [])
    .map((photo: any) => photo.thumbnail_path)
    .filter(Boolean);

  const limitationSignedUrlMap = await createSignedUrlMap(limitationPhotoPaths);
  const limitationThumbnailSignedUrlMap = await createSignedUrlMap(limitationThumbnailPaths);

  const limitationPhotosWithUrls = (limitationPhotosRaw || []).map((photo: any) => {
    const photoPath = getStoragePathFromUrl(photo.photo_url);

    return {
      ...photo,
      signed_url:
        (photoPath && limitationSignedUrlMap[photoPath]) ||
        (photo.thumbnail_path && limitationThumbnailSignedUrlMap[photo.thumbnail_path]) ||
        "",
      signed_thumbnail_url:
        (photo.thumbnail_path && limitationThumbnailSignedUrlMap[photo.thumbnail_path]) ||
        (photoPath && limitationSignedUrlMap[photoPath]) ||
        "",
    };
  });

  const photosByLimitationId = limitationPhotosWithUrls.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.limitation_id) return acc;
      if (!acc[photo.limitation_id]) acc[photo.limitation_id] = [];
      acc[photo.limitation_id].push(photo);
      return acc;
    },
    {}
  );

  const checklistBySection = groupChecklistRows(checklistRows || []);
  const limitationsBySection = groupLimitations(
    limitationRows || [],
    photosByLimitationId
  );

  const { data: sectionReferencePhotosRaw } = await supabase
    .from("section_reference_photos")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  const referencePhotoPaths = (sectionReferencePhotosRaw || [])
    .map((photo: any) => photo.file_path)
    .filter(Boolean);

  const referenceThumbnailPaths = (sectionReferencePhotosRaw || [])
    .map((photo: any) => photo.thumbnail_path)
    .filter(Boolean);

  const referenceSignedUrlMap = await createSignedUrlMap(referencePhotoPaths);
  const referenceThumbnailSignedUrlMap = await createSignedUrlMap(referenceThumbnailPaths);

  const sectionReferencePhotos = (sectionReferencePhotosRaw || []).map(
    (photo: any) => ({
      ...photo,
      section: normalizeSection(photo.section),
      signed_url:
        (photo.file_path && referenceSignedUrlMap[photo.file_path]) ||
        photo.signed_url ||
        photo.public_url ||
        "",
      signed_thumbnail_url:
        (photo.thumbnail_path && referenceThumbnailSignedUrlMap[photo.thumbnail_path]) ||
        photo.thumbnail_url ||
        (photo.file_path && referenceSignedUrlMap[photo.file_path]) ||
        photo.signed_url ||
        photo.public_url ||
        "",
    })
  );

  const referencePhotosBySection = sectionReferencePhotos.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.section) return acc;
      if (!acc[photo.section]) acc[photo.section] = [];
      acc[photo.section].push(photo);
      return acc;
    },
    {}
  );

  const { data: reportDisclaimers } = await supabase
    .from("report_disclaimers")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  // Realtor co-branding: if the report's agent set up a profile (photo/name/
  // brokerage in the Realtor Portal), surface it on the report. Best-effort.
  const realtorBrandingEmail = String(
    inspection.realtor_email ||
      inspection.agent_email ||
      inspection.buyer_agent_email ||
      inspection.buyers_agent_email ||
      "",
  ).toLowerCase().trim();
  let realtorBranding: { name: string; brokerage: string; photo_url: string } | null = null;
  if (realtorBrandingEmail) {
    const { data: rp } = await supabase
      .from("realtor_profiles")
      .select("name, brokerage, photo_url")
      .ilike("email", realtorBrandingEmail)
      .maybeSingle();
    if (rp && (rp.photo_url || rp.name)) realtorBranding = rp as any;
  }

  const { data: standardsCompany } = inspection?.company_id
    ? await supabase
        .from("companies")
        .select("*")
        .eq("id", inspection.company_id)
        .maybeSingle()
    : { data: null };

  const standardsOfPractice = getCompanyStandards(standardsCompany);
  const showStandardsInShare = shouldShowStandardsInShare(standardsCompany);
  const branding = normalizeCompanyBranding(standardsCompany);

  // Secure 24 home-security referral: only offer it when the OWNING inspector
  // turned it on, this is a real delivered report (not a demo/sample), and it
  // has a share token to opt in against. Off by default at every level.
  let secure24Enabled = false;
  let secure24AlreadyRequested = false;
  const secure24Token = getInspectionShareToken(inspection);
  if (allowShareView && !isDemo && inspection?.inspector_id && secure24Token) {
    const { data: s24Setting } = await supabase
      .from("secure24_settings")
      .select("enabled")
      .eq("user_id", inspection.inspector_id)
      .maybeSingle();
    secure24Enabled = s24Setting?.enabled === true;

    if (secure24Enabled) {
      const { data: s24Lead } = await supabase
        .from("secure24_leads")
        .select("id")
        .eq("inspection_id", inspection.id)
        .eq("status", "submitted")
        .maybeSingle();
      secure24AlreadyRequested = Boolean(s24Lead?.id);
    }
  }

  const { data: equipmentInventoryRaw, error: equipmentInventoryError } = await supabase
    .from("equipment_inventory")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  if (equipmentInventoryError) {
    console.error("Share equipment inventory load error:", equipmentInventoryError);
  }

  const equipmentPhotoPaths = (equipmentInventoryRaw || [])
    .map((item: any) => item.file_path)
    .filter(Boolean);

  const equipmentThumbnailPaths = (equipmentInventoryRaw || [])
    .map((item: any) => item.thumbnail_path)
    .filter(Boolean);

  const equipmentSignedUrlMap = await createSignedUrlMap(equipmentPhotoPaths);
  const equipmentThumbnailSignedUrlMap = await createSignedUrlMap(equipmentThumbnailPaths);

  const equipmentInventory = (equipmentInventoryRaw || []).map((item: any) => ({
    ...item,
    signed_image_url:
      (item.file_path && equipmentSignedUrlMap[item.file_path]) ||
      item.signed_image_url ||
      item.image_url ||
      item.public_url ||
      "",
    signed_thumbnail_url:
      (item.thumbnail_path && equipmentThumbnailSignedUrlMap[item.thumbnail_path]) ||
      item.thumbnail_url ||
      (item.file_path && equipmentSignedUrlMap[item.file_path]) ||
      item.signed_image_url ||
      item.image_url ||
      item.public_url ||
      "",
  }));

  const { data: moldTest } = await supabase
    .from("mold_tests")
    .select("*")
    .eq("inspection_id", inspectionId)
    .maybeSingle();

  const { data: radonTest } = await supabase
    .from("radon_tests")
    .select("*")
    .eq("inspection_id", inspectionId)
    .maybeSingle();

  const moldReportUrl = moldTest?.lab_report_url || "";
  const radonReportUrl = radonTest?.report_url || "";
  const hasMold = hasMoldService(inspection);
  const hasRadon = hasRadonService(inspection);
  // FLOW's own mold/radon sampling report (environmental-share) is always
  // reachable once that service was performed, whether or not the raw
  // third-party lab file has been uploaded yet - the client shouldn't need
  // a separate link the inspector has to remember to send.
  const showEnvironmentalLinks = hasMold || hasRadon;

  const rawPropertyPhoto = getPropertyPhoto(inspection);
  let propertyPhoto = rawPropertyPhoto;

  const propertyPhotoPath =
    inspection?.property_photo_path ||
    inspection?.property_photo_storage_path ||
    inspection?.cover_photo_path ||
    inspection?.storage_path ||
    getStoragePathFromUrl(rawPropertyPhoto);

  if (propertyPhotoPath) {
    const propertyPhotoSignedMap = await createSignedUrlMap([propertyPhotoPath]);
    propertyPhoto = propertyPhotoSignedMap[propertyPhotoPath] || propertyPhoto;
  }

  const defectTotals = buildDefectTotals(numberedFindings);

  const clientSummaryGroups = [
    {
      key: "safety",
      title: "Safety / Major Concerns",
      description: "Items that may involve safety, injury, fire, shock, fall, structural, or major system concerns.",
      tone: "red" as const,
      findings: numberedFindings.filter(
        (finding: any) =>
          isReportDefect(finding) && getSeverityBucket(finding.severity) === "safety"
      ),
    },
    {
      key: "repair",
      title: "Recommended Repairs",
      description: "Defects or damaged components where correction, repair, or further evaluation is recommended.",
      tone: "teal" as const,
      findings: numberedFindings.filter(
        (finding: any) =>
          isReportDefect(finding) && getSeverityBucket(finding.severity) === "repair"
      ),
    },
    {
      key: "maintenance",
      title: "Maintenance / Monitor",
      description: "Routine maintenance items, minor concerns, or conditions that should be watched over time.",
      tone: "yellow" as const,
      findings: numberedFindings.filter(
        (finding: any) =>
          isReportDefect(finding) && getSeverityBucket(finding.severity) === "maintenance"
      ),
    },
    {
      key: "information",
      title: "Informational",
      description: "Client awareness items that are documented but not counted as report defects.",
      tone: "blue" as const,
      findings: numberedFindings.filter(
        (finding: any) =>
          isReportDefect(finding) && getSeverityBucket(finding.severity) === "information"
      ),
    },
  ].filter((group) => group.findings.length > 0);

  // Render every finding; the in-page severity filter (FindingsSeverityFilter)
  // hides non-matching ones instantly via CSS. activeDefectFilter is only the
  // initial state, from a ?defect_filter deep-link.
  const displayFindings = numberedFindings;

  // getSeverityBucket already returns the slug ("safety" | "repair" |
  // "maintenance" | "information") the filter chips use, so this is a passthrough
  // that keeps data-sev exactly aligned with the badge each finding displays.
  const findingSeveritySlug = (finding: any) => getSeverityBucket(finding.severity);
  const severityFilterCounts: Record<string, number> = {
    all: 0, safety: 0, repair: 0, maintenance: 0, information: 0,
  };
  for (const finding of numberedFindings) {
    if (!isReportDefect(finding)) continue;
    severityFilterCounts.all += 1;
    severityFilterCounts[findingSeveritySlug(finding)] += 1;
  }

  // Instant severity filter: hide non-matching findings + empty sections based
  // on the container's data-filter (set by FindingsSeverityFilter). Uses :has()
  // for the empty-section case (modern browsers); findings-level hiding works
  // everywhere. Rendered server-side so ?defect_filter deep-links have no flash.
  const FINDINGS_FILTER_CSS = `
    #inspection-findings[data-filter="safety"] [data-finding]:not([data-sev="safety"]),
    #inspection-findings[data-filter="repair"] [data-finding]:not([data-sev="repair"]),
    #inspection-findings[data-filter="maintenance"] [data-finding]:not([data-sev="maintenance"]),
    #inspection-findings[data-filter="information"] [data-finding]:not([data-sev="information"]) { display: none !important; }
    #inspection-findings[data-filter="safety"] [data-finding-section]:not(:has([data-finding][data-sev="safety"])),
    #inspection-findings[data-filter="repair"] [data-finding-section]:not(:has([data-finding][data-sev="repair"])),
    #inspection-findings[data-filter="maintenance"] [data-finding-section]:not(:has([data-finding][data-sev="maintenance"])),
    #inspection-findings[data-filter="information"] [data-finding-section]:not(:has([data-finding][data-sev="information"])) { display: none !important; }
  `;

  const groupedFindings = activeSectionOrder.map((section) => ({
    section,
    findings: displayFindings.filter((finding: any) => finding.section === section),
  })).filter((group) => {
    const hasFindings = group.findings.length > 0;
    const hasReferencePhotos =
      (referencePhotosBySection[group.section] || []).length > 0;
    const hasChecklistInfo = Boolean(checklistBySection[group.section]);
    const hasLimitations =
      (limitationsBySection[group.section] || []).length > 0;
    const hasNote = Boolean(notesBySection[group.section]);

    return hasFindings || hasReferencePhotos || hasChecklistInfo || hasLimitations || hasNote;
  });

  const otherFindings = displayFindings.filter(
    (finding: any) => !activeSectionOrder.includes(finding.section)
  );

  if (otherFindings.length > 0) {
    groupedFindings.push({
      section: "Other",
      findings: otherFindings,
    });
  }

  const sectionStats = activeSectionOrder.map((section) => ({
    section,
    defectCount: numberedFindings.filter(
      (finding: any) =>
        finding.section === section && isReportDefect(finding)
    ).length,
    findingCount: numberedFindings.filter(
      (finding: any) => finding.section === section
    ).length,
    referenceCount: referencePhotosBySection[section]?.length || 0,
  }));

  const address =
    inspection.property_address || inspection.address || "Property Address Not Entered";

  const viewerRole = String(resolvedSearchParams?.role || "").toLowerCase();
  const viewerEmail = String(resolvedSearchParams?.email || "").trim();
  const viewerContact = String(resolvedSearchParams?.contact || "").trim();

  const canOpenInternalReportActions =
    !viewerRole || viewerRole === "inspector" || viewerRole === "owner";

  const canOpenEditableReport = canOpenInternalReportActions;

  function buildShareHref(extra: Record<string, string> = {}) {
    const params = new URLSearchParams();

    Object.entries({
      role: viewerRole,
      email: viewerEmail,
      contact: viewerContact,
      ...extra,
    }).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const query = params.toString();

    return `/share/${sharePathId}${query ? `?${query}` : ""}`;
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html {
              scroll-padding-top: 180px;
            }

            @media (min-width: 768px) {
              html {
                scroll-padding-top: 220px;
              }
            }

            [id] {
              scroll-margin-top: 180px;
            }

            @media (min-width: 768px) {
              [id] {
                scroll-margin-top: 220px;
              }
            }

            button,
            a,
            summary {
              touch-action: manipulation;
              -webkit-tap-highlight-color: transparent;
            }

            button:active,
            a:active,
            summary:active {
              opacity: 0.86;
            }
          `,
        }}
      />

      <main className="min-h-screen w-full overflow-x-hidden bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] md:p-8">
      {!isDemo && (
        <ReportTimeTracker
          inspectionId={String(inspectionId)}
          viewerRole={resolvedSearchParams?.role || null}
          viewerEmail={resolvedSearchParams?.email || null}
          path={`/share/${sharePathId}`}
        />
      )}

      <div className="mx-auto w-full max-w-[96rem] overflow-x-hidden rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] shadow-2xl">
        <section className="relative overflow-hidden border-b border-[var(--fl-raised)] bg-[var(--fl-ground)]">
          {propertyPhoto ? (
            <>
              <img
                src={propertyPhoto}
                alt="Property"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="h-[360px] w-full object-cover md:h-[520px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--fl-surface)] via-[var(--fl-surface)] to-black/20" />
            </>
          ) : (
            <div className="h-[320px] bg-gradient-to-br from-[var(--fl-surface)] via-[var(--fl-surface)] to-[var(--fl-surface)]" />
          )}

          <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
            <div className="max-w-5xl">
              <p className="text-xs font-semibold uppercase tracking-[0.38em] text-[var(--fl-accent-text)]">
                {branding.name}
              </p>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--fl-text)] md:text-6xl">
                Residential Home Inspection Report
              </h1>

              <p className="mt-4 max-w-3xl text-lg font-semibold leading-8 text-[var(--fl-text)]">
                {address}
              </p>

              <p className="mt-2 text-sm text-[var(--fl-muted)]">
                Protecting Your Investment. One Inspection at a Time.
              </p>
            </div>
          </div>
        </section>

        <div className="p-5 md:p-10">
          {isDemo && (
            <div className="mb-8 rounded-2xl border border-fuchsia-500/40 bg-fuchsia-500/10 p-5 text-[var(--fl-purple-text)] print:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fl-purple-text)]">
                Demo Report
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--fl-purple-text)]">
                This is a public sample report. Client, realtor, agreement, payment, and editable report actions are hidden.
              </p>
            </div>
          )}

          {isTranslated && <UiAutoTranslate map={uiTranslationMap} />}
          {!isDemo && (
            <div className="mb-3 print:hidden">
              <ReportLanguageSwitcher
                languages={SUPPORTED_LANGUAGES.map((l) => ({ code: l.code, label: l.label }))}
                current={requestedLang || "en"}
              />
            </div>
          )}
          {isTranslated && (
            <p className="mb-3 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs text-[var(--fl-accent-text)] print:hidden">
              This report has been translated by AI for your convenience. The original English
              report is the official document.
            </p>
          )}
          <div className="mb-8 flex flex-wrap gap-3 print:hidden">
            <PdfExportButton />

            {/* href must be the share token, not the numeric id. This page is
                public, and the download route only accepts a numeric id from a
                logged-in user — so passing inspectionId 401'd for every
                anonymous client and realtor opening a shared link. */}
            {!isDemo && (
              <ReportDownloadButton
                href={`/api/realtor-report-download/${encodeURIComponent(sharePathId)}?type=full${isTranslated ? `&lang=${encodeURIComponent(requestedLang)}` : ""}`}
                filename={`inspection-report-${inspectionId}.pdf`}
                preparingText="Preparing PDF..."
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-cyan-500 bg-cyan-500/10 px-5 py-3 font-bold text-[var(--fl-info-text)] transition active:scale-[0.98] active:opacity-80 [touch-action:manipulation] hover:bg-cyan-500 hover:text-black"
              >
                <><span aria-hidden="true">⬇</span> Download Report</>
              </ReportDownloadButton>
            )}

            {!isDemo && (
              <a
                href={`/my-home/${encodeURIComponent(sharePathId)}`}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-emerald-500 bg-emerald-500/10 px-5 py-3 font-bold text-[var(--fl-good-text)] transition active:scale-[0.98] [touch-action:manipulation] hover:bg-emerald-500 hover:text-black"
              >
                <span aria-hidden="true">🏠</span> Home Maintenance Hub
              </a>
            )}

            {!isDemo && canOpenInternalReportActions && (
              <>
                <a
                  href={clientSummaryGroups.length > 0 ? "#client-summary" : "#inspection-findings"}
                  className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-[var(--fl-accent-text)] transition hover:bg-teal-500 hover:text-black"
                >
                  View Summary
                </a>

                <Link
                  href={`/client-portal/${inspectionId}`}
                  className="rounded-xl border border-emerald-500 px-5 py-3 font-bold text-[var(--fl-good-text)] transition hover:bg-emerald-500/10"
                >
                  Client Portal
                </Link>

                {canOpenEditableReport ? (
                  <Link
                    href={`/reports/${inspectionId}`}
                    className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)]"
                  >
                    Full Editable Report
                  </Link>
                ) : null}
              </>
            )}
          </div>

          <section className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">
                  Report Ready
                </p>
                <h2 className="mt-2 text-3xl font-semibold text-[var(--fl-text)]">
                  Inspection Overview
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
                  This report includes inspection information, limitations,
                  disclaimers, section reference photos, and documented findings.
                  Reference photos are documentation only and are not counted as defects.
                </p>
              </div>

              <div className="rounded-2xl border border-teal-500/40 bg-teal-500/10 px-6 py-4 text-center">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--fl-accent-text)]">
                  Total Defects
                </p>
                <p className="mt-1 text-5xl font-semibold text-[var(--fl-text)]">
                  {defectTotals.total}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DefectSummaryCard
                label="Safety / Major"
                value={defectTotals.safety}
                tone="red"
                href={isDemo ? `/demo/${inspectionId}?defect_filter=safety#inspection-findings` : `${buildShareHref({ defect_filter: "safety" })}#inspection-findings`}
                active={activeDefectFilter === "safety"}
              />
              <DefectSummaryCard
                label="Recommended Repair"
                value={defectTotals.repair}
                tone="teal"
                href={isDemo ? `/demo/${inspectionId}?defect_filter=repair#inspection-findings` : `${buildShareHref({ defect_filter: "repair" })}#inspection-findings`}
                active={activeDefectFilter === "repair"}
              />
              <DefectSummaryCard
                label="Maintenance / Monitor"
                value={defectTotals.maintenance}
                tone="yellow"
                href={isDemo ? `/demo/${inspectionId}?defect_filter=maintenance#inspection-findings` : `${buildShareHref({ defect_filter: "maintenance" })}#inspection-findings`}
                active={activeDefectFilter === "maintenance"}
              />
              <DefectSummaryCard
                label="Informational"
                value={defectTotals.information}
                tone="blue"
                href={isDemo ? `/demo/${inspectionId}?defect_filter=information#inspection-findings` : `${buildShareHref({ defect_filter: "information" })}#inspection-findings`}
                active={activeDefectFilter === "information"}
              />
            </div>

            {defectTotals.total > 0 && (
              <div className="mt-5">
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--fl-raised)]">
                  {defectTotals.safety > 0 && (
                    <div
                      className="bg-red-500"
                      style={{ width: `${(defectTotals.safety / defectTotals.total) * 100}%` }}
                      title={`Safety / Major: ${defectTotals.safety}`}
                    />
                  )}
                  {defectTotals.repair > 0 && (
                    <div
                      className="bg-teal-400"
                      style={{ width: `${(defectTotals.repair / defectTotals.total) * 100}%` }}
                      title={`Recommended Repair: ${defectTotals.repair}`}
                    />
                  )}
                  {defectTotals.maintenance > 0 && (
                    <div
                      className="bg-yellow-400"
                      style={{ width: `${(defectTotals.maintenance / defectTotals.total) * 100}%` }}
                      title={`Maintenance / Monitor: ${defectTotals.maintenance}`}
                    />
                  )}
                  {defectTotals.information > 0 && (
                    <div
                      className="bg-blue-400"
                      style={{ width: `${(defectTotals.information / defectTotals.total) * 100}%` }}
                      title={`Informational: ${defectTotals.information}`}
                    />
                  )}
                </div>
                <p className="mt-2 text-xs font-semibold text-[var(--fl-faint)]">
                  {defectTotals.total} total findings across {" "}
                  {[
                    defectTotals.safety > 0 && "safety",
                    defectTotals.repair > 0 && "repair",
                    defectTotals.maintenance > 0 && "maintenance",
                    defectTotals.information > 0 && "informational",
                  ].filter(Boolean).length}{" "}
                  categories
                </p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--fl-muted)]">
              <span>Click a defect type above to filter the findings list.</span>
              {activeDefectFilter !== "all" && (
                <Link
                  href={isDemo ? `/demo/${inspectionId}#inspection-findings` : `${buildShareHref()}#inspection-findings`}
                  className="rounded-full border border-[var(--fl-line)] px-3 py-1 font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
                >
                  Clear filter: {activeDefectFilterLabel[activeDefectFilter]}
                </Link>
              )}
            </div>
          </section>

          <ShareReportTabs
            initialTab={activeDefectFilter === "all" ? "summary" : "full"}
            showSummary={clientSummaryGroups.length > 0}
            showDisclaimers={Boolean(reportDisclaimers?.length)}
            showStandards={showStandardsInShare}
            showEquipment={equipmentInventory.length > 0}
          />

          {reportDisclaimers && reportDisclaimers.length > 0 && (
            <section id="report-disclaimers" className="scroll-mt-[180px] md:scroll-mt-[220px] mt-8 rounded-2xl border border-purple-500/40 bg-[var(--fl-surface-2)] p-6 shadow-xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--fl-purple-text)]">
                    Important Report Disclaimers
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-[var(--fl-text)]">
                    Scope, Limitations, and Age-Based Notices
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
                    These disclaimers are part of the inspection report and should be reviewed with the same importance as the findings below.
                  </p>
                </div>

                <span className="rounded-full border border-purple-400/60 bg-purple-500/15 px-4 py-2 text-sm font-semibold text-[var(--fl-purple-text)]">
                  {reportDisclaimers.length} notice{reportDisclaimers.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {reportDisclaimers.map((disclaimer: any) => (
                  <div
                    key={disclaimer.id}
                    className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5"
                  >
                    <h3 className="text-xl font-bold text-[var(--fl-text)]">
                      {disclaimer.topic}
                    </h3>

                    <p className="mt-3 whitespace-pre-line leading-7 text-[var(--fl-muted)]">
                      {disclaimer.disclaimer_text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showStandardsInShare && (
          <section id="standards-of-practice" className="scroll-mt-[180px] md:scroll-mt-[220px] mt-8 rounded-2xl border border-cyan-500/40 bg-[var(--fl-surface-2)] p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--fl-info-text)]">
                  Report Reference
                </p>
                <h2 className="mt-2 text-3xl font-semibold text-[var(--fl-text)]">
                  Standards of Practice
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
                  These standards define the systems inspected and identify items that are outside the required scope of a residential home inspection.
                </p>
              </div>

              <span className="rounded-full border border-cyan-400/60 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-[var(--fl-info-text)]">
                {standardsOfPractice.length} section{standardsOfPractice.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {standardsOfPractice.map((standard) => (
                <details
                  key={standard.title}
                  open
                  className="group rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5 open:border-cyan-500/50"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-lg font-semibold text-[var(--fl-text)]">
                        {standard.title}
                      </h3>
                      <span className="rounded-full border border-cyan-500/40 px-3 py-1 text-xs font-semibold text-[var(--fl-info-text)]">
                        View
                      </span>
                    </div>
                  </summary>

                  <div className="mt-4 space-y-3 border-t border-[var(--fl-raised)] pt-4 text-sm leading-7 text-[var(--fl-muted)]">
                    {standard.body.split("\n\n").map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>
          )}

          {clientSummaryGroups.length > 0 && (
            <section
              id="client-summary"
              className="scroll-mt-[180px] md:scroll-mt-[220px] mt-8 rounded-2xl border border-teal-500/40 bg-[var(--fl-surface-2)] p-6 shadow-xl"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">
                    Client Summary
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-[var(--fl-text)]">
                    Key Findings Summary
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
                    This summary highlights notable findings by severity so clients and agents can quickly review the most important report items. The full report below remains the complete inspection record.
                  </p>
                </div>

                <a
                  href="#inspection-findings"
                  className="rounded-xl border border-teal-500 px-4 py-3 text-sm font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500 hover:text-black"
                >
                  View Full Findings
                </a>
              </div>

              <div className="mt-6 overflow-x-auto overscroll-x-contain rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-2 print:hidden">
                <div className="flex w-max min-w-full gap-2">
                  <a
                    href="#client-summary"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--fl-raised)] px-4 py-3 text-sm font-semibold leading-none text-[var(--fl-text)] transition hover:bg-slate-600"
                  >
                    <span className="text-base leading-none">☰</span><span>Summary</span>
                  </a>
                  <a
                    href="#client-summary-safety"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-red-500/40 px-4 py-3 text-sm font-semibold leading-none text-[var(--fl-crit-text)] transition hover:bg-red-500/10"
                  >
                    <span className="text-base leading-none">⚠</span><span>Safety Hazards</span>
                  </a>
                  <a
                    href="#client-summary-repair"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-teal-500/40 px-4 py-3 text-sm font-semibold leading-none text-[var(--fl-accent-text)] transition hover:bg-teal-500/10"
                  >
                    <span className="text-base leading-none">🔧</span><span>Recommendations</span>
                  </a>
                  <a
                    href="#client-summary-maintenance"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-yellow-500/40 px-4 py-3 text-sm font-semibold leading-none text-[var(--fl-warn-text)] transition hover:bg-yellow-500/10"
                  >
                    <span className="text-base leading-none">⚙</span><span>Maintenance</span>
                  </a>
                  {Object.keys(limitationsBySection).length > 0 && (
                    <a
                      href="#report-limitations"
                      className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-orange-500/40 px-4 py-3 text-sm font-semibold leading-none text-[var(--fl-warn-text)] transition hover:bg-orange-500/10"
                    >
                      <span className="text-base leading-none">🚧</span><span>Limitations</span>
                    </a>
                  )}
                  {reportDisclaimers && reportDisclaimers.length > 0 && (
                    <a
                      href="#report-disclaimers"
                      className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-purple-500/40 px-4 py-3 text-sm font-semibold leading-none text-[var(--fl-purple-text)] transition hover:bg-purple-500/10"
                    >
                      <span className="text-base leading-none">📝</span><span>Disclaimers</span>
                    </a>
                  )}
                  {showStandardsInShare && (
                    <a
                      href="#standards-of-practice"
                      className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-cyan-500/40 px-4 py-3 text-sm font-semibold leading-none text-[var(--fl-info-text)] transition hover:bg-cyan-500/10"
                    >
                      <span className="text-base leading-none">📘</span><span>Standards</span>
                    </a>
                  )}
                  <a
                    href="#inspection-findings"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-blue-500/40 px-4 py-3 text-sm font-semibold leading-none text-[var(--fl-info-text)] transition hover:bg-blue-500/10"
                  >
                    <span className="text-base leading-none">📄</span><span>Full Report</span>
                  </a>
                </div>
              </div>

              <ClientSummaryAccordion groups={clientSummaryGroups} />
            </section>
          )}

          {inspection.executive_summary && (
            <section className="mt-8 rounded-2xl border border-purple-500/40 bg-[var(--fl-surface-2)] p-6 shadow-xl">
              <h2 className="text-2xl font-extrabold text-[var(--fl-purple-text)]">
                Executive Summary
              </h2>

              <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                This client-friendly overview summarizes the report findings in plain language.
              </p>

              <div className="mt-5 whitespace-pre-line rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 text-base leading-8 text-[var(--fl-text)]">
                {inspection.executive_summary}
              </div>
            </section>
          )}

          {!isDemo && realtorBranding && (
            <section className="mt-8 flex items-center gap-4 rounded-2xl border border-teal-500/30 bg-[var(--fl-surface-2)] p-5 shadow-xl">
              {realtorBranding.photo_url && (
                <img
                  src={realtorBranding.photo_url}
                  alt={realtorBranding.name || "Your agent"}
                  className="h-20 w-20 shrink-0 rounded-2xl border border-[var(--fl-line)] object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-accent-text)]">
                  Your Agent
                </p>
                <p className="mt-1 truncate text-xl font-semibold text-[var(--fl-text)]">
                  {realtorBranding.name || inspection.realtor_name}
                </p>
                {realtorBranding.brokerage && (
                  <p className="truncate text-sm text-[var(--fl-muted)]">{realtorBranding.brokerage}</p>
                )}
              </div>
            </section>
          )}

          <details className="mt-8 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">
                    Property Information
                  </h2>

                  <p className="mt-2 text-sm text-[var(--fl-muted)]">
                    Click to expand property details and inspection information.
                  </p>
                </div>

                <span className="rounded-full border border-teal-500/40 px-4 py-2 text-sm font-bold text-[var(--fl-accent-text)]">
                  Click to Expand
                </span>
              </div>
            </summary>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Info label="Property" value={address} />
              <Info
                label="Location"
                value={`${inspection.city || ""}, ${inspection.state || ""} ${
                  inspection.zip || ""
                }`}
              />
              {!isDemo && (
                <>
                  <Info label="Client" value={inspection.client_name} />
                  {inspection.client_organization_name && (
                    <Info label="Business/Organization" value={inspection.client_organization_name} />
                  )}
                  <Info label="Realtor" value={inspection.realtor_name} />
                </>
              )}
              <Info label="Inspection Date" value={inspection.inspection_date} />
              <Info label="Inspection Time" value={inspection.inspection_time ? formatClockTime(inspection.inspection_time) : inspection.inspection_time} />
              <Info label="Year Built" value={inspection.year_built} />
              <Info
                label="Square Feet"
                value={inspection.square_feet || inspection.sqft}
              />
            </div>
          </details>

          {equipmentInventory.length > 0 && (
            <details
              id="equipment-inventory"
              open
              className="mt-8 rounded-2xl border border-cyan-500/40 bg-[var(--fl-surface-2)] p-6"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-[var(--fl-info-text)]">
                      Equipment Inventory
                    </h2>

                    <p className="mt-2 text-sm text-[var(--fl-muted)]">
                      Click to expand major systems and equipment documented during the inspection. These records are informational and are not counted as defects unless a separate finding is included.
                    </p>
                  </div>

                  <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-[var(--fl-info-text)]">
                    {equipmentInventory.length} record{equipmentInventory.length === 1 ? "" : "s"}
                  </span>
                </div>
              </summary>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {equipmentInventory.map((item: any) => {
                  const equipmentImage =
                    item.signed_thumbnail_url || item.thumbnail_url || item.signed_image_url || item.image_url || item.public_url || "";

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-4"
                    >
                      {equipmentImage && (
                        <img
                          src={equipmentImage}
                          alt={item.equipment_type || "Equipment"}
                          loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="mb-4 max-h-56 w-full rounded-xl border border-[var(--fl-line)] object-contain"
                        />
                      )}

                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">
                        {item.equipment_type || "Equipment"}
                      </p>

                      <h3 className="mt-2 text-xl font-semibold text-[var(--fl-text)]">
                        {[item.manufacturer, item.model].filter(Boolean).join(" ") || "Equipment Record"}
                      </h3>

                      <EquipmentStatusBadge value={getEquipmentStatusValue(item)} />

                      <div className="mt-4 space-y-2 text-sm text-[var(--fl-muted)]">
                        <ShareEquipmentLine label="Serial" value={item.serial} />
                        <ShareEquipmentLine label="Manufacture Year" value={item.manufacture_year} />
                        <ShareEquipmentLine label="Estimated Age" value={item.estimated_age} />
                        {showClientIntelligence
                          ? (() => {
                              const p = estimatePrognosis(
                                item.equipment_type || "",
                                deriveAgeYears(new Date().getFullYear(), item.manufacture_year, item.estimated_age),
                              );
                              return p.matched && (p.status === "past" || p.status === "near") ? (
                                <ShareEquipmentLine label="Prognosis" value={p.summary} />
                              ) : null;
                            })()
                          : null}
                        <ShareEquipmentLine
                          label="Typical Industry Range"
                          value={getTypicalIndustryRange(item.expected_service_life)}
                        />
                        <ShareEquipmentLine
                          label="Service Life"
                          value={getTypicalIndustryRange(item.expected_service_life) ? "Industry estimate only" : ""}
                        />
                        <ShareEquipmentLine label="Capacity" value={item.capacity} />
                        <ShareEquipmentLine label="Fuel Type" value={item.fuel_type} />
                        {isHvacEquipmentItem(item) && <ShareEquipmentLine label="Refrigerant" value={item.refrigerant} />}
                        <ShareEquipmentLine
                          label="Condition"
                          value={getEquipmentConditionNote(item.condition)}
                        />
                        <ShareEquipmentLine
                          label="Estimated Life Used"
                          value={getEquipmentLifeUsed(item)}
                        />
                      </div>

                      <ShareEquipmentNoteBlock
                        label="Inspector Note"
                        value={getEquipmentInspectorNote(item)}
                      />

                      <ShareEquipmentNoteBlock
                        label="Maintenance Note"
                        value={getEquipmentMaintenanceNote(item)}
                      />

                      <ShareEquipmentNoteBlock
                        label="Recommended Maintenance"
                        value={getEquipmentMaintenanceSchedule(item)}
                      />
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {showEnvironmentalLinks && (
            <section className="mt-8 rounded-2xl border border-purple-500/40 bg-[var(--fl-surface-2)] p-6">
              <h2 className="text-2xl font-bold text-[var(--fl-purple-text)]">
                Environmental Testing Reports
              </h2>

              <p className="mt-2 text-sm text-[var(--fl-muted)]">
                {hasMold && hasRadon
                  ? "Your mold and radon sampling reports."
                  : hasMold
                    ? "Your mold sampling report."
                    : "Your radon sampling report."}
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {hasMold && (
                  <a
                    href={`/environmental-share/${sharePathId}`}
                    className="rounded-xl border border-purple-500 bg-[var(--fl-surface)] p-5 font-bold text-[var(--fl-purple-text)] transition hover:bg-purple-500/10"
                  >
                    <span className="block text-lg">
                      View Mold Sampling Report
                    </span>
                    <span className="mt-2 block text-sm font-medium text-[var(--fl-muted)]">
                      Sample count, lab status, and results summary.
                    </span>
                  </a>
                )}

                {hasRadon && (
                  <a
                    href={`/environmental-share/${sharePathId}`}
                    className="rounded-xl border border-purple-500 bg-[var(--fl-surface)] p-5 font-bold text-[var(--fl-purple-text)] transition hover:bg-purple-500/10"
                  >
                    <span className="block text-lg">
                      View Radon Sampling Report
                    </span>
                    <span className="mt-2 block text-sm font-medium text-[var(--fl-muted)]">
                      Device readings and results summary.
                    </span>
                  </a>
                )}

                {hasMold && moldReportUrl && (
                  <a
                    href={moldReportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-purple-500/50 bg-[var(--fl-surface)] p-5 font-bold text-[var(--fl-purple-text)] transition hover:bg-purple-500/10"
                  >
                    <span className="block text-lg">
                      View Official Mold Lab Report
                    </span>
                    <span className="mt-2 block text-sm font-medium text-[var(--fl-muted)]">
                      Open the raw third-party lab file.
                    </span>
                  </a>
                )}

                {hasRadon && radonReportUrl && (
                  <a
                    href={radonReportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-purple-500/50 bg-[var(--fl-surface)] p-5 font-bold text-[var(--fl-purple-text)] transition hover:bg-purple-500/10"
                  >
                    <span className="block text-lg">
                      View Official Radon Device Report
                    </span>
                    <span className="mt-2 block text-sm font-medium text-[var(--fl-muted)]">
                      Open the raw third-party device file.
                    </span>
                  </a>
                )}
              </div>
            </section>
          )}

          {(sectionStats.length > 0 || equipmentInventory.length > 0) && (
            <section className="mt-8 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6">
              <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">
                Section Snapshot
              </h2>

              <p className="mt-2 text-sm text-[var(--fl-muted)]">
                Quick overview of findings and reference photos by report section.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sectionStats.map((stat) => (
                  <a
                    key={stat.section}
                    href={`#section-${stat.section
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")}`}
                    className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-4 transition hover:border-teal-500/60 hover:bg-[var(--fl-surface-2)]"
                  >
                    <p className="font-semibold text-[var(--fl-text)]">{stat.section}</p>
                    <p className="mt-2 text-sm text-[var(--fl-muted)]">
                      {stat.defectCount} defect{stat.defectCount === 1 ? "" : "s"} •{" "}
                      {stat.referenceCount} reference photo
                      {stat.referenceCount === 1 ? "" : "s"}
                    </p>
                  </a>
                ))}

                {equipmentInventory.length > 0 && (
                  <a
                    href="#equipment-inventory"
                    className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4 transition hover:border-cyan-400 hover:bg-cyan-500/20"
                  >
                    <p className="font-semibold text-[var(--fl-info-text)]">
                      Equipment Inventory
                    </p>
                    <p className="mt-2 text-sm text-[var(--fl-muted)]">
                      {equipmentInventory.length} equipment record
                      {equipmentInventory.length === 1 ? "" : "s"} • informational only
                    </p>
                  </a>
                )}
              </div>
            </section>
          )}

          {inspection.report_summary && (
            <details className="mt-8 rounded-2xl border border-teal-500/40 bg-[var(--fl-surface-2)] p-6 shadow-xl">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-extrabold text-[var(--fl-accent-text)]">
                      Report Summary
                    </h2>
                    <p className="mt-2 text-sm text-[var(--fl-muted)]">
                      Click to expand the generated summary of notable findings and recommendations.
                    </p>
                  </div>
                  <span className="rounded-full border border-teal-500/40 px-4 py-2 text-sm font-bold text-[var(--fl-accent-text)]">
                    Click to Expand
                  </span>
                </div>
              </summary>

              <div className="mt-5 whitespace-pre-line rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 text-base leading-8 text-[var(--fl-text)]">
                {inspection.report_summary}
              </div>
            </details>
          )}

          {Object.keys(checklistBySection).length > 0 && (
            <details className="mt-8 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">
                      Inspection Information
                    </h2>
                    <p className="mt-2 text-sm text-[var(--fl-muted)]">
                      Click to expand selected inspection information, component types, materials, and system details.
                    </p>
                  </div>
                  <span className="rounded-full border border-teal-500/40 px-4 py-2 text-sm font-bold text-[var(--fl-accent-text)]">
                    Click to Expand
                  </span>
                </div>
              </summary>

              <div className="mt-5 space-y-6">
                {activeSectionOrder.filter((section) => checklistBySection[section]).map(
                  (section) => (
                    <div
                      key={section}
                      className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5"
                    >
                      <h3 className="mb-4 text-xl font-bold text-[var(--fl-text)]">
                        {section}
                      </h3>

                      <div className="grid gap-4 lg:grid-cols-2">
                        {Object.entries(checklistBySection[section]).map(
                          ([groupTitle, rows]: any) => (
                            <div key={groupTitle}>
                              <p className="text-sm font-bold uppercase tracking-wide text-[var(--fl-muted)]">
                                {groupTitle}
                              </p>

                              <p className="mt-1 whitespace-pre-line text-[var(--fl-text)]">
                                {(rows || [])
                                  .map((row: any) => row.custom_text || row.value)
                                  .filter((value: string) => value !== "__TEXT_VALUE__")
                                  .join(", ") || "N/A"}
                              </p>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </details>
          )}

          {Object.keys(limitationsBySection).length > 0 && (
            <details
              id="report-limitations"
              className="scroll-mt-[180px] md:scroll-mt-[220px] mt-8 rounded-2xl border border-yellow-500/40 bg-[var(--fl-surface-2)] p-6"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--fl-warn-text)]">
                    Scope Notes
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-[var(--fl-warn-text)]">
                    Limitations
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                    Areas or components that could not be fully inspected are collapsed by default. Tap to review details and photos.
                  </p>
                </div>
                <span className="rounded-xl border border-yellow-500/40 px-4 py-2 text-sm font-semibold text-[var(--fl-warn-text)]">
                  Show Limitations
                </span>
              </summary>

              <div className="mt-6 space-y-6 border-t border-[var(--fl-line)] pt-6">
                {activeSectionOrder.filter((section) => limitationsBySection[section]).map(
                  (section) => (
                    <details
                      key={section}
                      className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                        <h3 className="text-xl font-bold text-[var(--fl-text)]">
                          {section}
                        </h3>
                        <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-[var(--fl-warn-text)]">
                          {(limitationsBySection[section] || []).length} item{(limitationsBySection[section] || []).length === 1 ? "" : "s"}
                        </span>
                      </summary>

                      <div className="mt-5 space-y-5">
                        {(limitationsBySection[section] || []).map((item: any) => {
                          const limitationPhotos = Array.isArray(item.photos) ? item.photos : [];
                          const limitationText = String(
                            item.limitation_comment ||
                              item.custom_text ||
                              item.ai_notes ||
                              ""
                          ).trim();

                          return (
                            <div
                              key={item.id}
                              className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4"
                            >
                              <p className="font-bold text-[var(--fl-warn-text)]">
                                {item.custom_text || item.label}
                              </p>

                              {limitationText && (
                                <p className="mt-3 whitespace-pre-line leading-7 text-[var(--fl-muted)]">
                                  {limitationText}
                                </p>
                              )}

                              {limitationPhotos.length > 0 && (
                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                  {limitationPhotos.map((photo: any) => {
                                    const photoUrl =
                                      photo.signed_thumbnail_url ||
                                      photo.thumbnail_url ||
                                      photo.signed_url ||
                                      photo.public_url ||
                                      "";
                                    const fullUrl =
                                      photo.signed_url ||
                                      photo.public_url ||
                                      photoUrl;

                                    if (!photoUrl) return null;

                                    return (
                                      <ExpandableReportImage
                                        key={photo.id || photo.file_path || photoUrl}
                                        src={photoUrl}
                                        fullSrc={fullUrl}
                                        alt="Limitation photo"
                                        className="max-h-[260px] w-full object-cover"
                                        buttonClassName="block w-full overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                      />
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )
                )}
              </div>
            </details>
          )}

          <section
            id="inspection-findings"
            data-filter={activeDefectFilter}
            className="scroll-mt-[180px] md:scroll-mt-[220px] mt-10"
          >
            <style dangerouslySetInnerHTML={{ __html: FINDINGS_FILTER_CSS }} />
            {cgSummary && <CommonGroundSummary data={cgSummary} />}
            <div className="mb-5">
              <p className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">
                Inspection Findings
              </p>
              <h2 className="mt-2 text-4xl font-semibold text-[var(--fl-text)]">
                Findings By Section
              </h2>
            </div>

            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <FindingsSeverityFilter
                initial={activeDefectFilter}
                counts={severityFilterCounts}
              />
              <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-5 py-3 text-sm text-[var(--fl-muted)]">
                {defectTotals.total} total defect{defectTotals.total === 1 ? "" : "s"} documented
              </div>
            </div>

            {groupedFindings.length === 0 ? (
              <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-8 text-center text-[var(--fl-muted)]">
                No findings saved yet.
              </div>
            ) : (
              <div className="space-y-8">
                {groupedFindings.map((group) => {
                  const sectionDefects = group.findings.filter(isReportDefect).length;

                  return (
                    <section
                      key={group.section}
                      data-finding-section
                      id={`section-${group.section
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")}`}
                      className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6"
                    >
                      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--fl-line)] pb-4">
                        <h3 className="text-2xl font-semibold text-[var(--fl-text)]">
                          {group.section}
                        </h3>

                        <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-sm font-bold text-[var(--fl-accent-text)]">
                          {sectionDefects} defect{sectionDefects === 1 ? "" : "s"}
                        </span>
                      </div>

                      {notesBySection[group.section] && (
                        <div className="mb-6 whitespace-pre-wrap rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-6 text-[var(--fl-warn-text)] print:border-amber-500/50 print:bg-transparent print:text-black">
                          {notesBySection[group.section]}
                        </div>
                      )}

                      {referencePhotosBySection[group.section]?.length > 0 && (
                        <div className="mb-6 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                          <h4 className="mb-3 text-lg font-bold text-[var(--fl-info-text)]">
                            Section Reference Photos
                          </h4>

                          <p className="mb-4 text-sm text-[var(--fl-muted)]">
                            These photos document general section conditions and are not defect findings.
                          </p>

                          <div className="grid gap-4 md:grid-cols-3">
                            {referencePhotosBySection[group.section].map((photo: any, index: number) => {
                              const photoUrl = photo.signed_thumbnail_url || photo.thumbnail_url || photo.signed_url || photo.public_url || photo.image_url || photo.photo_url || "";

                              if (!photoUrl) return null;

                              return (
                                <div
                                  key={photo.id || index}
                                  className="overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)]"
                                >
                                  <ExpandableReportImage
                                    src={photoUrl}
                                    fullSrc={photo.signed_url || photo.public_url || photo.image_url || photo.photo_url || photoUrl}
                                    alt={photo.caption || `Section reference photo ${index + 1}`}
                                    badgeText="Tap to enlarge"
                                    className="max-h-[280px] w-full object-cover"
                                    buttonClassName="block w-full overflow-hidden bg-[var(--fl-surface-2)] text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                  />

                                  {photo.caption && (
                                    <p className="border-t border-[var(--fl-raised)] px-3 py-2 text-sm text-[var(--fl-muted)]">
                                      {photo.caption}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                      )}

                      {group.findings.length === 0 && (
                        <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-5 text-[var(--fl-muted)]">
                          No defect findings documented in this section.
                        </div>
                      )}

                      <div className="space-y-3 md:space-y-6">
                        {group.findings.map((finding: any) => {
                          const mediaList = getFindingMediaList(finding);
                          const primaryMedia = mediaList[0] || getFindingPrimaryMedia(finding);
                          const image = getMediaUrl(primaryMedia);
                          const previewImage = getMediaPreviewUrl(primaryMedia);
                          const title = getFindingTitle(finding);
                          const summary = getFindingSummary(finding);
                          const isVideo = isVideoMedia(primaryMedia || finding, image);

                          return (
                            <div
                              key={finding.id}
                              id={`finding-${finding.id}`}
                              data-finding
                              data-sev={findingSeveritySlug(finding)}
                              className="scroll-mt-[180px] md:scroll-mt-[220px]"
                            >
                              <details className="group overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] shadow-xl md:hidden">
                                <summary className="cursor-pointer list-none">
                                  <div className="flex gap-3 p-3">
                                    {image && (
                                      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)]">
                                        {isVideo ? (
                                          <div className="relative h-full w-full bg-[var(--fl-surface-2)]">
                                            {previewImage ? (
                                              <img
                                                src={previewImage}
                                                alt={`${title} video thumbnail`}
                                                loading="lazy"
                                                decoding="async"
                                                fetchPriority="low"
                                                className="h-full w-full object-cover opacity-80"
                                              />
                                            ) : (
                                              <video
                                                src={getVideoPreviewSrc(image)}
                                                muted
                                                playsInline
                                                preload="none"
                                                className="h-full w-full object-cover opacity-80"
                                              />
                                            )}
                                            <span className="absolute inset-x-2 bottom-2 rounded-full border border-cyan-400 bg-[var(--fl-surface-2)] px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">
                                              Video
                                            </span>
                                          </div>
                                        ) : (
                                          <ExpandableReportImage
                                            src={previewImage || image}
                                            fullSrc={image}
                                            alt={title}
                                            badgeText="View"
                                            className="h-full w-full object-cover"
                                            buttonClassName="block h-full w-full overflow-hidden bg-[var(--fl-ground)] text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                          />
                                        )}
                                      </div>
                                    )}

                                    <div className="min-w-0 flex-1">
                                      <div className="mb-2 flex flex-wrap items-center gap-2">
                                        {finding.item_number && (
                                          <span className="rounded-full border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">
                                            Item #{finding.item_number}
                                          </span>
                                        )}
                                        <span
                                          className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                                          style={severityBadgeStyle(severityConfig, finding.severity)}
                                        >
                                          {finding.severity || "Recommended Repair"}
                                        </span>
                                      </div>

                                      <h4 className="line-clamp-2 break-words text-base font-semibold leading-tight text-[var(--fl-text)]">
                                        {title}
                                      </h4>

                                      {finding.location && (
                                        <p className="mt-1 truncate text-xs font-bold text-[var(--fl-muted)]">
                                          📍 {finding.location}
                                        </p>
                                      )}

                                      <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wide text-[var(--fl-accent-text)]">
                                        {finding.section}
                                      </p>

                                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--fl-muted)]">
                                        {summary}
                                      </p>

                                      <p className="mt-2 text-xs font-semibold text-[var(--fl-info-text)]">
                                        View Finding →
                                      </p>
                                    </div>
                                  </div>
                                </summary>

                                <div className="border-t border-[var(--fl-line)] p-4">
                                  {mediaList.length > 0 && (() => {
                                    const photoItems = mediaList.filter(
                                      (media: any) => !isVideoMedia(media, getMediaUrl(media))
                                    );
                                    const galleryImages = photoItems.map((media: any) => ({
                                      src: getMediaPreviewUrl(media) || getMediaUrl(media),
                                      fullSrc: getMediaUrl(media),
                                      alt: title,
                                    }));

                                    return (
                                    <div className="mb-4 grid gap-3">
                                      {mediaList.map((media: any, mediaIndex: number) => {
                                        const mediaUrl = getMediaUrl(media);
                                        const mediaPreviewUrl = getMediaPreviewUrl(media);
                                        const mediaIsVideo = isVideoMedia(media, mediaUrl);

                                        if (!mediaUrl) return null;

                                        const photoIndex = photoItems.indexOf(media);

                                        return (
                                          <div key={media.id || media.file_path || mediaUrl || mediaIndex}>
                                            {mediaIsVideo ? (
                                              <video
                                                src={getVideoPreviewSrc(mediaUrl)}
                                                poster={mediaPreviewUrl && mediaPreviewUrl !== mediaUrl ? mediaPreviewUrl : undefined}
                                                controls
                                                muted
                                                playsInline
                                                preload="metadata"
                                                className="max-h-[520px] w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] object-contain"
                                              >
                                                Your browser does not support video playback.
                                              </video>
                                            ) : (
                                              <ExpandableReportImage
                                                src={mediaPreviewUrl || mediaUrl}
                                                fullSrc={mediaUrl}
                                                alt={media.caption || `Inspection finding photo ${mediaIndex + 1}`}
                                                badgeText="Tap to enlarge"
                                                className="max-h-[520px] w-full object-contain"
                                                buttonClassName="block w-full overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                                images={galleryImages}
                                                index={photoIndex >= 0 ? photoIndex : 0}
                                              />
                                            )}
                                            {media.caption && (
                                              <p className="mt-1 text-sm leading-6 text-[var(--fl-muted)] print:text-black">
                                                {media.caption}
                                              </p>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    );
                                  })()}

                                  <div className="grid gap-3">
                                    <FindingTextCard
                                      title="Observation"
                                      value={finding.observation}
                                      tone="blue"
                                    />

                                    <FindingTextCard
                                      title="Implication"
                                      value={finding.implication}
                                      tone="yellow"
                                    />

                                    <FindingTextCard
                                      title="Recommendation"
                                      value={finding.recommendation}
                                      tone="teal"
                                    />

                                    {showClientIntelligence &&
                                      matchStandards(
                                        `${finding.title || ""} ${finding.observation || ""} ${finding.recommendation || ""}`,
                                      ).map((std) => (
                                        <div
                                          key={std.id}
                                          className="rounded-xl border border-indigo-500/30 bg-indigo-500/[0.06] px-3 py-2 text-sm text-[var(--fl-text)]"
                                        >
                                          <span className="font-semibold text-[var(--fl-info-text)]">
                                            📋 Relevant standard: {std.title}
                                          </span>{" "}
                                          <span className="text-xs text-[var(--fl-muted)]">({std.citation})</span>
                                          <div className="mt-0.5 text-[var(--fl-muted)]">{std.note}</div>
                                        </div>
                                      ))}

                                    <FindingTextCard
                                      title="Additional Notes"
                                      value={finding.comment}
                                      tone="slate"
                                    />

                                    <FindingTextCard
                                      title="Related Observations"
                                      value={finding.related_note}
                                      tone="slate"
                                    />
                                  </div>
                                </div>
                              </details>

                              <article className="hidden overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] shadow-xl md:block">
                                <div className="border-b border-[var(--fl-line)] bg-[var(--fl-ground)] p-5">
                                  <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        {finding.item_number && (
                                          <span className="rounded-full border border-cyan-500/50 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">
                                            Item #{finding.item_number}
                                          </span>
                                        )}
                                        <span className="text-xs font-bold uppercase tracking-wide text-[var(--fl-faint)]">
                                          {finding.section}
                                        </span>
                                      </div>

                                      <h4 className="mt-2 text-2xl font-semibold text-[var(--fl-accent-text)]">
                                        {title}
                                      </h4>

                                      {finding.location && (
                                        <p className="mt-1 text-sm font-bold text-[var(--fl-muted)]">
                                          📍 {finding.location}
                                        </p>
                                      )}
                                    </div>

                                    <span
                                      className="rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                                      style={severityBadgeStyle(severityConfig, finding.severity)}
                                    >
                                      {finding.severity || "Recommended Repair"}
                                    </span>
                                  </div>
                                </div>

                                <div className="p-5">
                                  {mediaList.length > 0 && (() => {
                                    const photoItems = mediaList.filter(
                                      (media: any) => !isVideoMedia(media, getMediaUrl(media))
                                    );
                                    const galleryImages = photoItems.map((media: any) => ({
                                      src: getMediaPreviewUrl(media) || getMediaUrl(media),
                                      fullSrc: getMediaUrl(media),
                                      alt: title,
                                    }));

                                    return (
                                    <div
                                      className={`mb-5 grid gap-4 ${
                                        mediaList.length > 1 ? "md:grid-cols-2" : ""
                                      }`}
                                    >
                                      {mediaList.map((media: any, mediaIndex: number) => {
                                        const mediaUrl = getMediaUrl(media);
                                        const mediaPreviewUrl = getMediaPreviewUrl(media);
                                        const mediaIsVideo = isVideoMedia(media, mediaUrl);

                                        if (!mediaUrl) return null;

                                        const photoIndex = photoItems.indexOf(media);

                                        return (
                                          <div key={media.id || media.file_path || mediaUrl || mediaIndex}>
                                            {mediaIsVideo ? (
                                              <video
                                                src={getVideoPreviewSrc(mediaUrl)}
                                                poster={mediaPreviewUrl && mediaPreviewUrl !== mediaUrl ? mediaPreviewUrl : undefined}
                                                controls
                                                muted
                                                playsInline
                                                preload="metadata"
                                                className={`w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] object-contain ${
                                                  mediaList.length > 1 ? "max-h-[520px]" : "max-h-[640px]"
                                                }`}
                                              >
                                                Your browser does not support video playback.
                                              </video>
                                            ) : (
                                              <ExpandableReportImage
                                                src={mediaPreviewUrl || mediaUrl}
                                                fullSrc={mediaUrl}
                                                alt={media.caption || `Inspection finding photo ${mediaIndex + 1}`}
                                                badgeText="Tap to enlarge"
                                                className={`w-full object-contain ${
                                                  mediaList.length > 1 ? "max-h-[520px]" : "max-h-[640px]"
                                                }`}
                                                buttonClassName="block w-full overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                                images={galleryImages}
                                                index={photoIndex >= 0 ? photoIndex : 0}
                                              />
                                            )}
                                            {media.caption && (
                                              <p className="mt-1 text-sm leading-6 text-[var(--fl-muted)] print:text-black">
                                                {media.caption}
                                              </p>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    );
                                  })()}

                                  <div className="grid gap-4">
                                    <FindingTextCard
                                      title="Observation"
                                      value={finding.observation}
                                      tone="blue"
                                    />

                                    <FindingTextCard
                                      title="Implication"
                                      value={finding.implication}
                                      tone="yellow"
                                    />

                                    <FindingTextCard
                                      title="Recommendation"
                                      value={finding.recommendation}
                                      tone="teal"
                                    />

                                    {showClientIntelligence &&
                                      matchStandards(
                                        `${finding.title || ""} ${finding.observation || ""} ${finding.recommendation || ""}`,
                                      ).map((std) => (
                                        <div
                                          key={std.id}
                                          className="rounded-xl border border-indigo-500/30 bg-indigo-500/[0.06] px-3 py-2 text-sm text-[var(--fl-text)]"
                                        >
                                          <span className="font-semibold text-[var(--fl-info-text)]">
                                            📋 Relevant standard: {std.title}
                                          </span>{" "}
                                          <span className="text-xs text-[var(--fl-muted)]">({std.citation})</span>
                                          <div className="mt-0.5 text-[var(--fl-muted)]">{std.note}</div>
                                        </div>
                                      ))}

                                    <FindingTextCard
                                      title="Additional Notes"
                                      value={finding.comment}
                                      tone="slate"
                                    />

                                    <FindingTextCard
                                      title="Related Observations"
                                      value={finding.related_note}
                                      tone="slate"
                                    />
                                  </div>
                                </div>
                              </article>
                              {commonGroundById.get(String(finding.id)) && (
                                <CommonGroundPanel
                                  data={commonGroundById.get(String(finding.id))!}
                                  showCosts={showCommonGroundCosts}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </section>

          {secure24Enabled && (
            <Secure24ReferralCard
              shareToken={secure24Token}
              alreadyRequested={secure24AlreadyRequested}
            />
          )}

          {secure24Token && (
            <InsuranceReferralCard
              shareToken={secure24Token}
              placement="report"
              viewerRole={resolvedSearchParams?.role || ""}
            />
          )}

          {secure24Token && (
            <SocialMediaConsentCard shareToken={secure24Token} placement="report" />
          )}

          <footer className="mt-12 border-t border-[var(--fl-line)] pt-6 text-sm text-[var(--fl-muted)]">
            <p>{branding.name} • Shared Report Portal</p>
          </footer>
        </div>
      </div>
    </main>
    </>
  );
}

function ClientSummaryFindingCard({
  finding,
  tone,
}: {
  finding: any;
  tone: "red" | "teal" | "yellow" | "blue";
}) {
  const mediaList = getFindingMediaList(finding);
  const media = mediaList[0] || getFindingPrimaryMedia(finding);
  const mediaUrl = getMediaUrl(media);
  const previewUrl = getMediaPreviewUrl(media);
  const title = getFindingTitle(finding);
  const summary = getFindingSummary(finding);
  const video = isVideoMedia(media || finding, mediaUrl);

  const toneClass =
    tone === "red"
      ? "border-red-500/40 bg-red-500/10"
      : tone === "yellow"
      ? "border-yellow-500/40 bg-yellow-500/10"
      : tone === "blue"
      ? "border-blue-500/40 bg-blue-500/10"
      : "border-teal-500/40 bg-teal-500/10";

  return (
    <details
      className={`group overflow-hidden rounded-2xl border bg-[var(--fl-ground)] transition hover:-translate-y-0.5 hover:border-white/40 open:md:col-span-2 open:hover:translate-y-0 ${toneClass}`}
    >
      <summary className="cursor-pointer list-none">
        {mediaUrl && (
          <div className="h-52 overflow-hidden border-b border-[var(--fl-raised)] bg-[var(--fl-surface-2)]">
            {video ? (
              <div className="relative h-full w-full">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={`${title} video thumbnail`}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--fl-ground)] via-[var(--fl-surface)] to-black">
                    <div className="rounded-full border border-cyan-400 bg-[var(--fl-surface-2)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">
                      ▶ Video
                    </div>
                  </div>
                )}
                <span className="absolute inset-x-4 bottom-4 rounded-full border border-cyan-400 bg-[var(--fl-surface-2)] px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">
                  Tap to Expand Video
                </span>
              </div>
            ) : (
              <img
                src={previewUrl || mediaUrl}
                alt={title}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            )}
          </div>
        )}

        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {finding.item_number && (
              <span className="rounded-full border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">
                Item #{finding.item_number}
              </span>
            )}
            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getSeverityClass(
                finding.severity
              )}`}
            >
              {finding.severity || "Recommended Repair"}
            </span>
            <span className="rounded-full border border-[var(--fl-line)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
              {finding.section || "Report"}
            </span>
          </div>

          <h4 className="line-clamp-2 text-lg font-semibold leading-tight text-[var(--fl-text)] group-open:line-clamp-none">
            {title}
          </h4>

          {finding.location && (
            <p className="mt-1 line-clamp-1 text-xs font-bold text-[var(--fl-muted)]">
              📍 {finding.location}
            </p>
          )}

          <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--fl-muted)] group-open:line-clamp-none">
            {summary}
          </p>

          <p className="mt-4 text-sm font-semibold text-[var(--fl-info-text)]">
            <span className="group-open:hidden">Tap to Expand →</span>
            <span className="hidden group-open:inline">Expanded Details</span>
          </p>
        </div>
      </summary>

      <div className="border-t border-[var(--fl-raised)] p-4">
        {mediaList.length > 0 && (() => {
          const photoItems = mediaList.filter(
            (item: any) => !isVideoMedia(item, getMediaUrl(item))
          );
          const galleryImages = photoItems.map((item: any) => ({
            src: getMediaPreviewUrl(item) || getMediaUrl(item),
            fullSrc: getMediaUrl(item),
            alt: title,
          }));

          return (
            <div className="mb-4 grid gap-3">
              {mediaList.map((item: any, mediaIndex: number) => {
                const itemUrl = getMediaUrl(item);
                const itemPreviewUrl = getMediaPreviewUrl(item);
                const itemIsVideo = isVideoMedia(item, itemUrl);

                if (!itemUrl) return null;

                if (itemIsVideo) {
                  return (
                    <video
                      key={item.id || item.file_path || itemUrl || mediaIndex}
                      src={getVideoPreviewSrc(itemUrl)}
                      poster={itemPreviewUrl && itemPreviewUrl !== itemUrl ? itemPreviewUrl : undefined}
                      controls
                      muted
                      playsInline
                      preload="metadata"
                      className="max-h-[360px] w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] object-contain"
                    >
                      Your browser does not support video playback.
                    </video>
                  );
                }

                const photoIndex = photoItems.indexOf(item);

                return (
                  <ExpandableReportImage
                    key={item.id || item.file_path || itemUrl || mediaIndex}
                    src={itemPreviewUrl || itemUrl}
                    fullSrc={itemUrl}
                    alt={`Summary finding media ${mediaIndex + 1}`}
                    badgeText="Tap to enlarge"
                    className="max-h-[360px] w-full rounded-xl border border-[var(--fl-line)] object-contain"
                    buttonClassName="block w-full overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                    images={galleryImages}
                    index={photoIndex >= 0 ? photoIndex : 0}
                  />
                );
              })}
            </div>
          );
        })()}

        <div className="grid gap-3 lg:grid-cols-3">
          <FindingTextCard title="Observation" value={finding.observation} tone="blue" />
          <FindingTextCard title="Implication" value={finding.implication} tone="yellow" />
          <FindingTextCard title="Recommendation" value={finding.recommendation} tone="teal" />
          <FindingTextCard title="Additional Notes" value={finding.comment} tone="slate" />
          <FindingTextCard title="Related Observations" value={finding.related_note} tone="slate" />
        </div>

        <a
          href={`#section-${String(finding.section || "other")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`}
          className="mt-4 inline-flex rounded-xl border border-cyan-500/50 px-4 py-3 text-sm font-semibold text-[var(--fl-info-text)] transition hover:bg-cyan-500 hover:text-black"
        >
          Open This Item In Full Report →
        </a>
      </div>
    </details>
  );
}

function DefectSummaryCard({
  label,
  value,
  tone,
  href,
  active = false,
}: {
  label: string;
  value: number;
  tone: "red" | "teal" | "yellow" | "blue";
  href: string;
  active?: boolean;
}) {
  const toneMap = {
    red: {
      wrap: "border-red-500/30 bg-red-500/10 hover:border-red-500/60 hover:bg-red-500/20",
      num: "text-[var(--fl-crit-text)]",
      dot: "bg-red-400",
    },
    teal: {
      wrap: "border-teal-500/30 bg-teal-500/10 hover:border-teal-500/60 hover:bg-teal-500/20",
      num: "text-[var(--fl-accent-text)]",
      dot: "bg-teal-400",
    },
    yellow: {
      wrap: "border-yellow-500/30 bg-yellow-500/10 hover:border-yellow-500/60 hover:bg-yellow-500/20",
      num: "text-[var(--fl-warn-text)]",
      dot: "bg-yellow-400",
    },
    blue: {
      wrap: "border-blue-500/30 bg-blue-500/10 hover:border-blue-500/60 hover:bg-blue-500/20",
      num: "text-[var(--fl-info-text)]",
      dot: "bg-blue-400",
    },
  } as const;

  const t = toneMap[tone] ?? toneMap.teal;

  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border p-5 transition duration-150 hover:-translate-y-0.5 ${t.wrap} ${
        active ? "ring-2 ring-white/70" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.dot}`} />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--fl-muted)]">
          {label}
        </p>
      </div>

      <p className={`mt-3 text-4xl font-semibold tabular-nums ${t.num}`}>{value}</p>

      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--fl-muted)] opacity-70 transition group-hover:opacity-100">
        {active ? "Filtering ✓" : "Click to filter"}
      </p>
    </Link>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-[var(--fl-muted)]">
        {label}
      </p>

      <p className="mt-1 text-base font-semibold text-[var(--fl-text)]">
        {value || "N/A"}
      </p>
    </div>
  );
}

function InventoryLine({ label, value }: { label: string; value?: any }) {
  if (!isKnownEquipmentValue(value)) return null;

  return (
    <div className="flex justify-between gap-3 border-b border-[var(--fl-raised)] pb-1">
      <span className="font-bold text-[var(--fl-faint)]">{label}</span>
      <span className="text-right font-semibold text-[var(--fl-text)]">{value}</span>
    </div>
  );
}

function FindingTextCard({
  title,
  value,
  tone,
}: {
  title: string;
  value?: any;
  tone: "blue" | "yellow" | "teal" | "slate";
}) {
  if (!isKnownEquipmentValue(value)) return null;

  const classes =
    tone === "blue"
      ? "border-blue-500/30 bg-blue-500/10"
      : tone === "yellow"
      ? "border-yellow-500/30 bg-yellow-500/10"
      : tone === "teal"
      ? "border-teal-500/30 bg-teal-500/10"
      : "border-[var(--fl-line)] bg-[var(--fl-ground)]";

  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-text)]">
        {title}
      </p>

      <p className="mt-2 whitespace-pre-line text-base leading-7 text-[var(--fl-text)]">
        {value}
      </p>
    </div>
  );
}
