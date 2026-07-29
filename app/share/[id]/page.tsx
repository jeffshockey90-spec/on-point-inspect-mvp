import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { resolveActiveSections } from "../../../lib/reportSections";
import PdfExportButton from "../../../components/PdfExportButton";
import ReportTimeTracker from "../../../components/ReportTimeTracker";
import ClientSummaryAccordion from "../../../components/ClientSummaryAccordion";
import ExpandableReportImage from "../../../components/ExpandableReportImage";
import ReportDownloadLink from "../../../components/ReportDownloadLink";
import ShareReportTabs from "../../../components/ShareReportTabs";
import { normalizeCompanyBranding } from "../../../lib/companyBranding";
import { sendPushNotification } from "../../../lib/push";

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


async function recordInspectionView({
  inspectionId,
  viewType,
  contactId,
  viewerRole,
  viewerEmail,
  sharePathId,
}: {
  inspectionId: string | number;
  viewType: string;
  contactId?: string | null;
  viewerRole?: string | null;
  viewerEmail?: string | null;
  sharePathId?: string | null;
}) {
  try {
    const numericInspectionId = Number(inspectionId);

    if (!numericInspectionId || !Number.isFinite(numericInspectionId)) return;

    await supabase.from("inspection_view_events").insert({
      inspection_id_bigint: numericInspectionId,
      view_type: viewType,
      contact_id: contactId || null,
      viewer_role: viewerRole || null,
      viewer_email: viewerEmail || null,
      path: `/public-report/${sharePathId || inspectionId}`,
      metadata: {
        source: "public_share_page",
      },
    });

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
      const viewerLabel = isRealtor ? "A realtor" : viewerEmail || "Someone";

      await sendPushNotification({
        title: isRealtor ? "Realtor Viewed Report" : "Report Viewed",
        body: `${viewerLabel} opened ${property}.`,
        url: `/reports/${numericInspectionId}`,
        eventType: "report_share",
        target: "user",
        targetUserId: inspection.inspector_id,
      });
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
    return "border-red-500/50 bg-red-500/15 text-red-200";
  }

  if (bucket === "maintenance") {
    return "border-yellow-500/50 bg-yellow-500/15 text-yellow-200";
  }

  if (bucket === "information") {
    return "border-blue-500/50 bg-blue-500/15 text-blue-200";
  }

  return "border-teal-500/50 bg-teal-500/15 text-teal-200";
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
    <div className="flex flex-col gap-1 border-b border-slate-800 py-2 sm:flex-row sm:items-start sm:justify-between">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="whitespace-pre-line text-left text-sm font-semibold leading-6 text-slate-100 sm:max-w-[70%] sm:text-right">
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
      <p className="text-xs font-black uppercase tracking-wide text-cyan-300">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-100">
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
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  }

  if (clean.includes("monitor / budget") || clean.includes("replacement")) {
    return "border-red-500/50 bg-red-500/10 text-red-300";
  }

  if (clean.includes("service")) {
    return "border-orange-500/50 bg-orange-500/10 text-orange-300";
  }

  if (clean.includes("monitor")) {
    return "border-yellow-500/50 bg-yellow-500/10 text-yellow-300";
  }

  return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
}

