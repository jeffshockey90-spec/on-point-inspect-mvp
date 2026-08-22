import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  getQuickBooksAuthUrl,
  intuitOAuthState,
  isQuickBooksConfigured,
} from "../../../../lib/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://app.flowinspect.app";

// Kicks off the Intuit OAuth consent flow. State is derived from the user via
// HMAC (no cookie — cookies don't survive the redirect reliably in webviews).
export async function GET() {
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", SITE));

  if (!isQuickBooksConfigured()) {
    return NextResponse.redirect(
      new URL("/settings/integrations?qbo=notconfigured", SITE),
    );
  }

  return NextResponse.redirect(getQuickBooksAuthUrl(intuitOAuthState(user.id)));
}
