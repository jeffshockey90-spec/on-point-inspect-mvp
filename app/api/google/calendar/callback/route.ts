import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { exchangeCodeForTokens, googleOAuthState } from "../../../../../lib/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.flowinspect.app";

function settingsRedirect(status: string) {
  return NextResponse.redirect(new URL(`/settings/integrations?gcal=${status}`, SITE));
}

// Google redirects back here with an auth code. We verify the CSRF state, swap
// the code for tokens, and store the connection for the logged-in inspector.
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", SITE));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (url.searchParams.get("error")) return settingsRedirect("denied");
  if (!code || !state || state !== googleOAuthState(user.id)) return settingsRedirect("badstate");

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.access_token) return settingsRedirect("failed");

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const patch: Record<string, any> = {
    user_id: user.id,
    access_token: tokens.access_token,
    expiry_date: expiry,
    connected_email: tokens.email,
    enabled: true,
    updated_at: new Date().toISOString(),
  };
  // Google only returns a refresh_token on first consent (we force prompt=consent
  // so it should be present); never overwrite a stored one with null.
  if (tokens.refresh_token) patch.refresh_token = tokens.refresh_token;

  await admin.from("google_calendar_connections").upsert(patch, { onConflict: "user_id" });

  return settingsRedirect("connected");
}
