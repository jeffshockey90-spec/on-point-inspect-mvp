// Drone airspace check for Part 107 flights (e.g. drone roof inspections).
//
// Data source: the FAA's UAS Facility Map (UASFM) — the SAME grid data that
// powers LAANC. It's a free, public ArcGIS feature service (no key). We ask it
// one point-in-polygon question for the property's coordinates and it tells us,
// for that grid cell:
//   - the controlling airspace class (B/C/D/E), and
//   - the CEILING: the max altitude AGL (0, 50, 100, 200, 300, 400 ft) at which
//     LAANC can AUTO-authorize a Part 107 flight there. 0 = no auto-approval
//     (needs a manual FAA authorization), and NO grid cell at all = uncontrolled
//     Class G airspace, i.e. clear to fly up to 400 ft with no authorization.
//
// This is a PRE-FLIGHT PLANNING AID, not an FAA authorization. The remote PIC is
// still responsible for filing LAANC, checking active TFRs day-of, and complying
// with Part 107. The UI wording reflects that.

export type AirspaceStatus =
  // Inside a prohibited area (P-xx) — a hard no-fly zone. Overrides everything.
  | "prohibited"
  // Class G / uncontrolled — no authorization needed (fly ≤400 ft AGL).
  | "clear"
  // Controlled airspace, but LAANC can auto-authorize up to a ceiling.
  | "laanc"
  // Controlled airspace with a 0-ft LAANC ceiling — needs a manual FAA
  // authorization (no auto-approval available for this grid).
  | "authorization"
  // The check couldn't be completed (service down, no coords, etc.).
  | "unknown";

export type AirspaceResult = {
  status: AirspaceStatus;
  controlled: boolean;
  airspaceClass: string | null; // "B" | "C" | "D" | "E" | "G" | null
  ceilingFt: number | null; // LAANC ceiling AGL; null when uncontrolled/unknown
  laancAvailable: boolean;
  airport: { faaId: string | null; icao: string | null; name: string | null } | null;
  // Set when the point falls inside a prohibited area (e.g. P-40 Camp David) or
  // another hard no-fly overlay (national security site, defense TFR, DC FRZ).
  restrictedAreaName: string | null;
  // Non-blocking heads-ups that don't change the fly/no-fly status but the pilot
  // must know: inside the DC SFRA outer ring, a stadium within 3 NM, etc. A green
  // "clear" can still carry advisories.
  advisories: string[];
  headline: string; // short status line
  detail: string; // one-sentence plain-English guidance
  lat: number;
  lng: number;
  source: "faa-uasfm";
  checkedAt: string; // ISO timestamp
};

// Verified live 2026-09 (returns CEILING / AIRSPACE_1 / APT1_* fields). Override
// with FAA_UASFM_URL if the FAA republishes the layer at a new address.
const UASFM_URL =
  process.env.FAA_UASFM_URL ||
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0/query";

// FAA Prohibited Areas (P-xx). A hard, 24/7 no-fly overlay the UASFM grid does
// NOT encode — e.g. P-40 (Camp David) and P-56 (Washington, DC), both inside/
// near On Point's own service area. Verified live 2026-09.
const PROHIBITED_URL =
  process.env.FAA_PROHIBITED_URL ||
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Prohibited_Areas/FeatureServer/0/query";

// A couple of well-known prohibited areas get a friendlier name in the UI.
const PROHIBITED_FRIENDLY: Record<string, string> = {
  "P-40": "Camp David",
  "P-56": "Washington, DC",
};

// Nationwide hard no-fly overlays the UASFM grid doesn't encode, all from the
// same free FAA ArcGIS org (no key). These make the check correct EVERYWHERE,
// not just near airports. Verified live 2026-09.
//  - National Security UAS Flight Restrictions: fixed security sites (military
//    ocean terminals, etc.) where drone flight is barred.
//  - National Defense Airspace TFR Areas: active national-defense TFRs.
const NATSEC_URL =
  process.env.FAA_NATSEC_URL ||
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Part_Time_National_Security_UAS_Flight_Restrictions/FeatureServer/0/query";
const NATDEF_TFR_URL =
  process.env.FAA_NATDEF_TFR_URL ||
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/National_Defense_Airspace_TFR_Areas/FeatureServer/0/query";
// Stadiums (points): a 3 NM / event-window TFR applies during major sporting
// events. A nearby stadium is an ADVISORY, not a block.
const STADIUMS_URL =
  process.env.FAA_STADIUMS_URL ||
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Stadiums/FeatureServer/0/query";

