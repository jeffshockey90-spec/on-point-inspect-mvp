import crypto from "crypto";

// Google Calendar OAuth + event sync. FLOW had no OAuth infrastructure before
// this; keep it self-contained. Secrets live in server env only.
//
// Env: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET. Redirect URI is
// derived from the site URL and must match the one registered in Google Cloud.

// CSRF state bound to the user via HMAC (no cookie needed — cookies don't
// reliably survive the OAuth redirect through Google in app webviews). The
// callback recomputes this for the logged-in user and compares; an attacker
// can't forge a valid state for someone else's user id.
export function googleOAuthState(userId: string) {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "flow-state";
  return crypto.createHmac("sha256", secret).update(String(userId)).digest("hex");
}

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
];

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.flowinspect.app"
  ).replace(/\/$/, "");
}

export function googleRedirectUri() {
  return `${siteUrl()}/api/google/calendar/callback`;
}

export function isGoogleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function getGoogleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      ...body,
    }),
  });
  return res.json();
}

// Decode the email from a Google id_token (JWT) without verifying — it came
// straight from Google's token endpoint over TLS.
function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf8"));
    return payload?.email || null;
  } catch {
    return null;
  }
}

export async function exchangeCodeForTokens(code: string) {
  const data = await tokenRequest({
    code,
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
  return {
    access_token: data.access_token as string | undefined,
    refresh_token: data.refresh_token as string | undefined,
    expires_in: Number(data.expires_in) || 3600,
    email: emailFromIdToken(data.id_token),
    error: data.error_description || data.error || null,
  };
}

// Return a valid access token for the user, refreshing if it's expired.
export async function getValidAccessToken(admin: any, userId: string): Promise<string | null> {
  const { data: conn } = await admin
    .from("google_calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn?.refresh_token) return null;

  const expiry = conn.expiry_date ? new Date(conn.expiry_date).getTime() : 0;
  if (conn.access_token && expiry > Date.now() + 60_000) {
    return conn.access_token;
  }

  const data = await tokenRequest({
    refresh_token: conn.refresh_token,
    grant_type: "refresh_token",
  });
  if (!data.access_token) return null;

  const newExpiry = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000).toISOString();
  await admin
    .from("google_calendar_connections")
    .update({ access_token: data.access_token, expiry_date: newExpiry, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return data.access_token;
}

type CalendarEvent = {
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
};

// Create or update an event; returns the event id (or null on failure).
export async function upsertCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string | null,
  event: CalendarEvent,
): Promise<string | null> {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const url = eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
  const res = await fetch(url, {
    method: eventId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.id || null;
}

export async function deleteCalendarEvent(accessToken: string, calendarId: string, eventId: string) {
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  ).catch(() => undefined);
}
