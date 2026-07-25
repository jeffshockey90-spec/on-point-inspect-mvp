import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_AVAILABILITY = {
  booking_enabled: true,
  available_days: ["MO", "TU", "WE", "TH", "FR"],
  default_times: ["10:00", "14:00", "16:30"],
  blocked_dates: [] as string[],
  timezone: "America/New_York",
};

const VALID_DAYS = new Set(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);

async function createSupabaseServerClient() {
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
    },
  );
}

function isValidTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function isValidDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data } = await supabase
    .from("inspector_availability")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    availability: data || DEFAULT_AVAILABILITY,
  });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const bookingEnabled = body.booking_enabled !== false;

  const availableDays = Array.isArray(body.available_days)
    ? body.available_days.filter((day: unknown) => VALID_DAYS.has(String(day)))
    : [];

  const defaultTimes = Array.isArray(body.default_times)
    ? body.default_times.filter(isValidTime)
    : [];

  const blockedDates = Array.isArray(body.blocked_dates)
    ? body.blocked_dates.filter(isValidDate)
    : [];

  const timezone = String(body.timezone || "").trim() || DEFAULT_AVAILABILITY.timezone;

  if (bookingEnabled && availableDays.length === 0) {
    return NextResponse.json(
      { error: "Select at least one available day while public booking is enabled." },
      { status: 400 },
    );
  }

  if (bookingEnabled && defaultTimes.length === 0) {
    return NextResponse.json(
      { error: "Add at least one appointment time while public booking is enabled." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("inspector_availability").upsert(
    {
      user_id: user.id,
      booking_enabled: bookingEnabled,
      available_days: availableDays,
      default_times: defaultTimes,
      blocked_dates: blockedDates,
      timezone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
