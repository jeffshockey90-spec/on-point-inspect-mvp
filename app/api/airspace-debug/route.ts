import { NextResponse } from "next/server";
import { geocodeAddress } from "../../../lib/geocode";
import { getAirspace } from "../../../lib/airspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY diagnostic (token-gated, no session) to see EXACTLY what production
// resolves an address to and why the drone-airspace check returns what it does.
// Delete this route once the Grainary "false clear" is root-caused.
const DEBUG_TOKEN = "flow-air-diag-7Qz2";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("token") !== DEBUG_TOKEN) {
    return NextResponse.json({ error: "nope" }, { status: 404 });
  }

  const address = searchParams.get("address") || "";
  const out: any = {
    address,
    hasGoogleKey: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    googleKeyTail: (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").slice(-6),
    uasfmUrlOverride: process.env.FAA_UASFM_URL || null,
  };

  try {
    const coords = await geocodeAddress(address);
    out.geocode = coords;
    if (coords) {
      const airspace = await getAirspace(coords.lat, coords.lng);
      out.airspace = {
        status: airspace.status,
        airspaceClass: airspace.airspaceClass,
        ceilingFt: airspace.ceilingFt,
        airport: airspace.airport,
        headline: airspace.headline,
      };
    }
  } catch (e: any) {
    out.error = e?.message || String(e);
  }

  return NextResponse.json(out);
}
