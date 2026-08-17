import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { applyAppleEntitlement, fetchAppleEntitlement } from "../../../../lib/revenuecatServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Post-purchase entitlement sync for Apple In-App Purchase.
 *
 * The iOS app calls this the moment a StoreKit purchase or restore completes.
 * The webhook would get there eventually, but "eventually" is a bad experience
 * for an inspector who just paid and wants to start the next inspection, so we
 * resolve entitlement synchronously here.
 *
 * The client tells us *that* something happened; it never tells us *what* it
 * bought. We ask RevenueCat directly and write whatever it reports.
 */

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

export async function POST() {
  const supabase = await createUserClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  let entitlement;
  try {
    // The RevenueCat app user id is the Supabase user id (set at configure time).
    entitlement = await fetchAppleEntitlement(user.id);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not reach RevenueCat." },
      { status: 502 }
    );
  }

  if (!entitlement) {
    return NextResponse.json({ active: false });
  }

  const result = await applyAppleEntitlement(user.id, entitlement);

  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Update failed." }, { status: 500 });
  }

  return NextResponse.json({
    active: new Date(entitlement.expiresAt || 0).getTime() > Date.now(),
    expiresAt: entitlement.expiresAt,
  });
}
