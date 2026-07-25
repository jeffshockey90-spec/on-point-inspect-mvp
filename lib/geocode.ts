// Server-side helpers for turning a street address into coordinates and for
// computing driving distance between two points, both via Google's APIs.
// Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY - already used server-side elsewhere
// in this codebase (app/api/property-lookup/route.ts); the NEXT_PUBLIC_
// prefix only controls client-bundle inlining, it works fine read from
// process.env on the server too.

export type LatLng = { lat: number; lng: number };

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const clean = String(address || "").trim();
  if (!apiKey || !clean) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      clean
    )}&key=${apiKey}`;

    const response = await fetch(url, { cache: "no-store" });
    const json: any = await response.json();

    const location = json?.results?.[0]?.geometry?.location;
    if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
      return null;
    }

    return { lat: location.lat, lng: location.lng };
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

type DistancePoint = LatLng | string;

function formatDistancePoint(point: DistancePoint) {
  return typeof point === "string" ? point : `${point.lat},${point.lng}`;
}

// Accepts either coordinates or a raw address string for origin/destination.
// Prefer passing the same address text used for the embedded map (rather than
// separately-geocoded coordinates) so the computed distance always matches
// what the map itself resolves and displays - geocoding the same address
// twice through different Google endpoints can snap to slightly different
// points, especially for rural/county-road addresses.
export async function getDrivingDistance(
  origin: DistancePoint,
  destination: DistancePoint
): Promise<{ miles: number; minutes: number } | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${encodeURIComponent(formatDistancePoint(origin))}` +
      `&destinations=${encodeURIComponent(formatDistancePoint(destination))}` +
      `&units=imperial&key=${apiKey}`;

    const response = await fetch(url, { cache: "no-store" });
    const json: any = await response.json();

    const element = json?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") return null;

    const meters = Number(element?.distance?.value);
    const seconds = Number(element?.duration?.value);
    if (!Number.isFinite(meters) || !Number.isFinite(seconds)) return null;

    return {
      miles: Math.round((meters / 1609.344) * 10) / 10,
      minutes: Math.round(seconds / 60),
    };
  } catch (error) {
    console.error("Distance Matrix error:", error);
    return null;
  }
}
