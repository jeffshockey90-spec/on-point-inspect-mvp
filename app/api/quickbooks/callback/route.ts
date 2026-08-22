import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { exchangeCodeForTokens, intuitOAuthState } from "../../../../lib/quickbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://app.flowinspect.app";

function settingsRedirect(status: string) {
  return NextResponse.redirect(new URL(`/settings/integrations?qbo=${status}`, SITE));
}

// Intuit redirects back here with an auth code AND the realmId (company id). We
// verify the HMAC state, swap the code for tokens, and store the connection.
export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");

  if (url.searchParams.get("error")) return settingsRedirect("denied");
  if (!code || !state || state !== intuitOAuthState(user.id)) {
    return settingsRedirect("badstate");
  }
  if (!realmId) return settingsRedirect("failed");

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    return settingsRedirect("failed");
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await admin.from("quickbooks_connections").upsert(
    {
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: expiry,
      realm_id: realmId,
      enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return settingsRedirect("connected");
}
