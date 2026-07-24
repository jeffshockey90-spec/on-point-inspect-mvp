import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { setSubscriptionPricing } from "../../../../lib/subscriptionPricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_EMAILS = [
  "jeffshockey90@gmail.com",
  "jeff@onpointhomeinspect.com",
];

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

export async function POST(req: Request) {
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

    const body = await req.json().catch(() => ({}));
    const standardPriceCents = Math.round(Number(body.standardPriceCents));
    const foundingMemberPriceCents = Math.round(Number(body.foundingMemberPriceCents));

    if (!Number.isFinite(standardPriceCents) || standardPriceCents < 50) {
      return NextResponse.json({ error: "Standard price must be at least $0.50." }, { status: 400 });
    }
    if (!Number.isFinite(foundingMemberPriceCents) || foundingMemberPriceCents < 50) {
      return NextResponse.json({ error: "Founding-member price must be at least $0.50." }, { status: 400 });
    }

    const pricing = await setSubscriptionPricing({ standardPriceCents, foundingMemberPriceCents });
    return NextResponse.json({ ok: true, pricing });
  } catch (error: any) {
    console.error("Subscription pricing set error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update subscription pricing." },
      { status: 500 }
    );
  }
}
