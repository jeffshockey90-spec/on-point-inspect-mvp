import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getGoogleAuthUrl, googleOAuthState, isGoogleCalendarConfigured } from "../../../../../lib/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kicks off the Google OAuth consent flow. User navigates here; we redirect to
// Google with a CSRF state stored in an httpOnly cookie.
export async function GET() {
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "https://app.flowinspect.app"));

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.redirect(
      new URL("/settings/integrations?gcal=notconfigured", process.env.NEXT_PUBLIC_SITE_URL || "https://app.flowinspect.app"),
    );
  }

  // State is derived from the user (HMAC) — no cookie needed.
  return NextResponse.redirect(getGoogleAuthUrl(googleOAuthState(user.id)));
}
