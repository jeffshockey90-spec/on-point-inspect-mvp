import crypto from "crypto";

// Apple Maps Server API geocoding — often more accurate than Google on new-
// construction and rural addresses (a real pain point on pre-drywall jobs).
// Used as the PREFERRED geocoder when configured; lib/geocode.ts falls back to
// Google automatically, so nothing breaks when it isn't set up.
//
// Setup (one time, in Apple Developer): create a MapKit JS key, then set:
//   APPLE_MAPS_TEAM_ID      — your 10-char Apple Developer Team ID
//   APPLE_MAPS_KEY_ID       — the Key ID of the MapKit JS key
//   APPLE_MAPS_PRIVATE_KEY  — the .p8 private key contents (PEM). \n-escaped is fine.

const TEAM_ID = process.env.APPLE_MAPS_TEAM_ID;
const KEY_ID = process.env.APPLE_MAPS_KEY_ID;
const PRIVATE_KEY = (process.env.APPLE_MAPS_PRIVATE_KEY || "").replace(/\\n/g, "\n");

export function appleMapsConfigured(): boolean {
  return Boolean(TEAM_ID && KEY_ID && PRIVATE_KEY);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// A short-lived ES256 JWT identifying this app to Apple Maps (signed with the
// MapKit .p8 key). Node's crypto signs ES256 in raw r||s form via ieee-p1363.
function makeAuthToken(): string {
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: TEAM_ID, iat: now, exp: now + 30 * 60 };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.sign("SHA256", Buffer.from(signingInput), {
    key: PRIVATE_KEY,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64url(signature)}`;
}

// Apple returns a short-lived access token in exchange for the auth JWT. Cache
// it so we don't re-exchange on every geocode.
let cachedAccess: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (cachedAccess && cachedAccess.exp > Date.now() + 60_000) return cachedAccess.token;
  try {
    const res = await fetch("https://maps-api.apple.com/v1/token", {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data?.accessToken) return null;
    cachedAccess = {
      token: data.accessToken,
      exp: Date.now() + Number(data.expiresInSeconds || 1800) * 1000,
    };
    return cachedAccess.token;
  } catch {
    return null;
  }
}

// Geocode an address with Apple Maps. Returns null (never throws) when Apple
// isn't configured or can't resolve it, so the caller falls back to Google.
export async function appleGeocode(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!appleMapsConfigured()) return null;
  const clean = String(address || "").trim();
  if (!clean) return null;

  try {
    const token = await getAccessToken();
    if (!token) return null;

    const url =
      `https://maps-api.apple.com/v1/geocode?q=${encodeURIComponent(clean)}` +
      `&lang=en-US&countryCode=US`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data: any = await res.json();
    const c = data?.results?.[0]?.coordinate;
    if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
      return { lat: c.latitude, lng: c.longitude };
    }
    return null;
  } catch {
    return null;
  }
}