function EquipmentStatusBadge({ value }: { value?: any }) {
  if (!isKnownEquipmentValue(value)) return null;

  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-black ${getEquipmentStatusClass(value)}`}>
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
  searchParams?: Promise<{ defect_filter?: string; contact?: string; role?: string; email?: string }>;
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

  if (inspection) {
    inspectionId = String(inspection.id);
  }

  if (inspectionError || !inspection) {
    return (
      <main className="min-h-screen bg-[#020617] p-10 text-white">
        Report not found.
      </main>
    );
  }

  const sharePathId = String(
    inspection.public_share_token ||
      inspection.share_token ||
      inspection.report_share_token ||
      shareLookup
  );

  if (!isDemo) {
    await recordInspectionView({
      inspectionId,
      viewType: "report_share",
      contactId: resolvedSearchParams?.contact || null,
      viewerRole: resolvedSearchParams?.role || null,
      viewerEmail: resolvedSearchParams?.email || null,
      sharePathId,
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

  const activeSectionOrder = resolveActiveSections(SECTION_ORDER, reportSectionsRaw || []);

  const { data: sectionNotesRaw } = await supabase
    .from("report_section_notes")
    .select("section_name, notes")
    .eq("inspection_id", inspectionId);

  const sectionNotesByName = new Map(
    (sectionNotesRaw || [])
      .filter((row: any) => String(row.notes || "").trim())
      .map((row: any) => [row.section_name, row.notes as string])
  );

  if (findingsError) {
    return (
      <main className="min-h-screen bg-[#020617] p-10 text-white">
        Error loading report findings.
      </main>
    );
  }

  const findingIds = (findingsRaw || []).map((finding: any) => finding.id);

  const { data: photosRaw, error: photosError } =
    findingIds.length > 0
      ? await supabase.from("photos").select("*").in("finding_id", findingIds)
      : { data: [], error: null };

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

  const numberedFindings = addRepairItemNumbers(findings, activeSectionOrder);

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
  const showEnvironmentalLinks =
    (hasMoldService(inspection) && moldReportUrl) ||
    (hasRadonService(inspection) && radonReportUrl);

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

  const displayFindings =
    activeDefectFilter === "all"
      ? numberedFindings
      : numberedFindings.filter(
          (finding: any) =>
            isReportDefect(finding) &&
            getSeverityBucket(finding.severity) === activeDefectFilter
        );

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

    return hasFindings || hasReferencePhotos || hasChecklistInfo || hasLimitations;
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

      <main className="min-h-screen w-full overflow-x-hidden bg-[#020617] p-4 text-white md:p-8">
      {!isDemo && (
        <ReportTimeTracker
          inspectionId={String(inspectionId)}
          viewerRole={resolvedSearchParams?.role || null}
          viewerEmail={resolvedSearchParams?.email || null}
          path={`/share/${sharePathId}`}
        />
      )}

      <div className="mx-auto w-full max-w-[96rem] overflow-x-hidden rounded-3xl border border-slate-800 bg-[#0f172a] shadow-2xl">
        <section className="relative overflow-hidden border-b border-slate-800 bg-[#020617]">
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
              <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/35 to-black/20" />
            </>
          ) : (
            <div className="h-[320px] bg-gradient-to-br from-[#020617] via-[#071224] to-[#0f172a]" />
          )}

          <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
            <div className="max-w-5xl">
              <p className="text-xs font-black uppercase tracking-[0.38em] text-teal-300">
                {branding.name}
              </p>

              <h1 className="mt-4 text-4xl font-black tracking-tight text-white md:text-6xl">
                Residential Home Inspection Report
              </h1>

              <p className="mt-4 max-w-3xl text-lg font-semibold leading-8 text-slate-200">
                {address}
              </p>

              <p className="mt-2 text-sm text-slate-400">
                Protecting Your Investment. One Inspection at a Time.
              </p>
            </div>
          </div>
        </section>

        <div className="p-5 md:p-10">
          {isDemo && (
            <div className="mb-8 rounded-2xl border border-fuchsia-500/40 bg-fuchsia-950/30 p-5 text-fuchsia-100 print:hidden">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-fuchsia-300">
                Demo Report
              </p>
              <p className="mt-2 text-sm leading-6 text-fuchsia-100/90">
                This is a public sample report. Client, realtor, agreement, payment, and editable report actions are hidden.
              </p>
            </div>
          )}

          <div className="mb-8 flex flex-wrap gap-3 print:hidden">
            <PdfExportButton />

            {!isDemo && (
              <ReportDownloadLink
                href={`/api/realtor-report-download/${encodeURIComponent(String(inspectionId))}?type=full`}
                preparingText="Preparing PDF..."
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-cyan-500 bg-cyan-500/10 px-5 py-3 font-bold text-cyan-300 transition active:scale-[0.98] active:opacity-80 [touch-action:manipulation] hover:bg-cyan-500 hover:text-black"
              >
                <>⬇ Download Report</>
              </ReportDownloadLink>
            )}

            {!isDemo && canOpenInternalReportActions && (
              <>
                <a
                  href={clientSummaryGroups.length > 0 ? "#client-summary" : "#inspection-findings"}
                  className="rounded-xl border border-teal-500 px-5 py-3 font-bold text-teal-400 transition hover:bg-teal-500 hover:text-black"
                >
                  View Summary
                </a>

                <Link
                  href={`/client-portal/${inspectionId}`}
                  className="rounded-xl border border-emerald-500 px-5 py-3 font-bold text-emerald-300 transition hover:bg-emerald-500/10"
                >
                  Client Portal
                </Link>

                {canOpenEditableReport ? (
                  <Link
                    href={`/reports/${inspectionId}`}
                    className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
                  >
                    Full Editable Report
                  </Link>
                ) : null}
              </>
            )}
          </div>

          <section className="rounded-2xl border border-slate-700 bg-[#071224] p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
                  Report Ready
                </p>
                <h2 className="mt-2 text-3xl font-black text-white">
                  Inspection Overview
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  This report includes inspection information, limitations,
                  disclaimers, section reference photos, and documented findings.
                  Reference photos are documentation only and are not counted as defects.
                </p>
              </div>

              <div className="rounded-2xl border border-teal-500/40 bg-teal-500/10 px-6 py-4 text-center">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-300">
                  Total Defects
                </p>
                <p className="mt-1 text-5xl font-black text-white">
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

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <span>Click a defect type above to filter the findings list.</span>
              {activeDefectFilter !== "all" && (
                <Link
                  href={isDemo ? `/demo/${inspectionId}#inspection-findings` : `${buildShareHref()}#inspection-findings`}
                  className="rounded-full border border-slate-600 px-3 py-1 font-bold text-white hover:bg-slate-800"
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
            <section id="report-disclaimers" className="scroll-mt-[180px] md:scroll-mt-[220px] mt-8 rounded-2xl border border-purple-500/40 bg-[#071224] p-6 shadow-xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-purple-300">
                    Important Report Disclaimers
                  </p>
                  <h2 className="mt-2 text-3xl font-black text-white">
                    Scope, Limitations, and Age-Based Notices
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                    These disclaimers are part of the inspection report and should be reviewed with the same importance as the findings below.
                  </p>
                </div>

                <span className="rounded-full border border-purple-400/60 bg-purple-500/15 px-4 py-2 text-sm font-black text-purple-100">
                  {reportDisclaimers.length} notice{reportDisclaimers.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {reportDisclaimers.map((disclaimer: any) => (
                  <div
                    key={disclaimer.id}
                    className="rounded-xl border border-slate-700 bg-[#0f172a] p-5"
                  >
                    <h3 className="text-xl font-bold text-white">
                      {disclaimer.topic}
                    </h3>

                    <p className="mt-3 whitespace-pre-line leading-7 text-slate-300">
                      {disclaimer.disclaimer_text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showStandardsInShare && (
          <section id="standards-of-practice" className="scroll-mt-[180px] md:scroll-mt-[220px] mt-8 rounded-2xl border border-cyan-500/40 bg-[#071224] p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-cyan-300">
                  Report Reference
                </p>
                <h2 className="mt-2 text-3xl font-black text-white">
                  Standards of Practice
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  These standards define the systems inspected and identify items that are outside the required scope of a residential home inspection.
                </p>
              </div>

              <span className="rounded-full border border-cyan-400/60 bg-cyan-500/15 px-4 py-2 text-sm font-black text-cyan-100">
                {standardsOfPractice.length} section{standardsOfPractice.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {standardsOfPractice.map((standard) => (
                <details
                  key={standard.title}
                  open
                  className="group rounded-xl border border-slate-700 bg-[#0f172a] p-5 open:border-cyan-500/50"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-lg font-black text-white">
                        {standard.title}
                      </h3>
                      <span className="rounded-full border border-cyan-500/40 px-3 py-1 text-xs font-black text-cyan-300">
                        View
                      </span>
                    </div>
                  </summary>

                  <div className="mt-4 space-y-3 border-t border-slate-800 pt-4 text-sm leading-7 text-slate-300">
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
              className="scroll-mt-[180px] md:scroll-mt-[220px] mt-8 rounded-2xl border border-teal-500/40 bg-[#071224] p-6 shadow-xl"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
                    Client Summary
                  </p>
                  <h2 className="mt-2 text-3xl font-black text-white">
                    Key Findings Summary
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                    This summary highlights notable findings by severity so clients and agents can quickly review the most important report items. The full report below remains the complete inspection record.
                  </p>
                </div>

                <a
                  href="#inspection-findings"
                  className="rounded-xl border border-teal-500 px-4 py-3 text-sm font-black text-teal-300 transition hover:bg-teal-500 hover:text-black"
                >
                  View Full Findings
                </a>
              </div>

              <div className="mt-6 overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-700 bg-[#020617] p-2 print:hidden">
                <div className="flex w-max min-w-full gap-2">
                  <a
                    href="#client-summary"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-slate-700 px-4 py-3 text-sm font-black leading-none text-white transition hover:bg-slate-600"
                  >
                    <span className="text-base leading-none">☰</span><span>Summary</span>
                  </a>
                  <a
                    href="#client-summary-safety"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-red-500/40 px-4 py-3 text-sm font-black leading-none text-red-300 transition hover:bg-red-500/10"
                  >
                    <span className="text-base leading-none">⚠</span><span>Safety Hazards</span>
                  </a>
                  <a
                    href="#client-summary-repair"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-teal-500/40 px-4 py-3 text-sm font-black leading-none text-teal-300 transition hover:bg-teal-500/10"
                  >
                    <span className="text-base leading-none">🔧</span><span>Recommendations</span>
                  </a>
                  <a
                    href="#client-summary-maintenance"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-yellow-500/40 px-4 py-3 text-sm font-black leading-none text-yellow-300 transition hover:bg-yellow-500/10"
                  >
                    <span className="text-base leading-none">⚙</span><span>Maintenance</span>
                  </a>
                  {Object.keys(limitationsBySection).length > 0 && (
                    <a
                      href="#report-limitations"
                      className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-orange-500/40 px-4 py-3 text-sm font-black leading-none text-orange-300 transition hover:bg-orange-500/10"
                    >
                      <span className="text-base leading-none">🚧</span><span>Limitations</span>
                    </a>
                  )}
                  {reportDisclaimers && reportDisclaimers.length > 0 && (
                    <a
                      href="#report-disclaimers"
                      className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-purple-500/40 px-4 py-3 text-sm font-black leading-none text-purple-300 transition hover:bg-purple-500/10"
                    >
                      <span className="text-base leading-none">📝</span><span>Disclaimers</span>
                    </a>
                  )}
                  {showStandardsInShare && (
                    <a
                      href="#standards-of-practice"
                      className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-cyan-500/40 px-4 py-3 text-sm font-black leading-none text-cyan-300 transition hover:bg-cyan-500/10"
                    >
                      <span className="text-base leading-none">📘</span><span>Standards</span>
                    </a>
                  )}
                  <a
                    href="#inspection-findings"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-blue-500/40 px-4 py-3 text-sm font-black leading-none text-blue-300 transition hover:bg-blue-500/10"
                  >
                    <span className="text-base leading-none">📄</span><span>Full Report</span>
                  </a>
                </div>
              </div>

              <ClientSummaryAccordion groups={clientSummaryGroups} />
            </section>
          )}

          {inspection.executive_summary && (
            <section className="mt-8 rounded-2xl border border-purple-500/40 bg-[#071224] p-6 shadow-xl">
              <h2 className="text-2xl font-extrabold text-purple-300">
                Executive Summary
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                This client-friendly overview summarizes the report findings in plain language.
              </p>

              <div className="mt-5 whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-base leading-8 text-slate-100">
                {inspection.executive_summary}
              </div>
            </section>
          )}

          <details className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-teal-400">
                    Property Information
                  </h2>

                  <p className="mt-2 text-sm text-slate-400">
                    Click to expand property details and inspection information.
                  </p>
                </div>

                <span className="rounded-full border border-teal-500/40 px-4 py-2 text-sm font-bold text-teal-300">
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
                  <Info label="Realtor" value={inspection.realtor_name} />
                </>
              )}
              <Info label="Inspection Date" value={inspection.inspection_date} />
              <Info label="Inspection Time" value={inspection.inspection_time} />
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
              className="mt-8 rounded-2xl border border-cyan-500/40 bg-[#071224] p-6"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-cyan-300">
                      Equipment Inventory
                    </h2>

                    <p className="mt-2 text-sm text-slate-400">
                      Click to expand major systems and equipment documented during the inspection. These records are informational and are not counted as defects unless a separate finding is included.
                    </p>
                  </div>

                  <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-200">
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
                      className="rounded-xl border border-slate-700 bg-[#0f172a] p-4"
                    >
                      {equipmentImage && (
                        <img
                          src={equipmentImage}
                          alt={item.equipment_type || "Equipment"}
                          loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="mb-4 max-h-56 w-full rounded-xl border border-slate-700 object-contain"
                        />
                      )}

                      <p className="text-xs font-black uppercase tracking-wide text-cyan-300">
                        {item.equipment_type || "Equipment"}
                      </p>

                      <h3 className="mt-2 text-xl font-black text-white">
                        {[item.manufacturer, item.model].filter(Boolean).join(" ") || "Equipment Record"}
                      </h3>

                      <EquipmentStatusBadge value={getEquipmentStatusValue(item)} />

                      <div className="mt-4 space-y-2 text-sm text-slate-300">
                        <ShareEquipmentLine label="Serial" value={item.serial} />
                        <ShareEquipmentLine label="Manufacture Year" value={item.manufacture_year} />
                        <ShareEquipmentLine label="Estimated Age" value={item.estimated_age} />
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
                      </div>

                      <ShareEquipmentNoteBlock
                        label="Inspector Note"
                        value={getEquipmentInspectorNote(item)}
                      />

                      <ShareEquipmentNoteBlock
                        label="Maintenance Note"
                        value={getEquipmentMaintenanceNote(item)}
                      />
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {showEnvironmentalLinks && (
            <section className="mt-8 rounded-2xl border border-purple-500/40 bg-[#071224] p-6">
              <h2 className="text-2xl font-bold text-purple-300">
                Official Environmental Reports
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                These links open the official third-party environmental reports from the lab or testing device.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {hasMoldService(inspection) && moldReportUrl && (
                  <a
                    href={moldReportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-purple-500 bg-[#0f172a] p-5 font-bold text-purple-300 transition hover:bg-purple-500/10"
                  >
                    <span className="block text-lg">
                      View Official Mold Report
                    </span>
                    <span className="mt-2 block text-sm font-medium text-slate-400">
                      Open the official mold lab report.
                    </span>
                  </a>
                )}

                {hasRadonService(inspection) && radonReportUrl && (
                  <a
                    href={radonReportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-purple-500 bg-[#0f172a] p-5 font-bold text-purple-300 transition hover:bg-purple-500/10"
                  >
                    <span className="block text-lg">
                      View Official Radon Report
                    </span>
                    <span className="mt-2 block text-sm font-medium text-slate-400">
                      Open the official radon device report.
                    </span>
                  </a>
                )}
              </div>
            </section>
          )}

          {(sectionStats.length > 0 || equipmentInventory.length > 0) && (
            <section className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
              <h2 className="text-2xl font-bold text-teal-400">
                Section Snapshot
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Quick overview of findings and reference photos by report section.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sectionStats.map((stat) => (
                  <a
                    key={stat.section}
                    href={`#section-${stat.section
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")}`}
                    className="rounded-xl border border-slate-700 bg-[#0f172a] p-4 transition hover:border-teal-500/60 hover:bg-[#102033]"
                  >
                    <p className="font-black text-white">{stat.section}</p>
                    <p className="mt-2 text-sm text-slate-400">
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
                    <p className="font-black text-cyan-200">
                      Equipment Inventory
                    </p>
                    <p className="mt-2 text-sm text-slate-300">
                      {equipmentInventory.length} equipment record
                      {equipmentInventory.length === 1 ? "" : "s"} • informational only
                    </p>
                  </a>
                )}
              </div>
            </section>
          )}

          {inspection.report_summary && (
            <details className="mt-8 rounded-2xl border border-teal-500/40 bg-[#071224] p-6 shadow-xl">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-extrabold text-teal-300">
                      Report Summary
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      Click to expand the generated summary of notable findings and recommendations.
                    </p>
                  </div>
                  <span className="rounded-full border border-teal-500/40 px-4 py-2 text-sm font-bold text-teal-300">
                    Click to Expand
                  </span>
                </div>
              </summary>

              <div className="mt-5 whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-base leading-8 text-slate-100">
                {inspection.report_summary}
              </div>
            </details>
          )}

          {Object.keys(checklistBySection).length > 0 && (
            <details className="mt-8 rounded-2xl border border-slate-700 bg-[#071224] p-6">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-teal-400">
                      Inspection Information
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      Click to expand selected inspection information, component types, materials, and system details.
                    </p>
                  </div>
                  <span className="rounded-full border border-teal-500/40 px-4 py-2 text-sm font-bold text-teal-300">
                    Click to Expand
                  </span>
                </div>
              </summary>

              <div className="mt-5 space-y-6">
                {SECTION_ORDER.filter((section) => checklistBySection[section]).map(
                  (section) => (
                    <div
                      key={section}
                      className="rounded-xl border border-slate-700 bg-[#0f172a] p-5"
                    >
                      <h3 className="mb-4 text-xl font-bold text-white">
                        {section}
                      </h3>

                      <div className="grid gap-4 lg:grid-cols-2">
                        {Object.entries(checklistBySection[section]).map(
                          ([groupTitle, rows]: any) => (
                            <div key={groupTitle}>
                              <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
                                {groupTitle}
                              </p>

                              <p className="mt-1 whitespace-pre-line text-slate-100">
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
              className="scroll-mt-[180px] md:scroll-mt-[220px] mt-8 rounded-2xl border border-yellow-500/40 bg-[#071224] p-6"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-yellow-400">
                    Scope Notes
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-yellow-300">
                    Limitations
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Areas or components that could not be fully inspected are collapsed by default. Tap to review details and photos.
                  </p>
                </div>
                <span className="rounded-xl border border-yellow-500/40 px-4 py-2 text-sm font-black text-yellow-200">
                  Show Limitations
                </span>
              </summary>

              <div className="mt-6 space-y-6 border-t border-slate-700 pt-6">
                {SECTION_ORDER.filter((section) => limitationsBySection[section]).map(
                  (section) => (
                    <details
                      key={section}
                      className="rounded-xl border border-slate-700 bg-[#0f172a] p-5"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                        <h3 className="text-xl font-bold text-white">
                          {section}
                        </h3>
                        <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs font-black text-yellow-200">
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
                              className="rounded-xl border border-slate-700 bg-[#020617] p-4"
                            >
                              <p className="font-bold text-yellow-200">
                                {item.custom_text || item.label}
                              </p>

                              {limitationText && (
                                <p className="mt-3 whitespace-pre-line leading-7 text-slate-300">
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
                                        buttonClassName="block w-full overflow-hidden rounded-xl border border-slate-700 bg-black text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
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

          <section id="inspection-findings" className="scroll-mt-[180px] md:scroll-mt-[220px] mt-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
                  Inspection Findings
                </p>
                <h2 className="mt-2 text-4xl font-black text-white">
                  Findings By Section
                </h2>
                {activeDefectFilter !== "all" && (
                  <p className="mt-2 text-sm font-semibold text-teal-300">
                    Showing: {activeDefectFilterLabel[activeDefectFilter]} only
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-700 bg-[#071224] px-5 py-3 text-sm text-slate-300">
                {activeDefectFilter === "all"
                  ? `${defectTotals.total} total defect${defectTotals.total === 1 ? "" : "s"} documented`
                  : `${displayFindings.filter(isReportDefect).length} ${activeDefectFilterLabel[activeDefectFilter].toLowerCase()} finding${displayFindings.filter(isReportDefect).length === 1 ? "" : "s"}`}
              </div>
            </div>

            {groupedFindings.length === 0 ? (
              <div className="rounded-2xl border border-slate-700 bg-[#071224] p-8 text-center text-slate-300">
                No findings saved yet.
              </div>
            ) : (
              <div className="space-y-8">
                {groupedFindings.map((group) => {
                  const sectionDefects = group.findings.filter(isReportDefect).length;

                  return (
                    <section
                      key={group.section}
                      id={`section-${group.section
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")}`}
                      className="rounded-2xl border border-slate-700 bg-[#071224] p-6"
                    >
                      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 pb-4">
                        <h3 className="text-2xl font-black text-white">
                          {group.section}
                        </h3>

                        <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-sm font-bold text-teal-300">
                          {sectionDefects} defect{sectionDefects === 1 ? "" : "s"}
                        </span>
                      </div>

                      {sectionNotesByName.get(group.section) && (
                        <div className="mb-6 rounded-xl border border-slate-600 bg-[#0b1220] p-4">
                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">
                            {sectionNotesByName.get(group.section)}
                          </p>
                        </div>
                      )}

                      {referencePhotosBySection[group.section]?.length > 0 && (
                        <div className="mb-6 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4">
                          <h4 className="mb-3 text-lg font-bold text-cyan-300">
                            Section Reference Photos
                          </h4>

                          <p className="mb-4 text-sm text-slate-400">
                            These photos document general section conditions and are not defect findings.
                          </p>

                          <div className="grid gap-4 md:grid-cols-3">
                            {referencePhotosBySection[group.section].map((photo: any, index: number) => {
                              const photoUrl = photo.signed_thumbnail_url || photo.thumbnail_url || photo.signed_url || photo.public_url || photo.image_url || photo.photo_url || "";

                              if (!photoUrl) return null;

                              return (
                                <div
                                  key={photo.id || index}
                                  className="overflow-hidden rounded-xl border border-slate-700 bg-[#020617]"
                                >
                                  <ExpandableReportImage
                                    src={photoUrl}
                                    fullSrc={photo.signed_url || photo.public_url || photo.image_url || photo.photo_url || photoUrl}
                                    alt={photo.caption || `Section reference photo ${index + 1}`}
                                    badgeText="Tap to enlarge"
                                    className="max-h-[280px] w-full object-cover"
                                    buttonClassName="block w-full overflow-hidden bg-black text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                  />

                                  {photo.caption && (
                                    <p className="border-t border-slate-800 px-3 py-2 text-sm text-slate-300">
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
                        <div className="rounded-xl border border-slate-700 bg-[#020617]/70 p-5 text-slate-300">
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
                            <div key={finding.id} id={`finding-${finding.id}`} className="scroll-mt-[180px] md:scroll-mt-[220px]">
                              <details className="group overflow-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-xl md:hidden">
                                <summary className="cursor-pointer list-none">
                                  <div className="flex gap-3 p-3">
                                    {image && (
                                      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-[#020617]">
                                        {isVideo ? (
                                          <div className="relative h-full w-full bg-black">
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
                                            <span className="absolute inset-x-2 bottom-2 rounded-full border border-cyan-400 bg-black/75 px-2 py-1 text-center text-[10px] font-black uppercase tracking-wide text-cyan-300">
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
                                            buttonClassName="block h-full w-full overflow-hidden bg-[#020617] text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                          />
                                        )}
                                      </div>
                                    )}

                                    <div className="min-w-0 flex-1">
                                      <div className="mb-2 flex flex-wrap items-center gap-2">
                                        {finding.item_number && (
                                          <span className="rounded-full border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-200">
                                            Item #{finding.item_number}
                                          </span>
                                        )}
                                        <span
                                          className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${getSeverityClass(
                                            finding.severity
                                          )}`}
                                        >
                                          {finding.severity || "Recommended Repair"}
                                        </span>
                                      </div>

                                      <h4 className="line-clamp-2 break-words text-base font-black leading-tight text-white">
                                        {title}
                                      </h4>

                                      {finding.location && (
                                        <p className="mt-1 truncate text-xs font-bold text-slate-400">
                                          📍 {finding.location}
                                        </p>
                                      )}

                                      <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wide text-teal-300">
                                        {finding.section}
                                      </p>

                                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">
                                        {summary}
                                      </p>

                                      <p className="mt-2 text-xs font-black text-cyan-300">
                                        View Finding →
                                      </p>
                                    </div>
                                  </div>
                                </summary>

                                <div className="border-t border-slate-700 p-4">
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

                                        return mediaIsVideo ? (
                                          <video
                                            key={media.id || media.file_path || mediaUrl || mediaIndex}
                                            src={getVideoPreviewSrc(mediaUrl)}
                                            poster={mediaPreviewUrl && mediaPreviewUrl !== mediaUrl ? mediaPreviewUrl : undefined}
                                            controls
                                            muted
                                            playsInline
                                            preload="metadata"
                                            className="max-h-[520px] w-full rounded-xl border border-slate-700 bg-black object-contain"
                                          >
                                            Your browser does not support video playback.
                                          </video>
                                        ) : (
                                          <ExpandableReportImage
                                            key={media.id || media.file_path || mediaUrl || mediaIndex}
                                            src={mediaPreviewUrl || mediaUrl}
                                            fullSrc={mediaUrl}
                                            alt={`Inspection finding photo ${mediaIndex + 1}`}
                                            badgeText="Tap to enlarge"
                                            className="max-h-[520px] w-full object-contain"
                                            buttonClassName="block w-full overflow-hidden rounded-xl border border-slate-700 bg-black text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                            images={galleryImages}
                                            index={photoIndex >= 0 ? photoIndex : 0}
                                          />
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

                                    <FindingTextCard
                                      title="Additional Notes"
                                      value={finding.comment}
                                      tone="slate"
                                    />
                                  </div>
                                </div>
                              </details>

                              <article className="hidden overflow-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-xl md:block">
                                <div className="border-b border-slate-700 bg-[#020817] p-5">
                                  <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        {finding.item_number && (
                                          <span className="rounded-full border border-cyan-500/50 bg-cyan-500/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-cyan-200">
                                            Item #{finding.item_number}
                                          </span>
                                        )}
                                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                          {finding.section}
                                        </span>
                                      </div>

                                      <h4 className="mt-2 text-2xl font-black text-teal-300">
                                        {title}
                                      </h4>

                                      {finding.location && (
                                        <p className="mt-1 text-sm font-bold text-slate-400">
                                          📍 {finding.location}
                                        </p>
                                      )}
                                    </div>

                                    <span
                                      className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide ${getSeverityClass(
                                        finding.severity
                                      )}`}
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

                                        return mediaIsVideo ? (
                                          <video
                                            key={media.id || media.file_path || mediaUrl || mediaIndex}
                                            src={getVideoPreviewSrc(mediaUrl)}
                                            poster={mediaPreviewUrl && mediaPreviewUrl !== mediaUrl ? mediaPreviewUrl : undefined}
                                            controls
                                            muted
                                            playsInline
                                            preload="metadata"
                                            className={`w-full rounded-xl border border-slate-700 bg-black object-contain ${
                                              mediaList.length > 1 ? "max-h-[520px]" : "max-h-[640px]"
                                            }`}
                                          >
                                            Your browser does not support video playback.
                                          </video>
                                        ) : (
                                          <ExpandableReportImage
                                            key={media.id || media.file_path || mediaUrl || mediaIndex}
                                            src={mediaPreviewUrl || mediaUrl}
                                            fullSrc={mediaUrl}
                                            alt={`Inspection finding photo ${mediaIndex + 1}`}
                                            badgeText="Tap to enlarge"
                                            className={`w-full object-contain ${
                                              mediaList.length > 1 ? "max-h-[520px]" : "max-h-[640px]"
                                            }`}
                                            buttonClassName="block w-full overflow-hidden rounded-xl border border-slate-700 bg-black text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                            images={galleryImages}
                                            index={photoIndex >= 0 ? photoIndex : 0}
                                          />
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

                                    <FindingTextCard
                                      title="Additional Notes"
                                      value={finding.comment}
                                      tone="slate"
                                    />
                                  </div>
                                </div>
                              </article>
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

          <footer className="mt-12 border-t border-slate-700 pt-6 text-sm text-slate-400">
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
      className={`group overflow-hidden rounded-2xl border bg-[#020617] transition hover:-translate-y-0.5 hover:border-white/40 open:md:col-span-2 open:hover:translate-y-0 ${toneClass}`}
    >
      <summary className="cursor-pointer list-none">
        {mediaUrl && (
          <div className="h-52 overflow-hidden border-b border-slate-800 bg-black">
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
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-black">
                    <div className="rounded-full border border-cyan-400 bg-black/75 px-4 py-2 text-xs font-black uppercase tracking-wide text-cyan-300">
                      ▶ Video
                    </div>
                  </div>
                )}
                <span className="absolute inset-x-4 bottom-4 rounded-full border border-cyan-400 bg-black/75 px-3 py-2 text-center text-xs font-black uppercase tracking-wide text-cyan-300">
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
              <span className="rounded-full border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-200">
                Item #{finding.item_number}
              </span>
            )}
            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${getSeverityClass(
                finding.severity
              )}`}
            >
              {finding.severity || "Recommended Repair"}
            </span>
            <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-300">
              {finding.section || "Report"}
            </span>
          </div>

          <h4 className="line-clamp-2 text-lg font-black leading-tight text-white group-open:line-clamp-none">
            {title}
          </h4>

          {finding.location && (
            <p className="mt-1 line-clamp-1 text-xs font-bold text-slate-400">
              📍 {finding.location}
            </p>
          )}

          <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300 group-open:line-clamp-none">
            {summary}
          </p>

          <p className="mt-4 text-sm font-black text-cyan-300">
            <span className="group-open:hidden">Tap to Expand →</span>
            <span className="hidden group-open:inline">Expanded Details</span>
          </p>
        </div>
      </summary>

      <div className="border-t border-slate-800 p-4">
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
                      className="max-h-[360px] w-full rounded-xl border border-slate-700 bg-black object-contain"
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
                    className="max-h-[360px] w-full rounded-xl border border-slate-700 object-contain"
                    buttonClassName="block w-full overflow-hidden rounded-xl border border-slate-700 bg-black text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
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
        </div>

        <a
          href={`#section-${String(finding.section || "other")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`}
          className="mt-4 inline-flex rounded-xl border border-cyan-500/50 px-4 py-3 text-sm font-black text-cyan-300 transition hover:bg-cyan-500 hover:text-black"
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
  const color =
    tone === "red"
      ? "text-red-300 border-red-500/30 bg-red-500/10 hover:bg-red-500/20"
      : tone === "yellow"
      ? "text-yellow-300 border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20"
      : tone === "blue"
      ? "text-blue-300 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20"
      : "text-teal-300 border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20";

  return (
    <Link
      href={href}
      className={`rounded-xl border p-4 text-center transition ${color} ${
        active ? "ring-2 ring-white/70" : ""
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-300">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-400">
        Click to filter
      </p>
    </Link>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-base font-semibold text-white">
        {value || "N/A"}
      </p>
    </div>
  );
}

function InventoryLine({ label, value }: { label: string; value?: any }) {
  if (!isKnownEquipmentValue(value)) return null;

  return (
    <div className="flex justify-between gap-3 border-b border-slate-800 pb-1">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-200">{value}</span>
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
      : "border-slate-700 bg-[#020817]";

  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <p className="text-sm font-black uppercase tracking-wide text-white">
        {title}
      </p>

      <p className="mt-2 whitespace-pre-line text-base leading-7 text-slate-200">
        {value}
      </p>
    </div>
  );
}
