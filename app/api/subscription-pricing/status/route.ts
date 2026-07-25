import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSubscriptionPricing } from "../../../../lib/subscriptionPricing";
import { OWNER_EMAILS } from "../../../../lib/ownerEmails";

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
  try {
    const userClient = await createUserClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const userEmail = String(user.email || "").toLowerCase();
    if (!OWNER_EMAILS.includes(userEmail)) {
      return NextResponse.json({ error: "Owner only." }, { status: 403 });
    }

    const pricing = await getSubscriptionPricing();
    return NextResponse.json({ ok: true, pricing });
  } catch (error: any) {
    console.error("Subscription pricing status error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load subscription pricing." },
      { status: 500 }
    );
  }
}
