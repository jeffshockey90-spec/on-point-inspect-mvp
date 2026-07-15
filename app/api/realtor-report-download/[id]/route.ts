import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { randomUUID } from "crypto";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { existsSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  "Garage",
  "Disclaimers",
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

function getSectionNumber(section: any) {
  const clean = normalizeSection(section);
  const index = SECTION_ORDER.findIndex((item) => item === clean);
  return index >= 0 ? index + 1 : SECTION_ORDER.length + 1;
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanText(value) || "N/A";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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
  return `${appUrl.replace(/\/$/, "")}/public-report/${encodeURIComponent(token)}`;
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

async function signedPdfImageUrlMap(admin: any, paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const result: Record<string, string> = {};

  if (!uniquePaths.length) return result;

  const concurrency = Math.min(24, uniquePaths.length);
  let cursor = 0;

  async function worker() {
    while (cursor < uniquePaths.length) {
      const path = uniquePaths[cursor];
      cursor += 1;

      const { data, error } = await admin.storage
        .from("inspection-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 7, {
          transform: {
            width: 1100,
            quality: 72,
            resize: "contain",
          },
        });

      if (error) {
        console.error("PDF preview image signing failed:", { path, error });
        continue;
      }

      if (data?.signedUrl) {
        result[path] = data.signedUrl;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return result;
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

  const findingPhotosPromise = findingIds.length
    ? admin
        .from("photos")
        .select("*")
        .in("finding_id", findingIds)
        .order("created_at", { ascending: true })
    : Promise.resolve({ data: [], error: null });

  const inspectionPhotosPromise = admin
    .from("photos")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  const [findingPhotosResult, inspectionPhotosResult] = await Promise.all([
    findingPhotosPromise,
    inspectionPhotosPromise,
  ]);

  if (!findingPhotosResult.error) {
    (findingPhotosResult.data || []).forEach((photo: any) => {
      if (photo?.id) byId.set(String(photo.id), photo);
    });
  } else {
    console.error("Agent report photos by finding_id failed:", findingPhotosResult.error);
  }

  if (!inspectionPhotosResult.error) {
    (inspectionPhotosResult.data || []).forEach((photo: any) => {
      if (photo?.id) byId.set(String(photo.id), photo);
    });
  }

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
  reportMode,
  propertyPhotoUrl,
  branding,
  qrCodeDataUrl,
  standardsOfPractice,
  includeStandardsInPdf,
  clientNameOverride,
  clientEmailOverride,
}: {
  inspection: any;
  findings: any[];
  reportMode: "agent" | "full";
  propertyPhotoUrl?: string;
  branding: any;
  qrCodeDataUrl?: string;
  standardsOfPractice: Array<{ title: string; body: string }>;
  includeStandardsInPdf: boolean;
  clientNameOverride?: string;
  clientEmailOverride?: string;
}) {
  const property = getPropertyAddress(inspection);
  const isFull = reportMode === "full";
  const defects = findings.filter(isReportDefect);

  const counts = defects.reduce(
    (acc: Record<string, number>, finding: any) => {
      const bucket = getSeverityBucket(finding.severity);
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    },
    {}
  );

  const grouped = SECTION_ORDER.map((section) => ({
    section,
    findings: defects.filter((finding) => normalizeSection(finding.section) === section),
  })).filter((group) => group.findings.length > 0);

  const otherFindings = defects.filter(
    (finding) => !SECTION_ORDER.includes(normalizeSection(finding.section))
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

  const tocHtml = grouped.map((group) => {
    const sectionNumber = getSectionNumber(group.section);
    return `
      <div class="toc-row">
        <span class="toc-num">${escapeHtml(String(sectionNumber))}</span>
        <span class="toc-name">${escapeHtml(group.section)}</span>
        <span class="toc-dots"></span>
        <span class="toc-count">${group.findings.length} item${group.findings.length === 1 ? "" : "s"}</span>
      </div>
    `;
  }).join("");

  const standardsTocHtml = includeStandardsInPdf
    ? `
      <div class="toc-row">
        <span class="toc-num">SOP</span>
        <span class="toc-name">Standards of Practice</span>
        <span class="toc-dots"></span>
        <span class="toc-count">Reference</span>
      </div>
    `
    : "";

  const keyFindingsHtml = defects.map((finding: any, index: number) => {
    const section = normalizeSection(finding.section);
    const sectionNumber = getSectionNumber(section);
    const bucket = getSeverityBucket(finding.severity);
    return `
      <li>
        <span class="key-dot ${severityKey(finding.severity)}"></span>
        <span><strong>${escapeHtml(`${sectionNumber}.${index + 1}`)}</strong> ${escapeHtml(section)} — ${escapeHtml(getFindingTitle(finding))}</span>
        <em>${escapeHtml(bucket)}</em>
      </li>
    `;
  }).join("");

  const summaryCards = `
    <div class="summary-cards">
      <div class="summary-card safety-major">
        <div class="summary-icon">!</div>
        <strong>${counts["Safety / Major"] || 0}</strong>
        <span>Safety / Major</span>
      </div>
      <div class="summary-card recommended-repair">
        <div class="summary-icon">✓</div>
        <strong>${counts["Recommended Repair"] || 0}</strong>
        <span>Recommended Repair</span>
      </div>
      <div class="summary-card maintenance-monitor">
        <div class="summary-icon">•</div>
        <strong>${counts["Maintenance / Monitor"] || 0}</strong>
        <span>Maintenance / Monitor</span>
      </div>
      <div class="summary-card informational">
        <div class="summary-icon">i</div>
        <strong>${counts["Informational"] || 0}</strong>
        <span>Informational</span>
      </div>
    </div>
  `;

  const pagesHtml = grouped.map((group) => {
    const sectionNumber = getSectionNumber(group.section);

    const findingsHtml = group.findings.map((finding: any, index: number) => {
      const sectionItemNumber = `${sectionNumber}.${index + 1}`;
      const photos = Array.isArray(finding.photos)
        ? finding.photos.slice(0, isFull ? 4 : 2)
        : [];

      const photoHtml = photos.length
        ? `<div class="finding-photos">${photos.map((photo: any) => `<img src="${escapeHtml(photo.download_url)}" alt="Finding photo" />`).join("")}</div>`
        : "";

      const observationHtml = finding.observation
        ? `<div class="finding-note"><b>Observation</b><p>${escapeHtml(finding.observation)}</p></div>`
        : "";

      const implicationHtml = finding.implication
        ? `<div class="finding-note"><b>Implication</b><p>${escapeHtml(finding.implication)}</p></div>`
        : "";

      const recommendationHtml = finding.recommendation
        ? `<div class="finding-note recommendation"><b>Recommendation</b><p>${escapeHtml(finding.recommendation)}</p></div>`
        : `<div class="finding-note recommendation"><b>Recommendation</b><p>${escapeHtml(getFindingText(finding))}</p></div>`;

      return `
        <article class="finding-row">
          <div class="finding-main">
            <div class="finding-title-row">
              <span class="finding-num">${escapeHtml(sectionItemNumber)}</span>
              <div>
                <h3>${escapeHtml(getFindingTitle(finding))}</h3>
                <p>${escapeHtml(group.section)} · ${escapeHtml(getSeverityBucket(finding.severity))}</p>
              </div>
              <span class="pill ${severityKey(finding.severity)}">${escapeHtml(getSeverityBucket(finding.severity))}</span>
            </div>

            <div class="finding-body">
              <div class="finding-copy">
                ${observationHtml}
                ${implicationHtml}
                ${recommendationHtml}
              </div>
              ${photoHtml}
            </div>
          </div>
        </article>
      `;
    }).join("");

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

        <div class="section-banner">
          <span>${escapeHtml(String(sectionNumber))}</span>
          <div>
            <p>Inspection Section</p>
            <h2>${escapeHtml(group.section)}</h2>
          </div>
        </div>

        <div class="section-info-strip">
          <div><b>Documented Items</b><span>${group.findings.length}</span></div>
          <div><b>Report Type</b><span>${isFull ? "Full Report" : "Agent Summary"}</span></div>
          <div><b>Inspection Date</b><span>${escapeHtml(inspectionDate)}</span></div>
        </div>

        <h4 class="findings-label">Findings</h4>
        ${findingsHtml}

        <footer class="black-footer">
          <span>${escapeHtml(companyName)}</span>
          <span>${escapeHtml(group.section)}</span>
        </footer>
      </section>
    `;
  }).join("");

  const standardsPagesHtml = includeStandardsInPdf
    ? buildStandardsOfPracticePagesHtml({
        property,
        cityStateZip,
        companyName,
        headerLogoHtml,
        standardsOfPractice,
      })
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${isFull ? "Full Report" : "Agent Report"} - ${escapeHtml(property)}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: letter; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { background: #0b1120; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.45; }
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

    .toc-title, .summary-title { margin: 10px 0 30px; color: #020617; font-size: 26px; text-transform: uppercase; letter-spacing: .06em; }
    .toc-row { display: grid; grid-template-columns: 34px auto 1fr 90px; align-items: end; gap: 9px; padding: 10px 0; border-bottom: 1px dotted #94a3b8; }
    .toc-num { color: #0f8f8f; font-weight: 900; }
    .toc-name { color: #020617; font-weight: 800; text-transform: uppercase; }
    .toc-count { color: #64748b; text-align: right; font-size: 10px; }

    .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 28px 0 34px; }
    .summary-card { border-radius: 10px; overflow: hidden; border: 1px solid #cbd5e1; background: #fff; text-align: center; min-height: 148px; }
    .summary-icon { height: 46px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; }
    .summary-card strong { display: block; font-size: 34px; margin-top: 18px; color: #020617; }
    .summary-card span { display: block; color: #64748b; font-size: 9px; font-weight: 900; text-transform: uppercase; padding: 0 8px; }
    .summary-card.safety-major .summary-icon { background: #ef4444; }
    .summary-card.recommended-repair .summary-icon { background: #f97316; }
    .summary-card.maintenance-monitor .summary-icon { background: #0f8f8f; }
    .summary-card.informational .summary-icon { background: #2563eb; }

    .key-findings { margin: 0; padding: 0; list-style: none; }
    .key-findings li { display: grid; grid-template-columns: 14px 1fr auto; gap: 10px; align-items: center; border-bottom: 1px solid #e2e8f0; padding: 8px 0; color: #334155; }
    .key-dot { width: 11px; height: 11px; border-radius: 999px; background: #f97316; }
    .key-dot.safety-major { background: #ef4444; }
    .key-dot.maintenance-monitor { background: #0f8f8f; }
    .key-dot.informational { background: #2563eb; }
    .key-findings em { color: #64748b; font-style: normal; font-size: 9px; text-transform: uppercase; font-weight: 900; }

    .section-banner { display: flex; align-items: center; gap: 18px; margin: 8px 0 22px; }
    .section-banner > span { width: 74px; height: 58px; background: #0f8f8f; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; clip-path: polygon(0 0, 82% 0, 100% 50%, 82% 100%, 0 100%); }
    .section-banner p { margin: 0; color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 900; letter-spacing: .12em; }
    .section-banner h2 { margin: 2px 0 0; color: #020617; font-size: 28px; text-transform: uppercase; }
    .section-info-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 12px 0; margin-bottom: 18px; }
    .section-info-strip b { display: block; color: #0f8f8f; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; }
    .section-info-strip span { display: block; color: #334155; font-weight: 800; margin-top: 3px; }
    .findings-label { color: #020617; text-transform: uppercase; letter-spacing: .12em; margin: 14px 0 6px; font-size: 12px; border-bottom: 2px solid #0f8f8f; padding-bottom: 7px; }

    .finding-row { break-inside: avoid; page-break-inside: avoid; padding: 12px 0 16px; border-bottom: 1px solid #e2e8f0; }
    .finding-title-row { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: start; margin-bottom: 10px; }
    .finding-num { background: #0f8f8f; color: #fff; border-radius: 4px; padding: 7px 6px; text-align: center; font-weight: 900; font-size: 11px; }
    h3 { margin: 0; color: #020617; font-size: 15px; line-height: 1.25; }
    .finding-title-row p { margin: 4px 0 0; color: #64748b; font-size: 10px; font-weight: 800; }
    .pill { border-radius: 4px; padding: 6px 8px; color: #fff; background: #f97316; font-size: 9px; font-weight: 900; text-transform: uppercase; white-space: nowrap; }
    .pill.safety-major { background: #ef4444; }
    .pill.maintenance-monitor { background: #0f8f8f; }
    .pill.informational { background: #2563eb; }
    .finding-body { display: grid; grid-template-columns: 1fr 225px; gap: 16px; align-items: start; }
    .finding-copy { display: grid; gap: 8px; }
    .finding-note { border-left: 3px solid #0f8f8f; padding-left: 10px; }
    .finding-note b { display: block; color: #0f8f8f; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
    .finding-note p { margin: 3px 0 0; color: #334155; white-space: pre-line; }
    .finding-note.recommendation { border-left-color: #f97316; }
    .finding-note.recommendation b { color: #f97316; }
    .finding-photos { display: grid; gap: 8px; }
    .finding-photos img { width: 100%; max-height: 174px; object-fit: contain; border: 1px solid #cbd5e1; background: #fff; }

    .standards-title { border-left: 6px solid #0f8f8f; padding: 0 0 0 18px; margin-bottom: 18px; }
    .standards-title p { margin: 0; color: #0f8f8f; font-size: 10px; text-transform: uppercase; letter-spacing: .14em; font-weight: 900; }
    .standards-title h2 { margin: 4px 0 6px; color: #020617; font-size: 28px; text-transform: uppercase; }
    .standards-title span { display: block; color: #475569; font-size: 11px; line-height: 1.5; max-width: 650px; }
    .standards-grid { column-count: 2; column-gap: 22px; }
    .standards-block { break-inside: avoid; page-break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; margin: 0 0 12px; background: #f8fafc; }
    .standards-block h3 { margin: 0 0 7px; color: #0f8f8f; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; }
    .standards-block p { margin: 0 0 7px; color: #334155; font-size: 9.2px; line-height: 1.42; }

    .interactive-card { margin: 120px auto 0; max-width: 420px; text-align: center; }
    .interactive-icon { width: 90px; height: 90px; margin: 0 auto 18px; border-radius: 999px; background: #0f8f8f; color: white; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 900; }
    .qr-caption { margin: 22px 0 0; color: #020617; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; }
    .qr-box { width: 180px; height: 180px; margin: 24px auto; border: 2px dashed #0f8f8f; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #0f8f8f; font-weight: 900; }
    .qr-box.real { width: 220px; height: 220px; margin: 16px auto 14px; background: #fff; border: 0; border-radius: 18px; display: flex; justify-content: center; align-items: center; position: relative; padding: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
    .qr-image { width: 100%; height: 100%; object-fit: contain; display: block; }
    .qr-logo { position: absolute; width: 58px; height: 58px; background: #fff; border-radius: 14px; display: flex; justify-content: center; align-items: center; overflow: hidden; box-shadow: 0 0 8px rgba(0,0,0,.2); }
    .qr-logo img { width: 46px; height: 46px; object-fit: contain; display: block; }
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
      .page { width: 8.5in; min-height: 11in; overflow: hidden; }
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
    // Vercel may omit @sparticuz/chromium/bin from the traced serverless bundle.
    // Use the pack that matches the installed @sparticuz/chromium version.
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

  try {
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
      headless: true,
    });

    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);

    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    await page.evaluate(async () => {
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
              window.setTimeout(finish, 15000);
            })
        )
      );
    });

    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0in",
        right: "0in",
        bottom: "0in",
        left: "0in",
      },
    });

    return Buffer.from(pdf);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
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

    if (!inspection) {
      if (!/^\d+$/.test(lookupValue)) {
        return NextResponse.json({ error: "Report link is invalid or expired." }, { status: 404 });
      }

      const authClient = await createSupabaseServerClient();
      const authResult = await authClient.auth.getUser();
      user = authResult.data.user;
      userEmail = cleanEmail(user?.email);

      if (!user?.email) {
        return NextResponse.json({ error: "This download link requires a valid shared report link." }, { status: 401 });
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
      return NextResponse.json({ error: "You do not have access to this report." }, { status: 403 });
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

    const findingIds = normalizedFindings.map((finding: any) => cleanText(finding.id)).filter(Boolean);
    const photosRaw = await loadPhotos(admin, inspectionId, findingIds);

    // PDF files should never embed original phone photos or video files.
    // Prefer a permanent thumbnail, then request a compressed 1100px transform.
    const photoPaths = photosRaw
      .filter((photo: any) => !isVideoPhoto(photo))
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
      if (isVideoPhoto(photo)) {
        return {
          ...photo,
          download_url: "",
        };
      }

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

    const html = buildAgentReportHtml({
      inspection,
      findings,
      reportMode,
      propertyPhotoUrl,
      branding,
      qrCodeDataUrl,
      standardsOfPractice,
      includeStandardsInPdf,
      clientNameOverride,
      clientEmailOverride,
    });
    const property = getPropertyAddress(inspection);

    const pdf = await renderHtmlToPdf(html);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${getDownloadName(property, reportMode)}"`,
        "Cache-Control": "private, max-age=20, stale-while-revalidate=120",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not download realtor report." },
      { status: 500 }
    );
  }
}