// Washington DC Special Flight Rules Area (SFRA), centered on the DCA VOR. This
// is a fixed geographic rule (no polygon layer needed, so it can never go
// stale): inside ~15 NM is the Flight Restricted Zone (FRZ) where drone flight
// is barred without specific FAA authorization; 15–30 NM is the outer SFRA where
// Part 107 flights are allowed but under special rules. Much of the DC metro
// (Montgomery County, etc.) sits in the outer ring.
const DCA = { lat: 38.8512, lng: -77.0402 };
const DC_FRZ_NM = 15;
const DC_SFRA_NM = 30;

function haversineNm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3440.065; // nautical miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function num(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nonEmpty(value: any): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

// Fetch + parse a FAA ArcGIS query with a hard timeout and one retry, so a
// single transient blip or a serverless cold-start latency spike doesn't leave
// the airspace check stranded on "could not be checked." Returns the parsed
// JSON, or null on a genuine failure (caller decides how to fail — safe, never
// toward "clear"). Never throws.
async function faaFetchJson(
  url: string,
  { timeoutMs = 7000, retries = 1 }: { timeoutMs?: number; retries?: number } = {},
): Promise<any | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          // Some ArcGIS front-ends are unhappy with a bare/empty UA from
          // datacenter egress; identify ourselves and ask for JSON explicitly.
          "User-Agent": "FLOW-Inspect airspace-check (+https://flowinspect.app)",
          Accept: "application/json",
        },
      });
      clearTimeout(timer);
      if (!res.ok) continue; // retry a non-200
      const json = await res.json().catch(() => null);
      if (!json || json.error) continue; // retry a soft/error body
      return json;
    } catch {
      clearTimeout(timer);
      // fall through to retry / return null
    }
  }
  return null;
}

// Turn a normalized result into the human-facing headline + detail copy.
function describe(partial: Omit<AirspaceResult, "headline" | "detail">): {
  headline: string;
  detail: string;
} {
  const cls = partial.airspaceClass ? `Class ${partial.airspaceClass}` : "Controlled";
  const apt = partial.airport?.name ? ` (${partial.airport.name})` : "";

  switch (partial.status) {
    case "prohibited": {
      const area = partial.restrictedAreaName ? ` (${partial.restrictedAreaName})` : "";
      return {
        headline: `No-fly zone — prohibited airspace${area}`,
        detail:
          `This location is inside FAA prohibited airspace${area}. Drone flights are banned here 24/7 — do not fly, and do not offer a drone roof inspection at this address.`,
      };
    }
    case "clear":
      return {
        headline: "Clear to fly — uncontrolled airspace",
        detail:
          "This location is in Class G airspace. No FAA authorization is required to fly under Part 107, up to 400 ft above ground level. Still confirm there are no active TFRs on the day of the flight.",
      };
    case "laanc":
      return {
        headline: `LAANC required — ${cls} airspace`,
        detail:
          `This location sits in controlled airspace${apt}. LAANC can authorize a Part 107 flight up to ${partial.ceilingFt} ft AGL — get the authorization approved before you launch. Confirm active TFRs day-of.`,
      };
    case "authorization":
      return {
        headline: `FAA authorization required — ${cls} airspace`,
        detail:
          `This grid has a 0 ft LAANC ceiling${apt}, so there's no instant approval here. A flight needs a manual FAA authorization (DroneZone) before it can be flown. Confirm active TFRs day-of.`,
      };
    default:
      return {
        headline: "Airspace could not be checked",
        detail:
          "We couldn't reach the FAA airspace data for this address. Check the airspace manually (B4UFLY / a LAANC provider) before flying a drone here.",
      };
  }
}

