import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { geocodeAddress } from "../../../lib/geocode";
import { getAirspace } from "../../../lib/airspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/airspace
//   ?lat=..&lng=..            OR  ?address=<full street address>
//
// Returns the drone/Part-107 airspace situation at the property (FAA UAS
// Facility Map — the same data behind LAANC). Requires a logged-in user so it
// isn't an open FAA proxy. Reuses the existing Google geocoder for address ->
// lat/lng, mirroring /api/weather.
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    let lat = Number(searchParams.get("lat"));
    let lng = Number(searchParams.get("lng"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const address = searchParams.get("address") || "";
      if (!address.trim()) {
        return NextResponse.json(
          { error: "Provide either lat/lng or an address." },
          { status: 400 },
        );
      }

      const coords = await geocodeAddress(address);
      if (!coords) {
        return NextResponse.json(
          { error: "Could not locate that address to check airspace." },
          { status: 422 },
        );
      }
      lat = coords.lat;
      lng = coords.lng;
    }

    const airspace = await getAirspace(lat, lng);
    return NextResponse.json({ airspace });
  } catch (error: any) {
    console.error("Airspace route error:", error);
    return NextResponse.json(
      { error: error?.message || "Airspace lookup failed." },
      { status: 500 },
    );
  }
}
