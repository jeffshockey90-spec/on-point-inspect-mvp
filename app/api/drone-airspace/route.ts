import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { geocodeAddress } from "../../../lib/geocode";
import { getAirspace } from "../../../lib/airspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Drone / Part-107 airspace check — POST so no layer (in-app WebView, service
// worker, CDN) can ever cache the answer. A cached "clear to fly" on controlled
// airspace is a safety bug, and GET caching is exactly what stranded the old
// endpoint. Body: { address } OR { lat, lng }. Auth-required so it isn't an open
// FAA/geocode proxy. Reuses the proven getAirspace() logic in lib/airspace.ts.

const NO_STORE: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE });
    }

    const body = await req.json().catch(() => ({} as any));

    let lat = Number(body?.lat);
    let lng = Number(body?.lng);
    let resolvedFrom: string | null = null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const address = String(body?.address || "").trim();
      if (!address) {
        return NextResponse.json(
          { error: "Provide an address or lat/lng." },
          { status: 400, headers: NO_STORE },
        );
      }
      const coords = await geocodeAddress(address);
      if (!coords) {
        return NextResponse.json(
          { error: "Could not locate that address to check airspace." },
          { status: 422, headers: NO_STORE },
        );
      }
      lat = coords.lat;
      lng = coords.lng;
      resolvedFrom = address;
    }

    const airspace = await getAirspace(lat, lng);
    // Echo the resolved point so the card can show exactly what was checked.
    return NextResponse.json(
      { airspace, resolved: { lat, lng, from: resolvedFrom } },
      { headers: NO_STORE },
    );
  } catch (error: any) {
    console.error("Drone airspace route error:", error);
    return NextResponse.json(
      { error: error?.message || "Airspace lookup failed." },
      { status: 500, headers: NO_STORE },
    );
  }
}