// From a set of UASFM grid features, pick the most conservative one (the lowest
// LAANC ceiling) so we never over-promise altitude at a boundary. Returns the
// normalized cell fields, or null if there are no usable features.
function pickConservativeCell(features: any[]): {
  ceiling: number | null;
  airspaceClass: string | null;
  airport: { faaId: string | null; icao: string | null; name: string | null };
  hasAirport: boolean;
} | null {
  if (!Array.isArray(features) || features.length === 0) return null;
  let best: any = null;
  let bestCeiling = Number.POSITIVE_INFINITY;
  for (const f of features) {
    const c = num(f?.attributes?.CEILING);
    const ceilingForCompare = c == null ? Number.POSITIVE_INFINITY : c;
    if (ceilingForCompare < bestCeiling) {
      bestCeiling = ceilingForCompare;
      best = f;
    }
  }
  best = best || features[0];
  const attrs = best?.attributes || {};
  const airport = {
    faaId: nonEmpty(attrs.APT1_FAAID),
    icao: nonEmpty(attrs.APT1_ICAO),
    name: nonEmpty(attrs.APT1_NAME),
  };
  return {
    ceiling: num(attrs.CEILING),
    airspaceClass: nonEmpty(attrs.AIRSPACE_1),
    airport,
    hasAirport: Boolean(airport.faaId || airport.icao || airport.name),
  };
}

/**
 * Determine the drone/Part-107 airspace situation at a coordinate.
 * Never throws — returns a "unknown" result if the FAA service is unreachable.
 */
