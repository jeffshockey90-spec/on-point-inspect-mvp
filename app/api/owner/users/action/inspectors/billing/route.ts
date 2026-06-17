import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

const OWNER_EMAILS = ["jeff@onpointhomeinspect.com", "jeffshockey90@gmail.com"];

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

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

async function requireOwner() {
  const userClient = await createUserClient();

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) return null;

  const email = String(user.email || "").toLowerCase();

  if (!OWNER_EMAILS.includes(email)) return null;

  return user;
}

export async function POST(req: Request) {
  const owner = await requireOwner();

  if (!owner) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const body = await req.json();

  const userId = String(body.userId || "").trim();

  if (!userId) {
    return NextResponse.json({ error: "Missing inspector user ID." }, { status: 400 });
  }

  const admin = createAdminClient();

  const customPrice =
    body.subscription_price_override_cents === null ||
    body.subscription_price_override_cents === undefined ||
    body.subscription_price_override_cents === ""
      ? null
      : Number(body.subscription_price_override_cents);

  if (customPrice !== null && (!Number.isFinite(customPrice) || customPrice < 0)) {
    return NextResponse.json({ error: "Invalid custom price." }, { status: 400 });
  }

  const freeLimit = Number(body.free_inspection_limit ?? 3);

  if (!Number.isFinite(freeLimit) || freeLimit < 0) {
    return NextResponse.json({ error: "Invalid free inspection limit." }, { status: 400 });
  }

  const updatePayload = {
    subscription_required: Boolean(body.subscription_required),
    subscription_exempt: Boolean(body.subscription_exempt),
    subscription_exempt_reason: body.subscription_exempt_reason || null,
    subscription_price_override_cents: customPrice,
    subscription_price_override_reason: body.subscription_price_override_reason || null,
    free_inspection_limit: Math.floor(freeLimit),
    founding_member: Boolean(body.founding_member),
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId);

  if (error) {
    console.error("Owner inspector billing update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}