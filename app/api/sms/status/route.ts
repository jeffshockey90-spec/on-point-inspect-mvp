import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";
import {
  isSmsConfigured,
  getSmsFromLabel,
  getTwilioBalance,
} from "../../../../lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

export async function GET() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Balance/credentials are owner-only info.
  if (!OWNER_EMAILS.includes(String(user.email || "").toLowerCase())) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const configured = isSmsConfigured();
  const balance = await getTwilioBalance();

  return NextResponse.json({
    configured,
    from: getSmsFromLabel(),
    balance: balance.balance ?? null,
    currency: balance.currency ?? "USD",
    threshold: balance.threshold ?? null,
    lowBalance: balance.lowBalance ?? false,
    balanceError: balance.error ?? null,
  });
}