export async function getAirspace(lat: number, lng: number): Promise<AirspaceResult> {
  const base: Omit<AirspaceResult, "headline" | "detail"> = {
    status: "unknown",
    controlled: false,
    airspaceClass: null,
    ceilingFt: null,
    laancAvailable: false,
    airport: null,
    restrictedAreaName: null,
    advisories: [],
    lat,
    lng,
    source: "faa-uasfm",
    checkedAt: new Date().toISOString(),
  };

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ...base, ...describe(base) };
  }

  const pointParams = (outFields: string) =>
    new URLSearchParams({
      f: "json",
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields,
      returnGeometry: "false",
    });

  // Point-with-radius query (for point layers like Stadiums, and the UASFM
  // boundary corroboration).
  const nearParams = (outFields: string, meters: number) =>
    new URLSearchParams({
      f: "json",
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      distance: String(meters),
      units: "esriSRUnit_Meter",
      outFields,
      returnGeometry: "false",
    });

  try {
    // One parallel batch (all resilient — timeout + retry): the controlled-
    // airspace grid PLUS every nationwide hard-no-fly overlay the grid doesn't
    // encode, plus nearby stadiums. This is what makes the check correct in ALL
    // areas, not just near airports.
    const [json, prohJson, natsecJson, natdefJson, stadiumJson] = await Promise.all([
      faaFetchJson(`${UASFM_URL}?${pointParams("CEILING,AIRSPACE_1,APT1_FAAID,APT1_ICAO,APT1_NAME").toString()}`),
      faaFetchJson(`${PROHIBITED_URL}?${pointParams("NAME,COMM_NAME,TYPE_CODE").toString()}`),
      faaFetchJson(`${NATSEC_URL}?${pointParams("Base,Facility,Reason").toString()}`),
      faaFetchJson(`${NATDEF_TFR_URL}?${pointParams("NAME,CITY,STATE").toString()}`),
      faaFetchJson(`${STADIUMS_URL}?${nearParams("NAME", 5556).toString()}`), // 3 NM
    ]);

    // ---- Advisories: non-blocking heads-ups that ride along with ANY status
    // (a green "clear" can still carry one).
    const advisories: string[] = [];

    // Washington DC SFRA. The outer ring (15–30 NM from DCA) is flyable under
    // Part 107 with special rules; the inner FRZ (≤15 NM) is a hard restriction
    // handled below. Much of the DC metro sits in this outer ring.
    const dcNm = haversineNm(lat, lng, DCA.lat, DCA.lng);
    if (dcNm > DC_FRZ_NM && dcNm <= DC_SFRA_NM) {
      advisories.push(
        `Inside the Washington DC SFRA (outer ring, ~${Math.round(dcNm)} NM from DCA). Part 107 flights are allowed, but you must be a registered operator following SFRA procedures — and must not enter the 15 NM Flight Restricted Zone.`,
      );
    }

    // Stadium within 3 NM: a TFR bars drone flight from 1 hr before to 1 hr
    // after a major sporting event. An event-day heads-up, not a blanket block.
    const stadiumFeat = Array.isArray(stadiumJson?.features) ? stadiumJson.features[0] : null;
    if (stadiumFeat) {
      const nm = nonEmpty(stadiumFeat?.attributes?.NAME);
      advisories.push(
        `Stadium within 3 NM${nm ? ` (${nm})` : ""} — drone flights are barred from 1 hour before to 1 hour after a major sporting event. Check the event schedule before flying.`,
      );
    }

    base.advisories = advisories;

    // ---- Hard no-fly overrides (most restrictive wins), independent of the
    // UASFM grid so they hold even if the grid query itself failed.
    // 1) Prohibited area (P-xx) — e.g. P-56 Washington DC, P-40 Camp David.
    const prohFeat = Array.isArray(prohJson?.features) ? prohJson.features[0] : null;
    if (prohFeat) {
      const a = prohFeat.attributes || {};
      const code = nonEmpty(a.NAME);
      const friendly = code ? PROHIBITED_FRIENDLY[code] : null;
      const label = [code, friendly].filter(Boolean).join(" · ") || nonEmpty(a.COMM_NAME);
      const prohibited: Omit<AirspaceResult, "headline" | "detail"> = {
        ...base,
        status: "prohibited",
        controlled: true,
        restrictedAreaName: label,
      };
      return { ...prohibited, ...describe(prohibited) };
    }

    // 2) National security site or active national-defense TFR → hard no-fly.
    const natsecFeat = Array.isArray(natsecJson?.features) ? natsecJson.features[0] : null;
    const natdefFeat = Array.isArray(natdefJson?.features) ? natdefJson.features[0] : null;
    if (natsecFeat || natdefFeat) {
      const label = natsecFeat
        ? nonEmpty(natsecFeat?.attributes?.Base) ||
          nonEmpty(natsecFeat?.attributes?.Facility) ||
          "National security site"
        : nonEmpty(natdefFeat?.attributes?.NAME) || "National defense TFR";
      const restricted: Omit<AirspaceResult, "headline" | "detail"> = {
        ...base,
        status: "prohibited",
        controlled: true,
        restrictedAreaName: label,
      };
      return {
        ...restricted,
        headline: `No-fly zone — ${natsecFeat ? "national security area" : "national defense TFR"}`,
        detail: `This location is inside a${
          natsecFeat ? " national security UAS flight restriction" : "n active national defense TFR"
        } (${label}). Drone flights are prohibited here — do not fly.`,
      };
    }

    // 3) Washington DC Flight Restricted Zone (inner ~15 NM). Drone flight needs
    // specific FAA/TSA authorization and is effectively off-limits for a routine
    // inspection — surface it red.
    if (dcNm <= DC_FRZ_NM) {
      const frz: Omit<AirspaceResult, "headline" | "detail"> = {
        ...base,
        status: "authorization",
        controlled: true,
        restrictedAreaName: "DC Flight Restricted Zone",
      };
      return {
        ...frz,
        headline: "Restricted — Washington DC Flight Restricted Zone",
        detail: `This address is inside the Washington DC FRZ (~${Math.round(
          dcNm,
        )} NM from DCA). Drone flights here require specific FAA/TSA authorization and are effectively off-limits for a routine inspection — do not fly without that authorization.`,
      };
    }

    // ---- No hard override → classify from the UASFM controlled-airspace grid.
    // Couldn't reach / parse it → fail safe (unknown), never toward "clear."
    if (!json) return { ...base, ...describe(base) };

    const features: any[] = Array.isArray(json?.features) ? json.features : [];

    // No grid cell intersects the exact point. That is NOT automatically "clear
    // to fly": an empty response is also what a grid gap/boundary, a slightly
    // off geocode (common on brand-new construction), or a transient FAA hiccup
    // produce — and near an airport that would become a confident FALSE all-
    // clear. So we never declare Class G from a non-answer near controlled
    // airspace. Corroborate with a small buffered query first, and fail SAFE
    // (verify manually), never fail toward "go fly."
    if (features.length === 0) {
      // ~1 mile buffer around the point. If controlled airspace is right here
      // but the exact cell came back empty, we're at the edge of the mapped
      // grid — treat it as controlled and tell the pilot to verify.
      const nearbyJson = await faaFetchJson(
        `${UASFM_URL}?${nearParams("CEILING,AIRSPACE_1,APT1_FAAID,APT1_ICAO,APT1_NAME", 1609).toString()}`,
      );

      // Couldn't corroborate (FAA unreachable on the second call) → don't guess
      // "clear," say unknown so the pilot verifies manually.
      if (!nearbyJson) return { ...base, ...describe(base) };

      const nearbyFeatures: any[] = Array.isArray(nearbyJson?.features) ? nearbyJson.features : [];

      const nearCell = pickConservativeCell(nearbyFeatures);

      // Genuinely nothing controlled for a mile around → real Class G, clear.
      if (!nearCell) {
        const clear: Omit<AirspaceResult, "headline" | "detail"> = {
          ...base,
          status: "clear",
          controlled: false,
          airspaceClass: "G",
          ceilingFt: null,
          laancAvailable: false,
        };
        return { ...clear, ...describe(clear) };
      }

      // Controlled airspace is adjacent but the exact point fell outside the
      // mapped grid. Err on the side of caution: report it as controlled and
      // make clear it must be verified before flying.
      const laancAvailable = nearCell.ceiling != null && nearCell.ceiling > 0;
      const cls = nearCell.airspaceClass ? `Class ${nearCell.airspaceClass}` : "controlled";
      const apt = nearCell.hasAirport && nearCell.airport.name ? ` (${nearCell.airport.name})` : "";
      const edge: Omit<AirspaceResult, "headline" | "detail"> = {
        ...base,
        status: laancAvailable ? "laanc" : "authorization",
        controlled: true,
        airspaceClass: nearCell.airspaceClass,
        ceilingFt: nearCell.ceiling,
        laancAvailable,
        airport: nearCell.hasAirport ? nearCell.airport : null,
      };
      return {
        ...edge,
        headline: `Verify before flying — near ${cls} airspace`,
        detail:
          `This address sits at the edge of the mapped ${cls} grid${apt}, so the FAA map didn't return a ceiling for the exact point — but controlled airspace is right here. Do NOT treat this as clear: confirm the requirement in a LAANC provider or B4UFLY, and file ${laancAvailable ? "LAANC" : "an FAA authorization (DroneZone)"} if required, before you launch. Confirm active TFRs day-of.`,
      };
    }

    // A point can touch more than one grid cell at a boundary. Take the most
    // conservative (lowest LAANC ceiling) so we never over-promise altitude.
    const cell = pickConservativeCell(features)!;
    const laancAvailable = cell.ceiling != null && cell.ceiling > 0;
    const controlled: Omit<AirspaceResult, "headline" | "detail"> = {
      ...base,
      status: laancAvailable ? "laanc" : "authorization",
      controlled: true,
      airspaceClass: cell.airspaceClass,
      ceilingFt: cell.ceiling,
      laancAvailable,
      airport: cell.hasAirport ? cell.airport : null,
    };
    return { ...controlled, ...describe(controlled) };
  } catch (error) {
    console.error("Airspace lookup error:", error);
    return { ...base, ...describe(base) };
  }
}
