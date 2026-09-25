import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { geocodeAddress } from "../../../lib/geocode";
import {
  getCurrentWeather,
  getWeatherForDate,
  getDailyForecast,
} from "../../../lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Never let a CDN or in-app WebView pin a weather response — a stale reading made
// the report auto-fill show the SAME temp/conditions on every property.
const NO_STORE: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

type WeatherInput = {
  mode: string;
  lat?: string | null;
  lng?: string | null;
  address?: string | null;
  date?: string | null;
  hour?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

// Shared core for both GET and POST. POST is what the report auto-fill uses,
// because some in-app WebViews (iOS/Capacitor) serve a cached GET even with
// cache:"no-store" — which was the "same weather every time" bug. A POST body
// is never cached, so the reading is always fresh + property-specific.
async function resolveWeather(input: WeatherInput): Promise<NextResponse> {
  const mode = (input.mode || "current").toLowerCase();

  let lat = Number(input.lat);
  let lng = Number(input.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const address = String(input.address || "").trim();
    if (!address) {
      return NextResponse.json(
        { error: "Provide either lat/lng or an address." },
        { status: 400, headers: NO_STORE },
      );
    }
    const coords = await geocodeAddress(address);
    if (!coords) {
      return NextResponse.json(
        { error: "Could not locate that address for weather." },
        { status: 422, headers: NO_STORE },
      );
    }
    lat = coords.lat;
    lng = coords.lng;
  }

  if (mode === "forecast") {
    const startDate = String(input.startDate || "").slice(0, 10);
    const endDate = String(input.endDate || startDate).slice(0, 10);
    if (!startDate) {
      return NextResponse.json({ error: "forecast mode needs startDate." }, { status: 400, headers: NO_STORE });
    }
    const days = await getDailyForecast(lat, lng, startDate, endDate);
    return NextResponse.json({ lat, lng, days }, { headers: NO_STORE });
  }

  if (mode === "date") {
    const date = String(input.date || "").slice(0, 10);
    if (!date) {
      return NextResponse.json({ error: "date mode needs a date (YYYY-MM-DD)." }, { status: 400, headers: NO_STORE });
    }
    const hourParam = input.hour;
    const hour = hourParam == null || hourParam === "" ? null : Number(hourParam);
    const today = new Date().toISOString().slice(0, 10);

    let weather = null;
    let isForecast = false;

    if (date === today) {
      // Inspection is TODAY → real-time current conditions. Avoids the coarse
      // archive model that can falsely report drizzle when it's clear.
      weather = await getCurrentWeather(lat, lng);
      if (!weather) weather = await getWeatherForDate(lat, lng, date, hour, { allowArchive: false });
    } else if (date > today) {
      isForecast = true;
      weather = await getWeatherForDate(lat, lng, date, hour);
    } else {
      weather = await getWeatherForDate(lat, lng, date, hour);
    }

    if (!weather) {
      return NextResponse.json(
        { error: "No weather data available for that date/location." },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json({ lat, lng, weather, isForecast, resolved: { lat, lng, date } }, { headers: NO_STORE });
  }

  // default: current
  const weather = await getCurrentWeather(lat, lng);
  if (!weather) {
    return NextResponse.json(
      { error: "No current weather available for that location." },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json({ lat, lng, weather, resolved: { lat, lng } }, { headers: NO_STORE });
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: Request) {
  try {
    if (!(await requireUser())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE });
    }
    const body = await req.json().catch(() => ({}));
    return await resolveWeather({
      mode: body?.mode || "current",
      lat: body?.lat,
      lng: body?.lng,
      address: body?.address,
      date: body?.date,
      hour: body?.hour,
      startDate: body?.startDate,
      endDate: body?.endDate,
    });
  } catch (error: any) {
    console.error("Weather route error:", error);
    return NextResponse.json({ error: error?.message || "Weather lookup failed." }, { status: 500, headers: NO_STORE });
  }
}

// Kept for any existing callers; the report auto-fill uses POST.
export async function GET(req: Request) {
  try {
    if (!(await requireUser())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE });
    }
    const { searchParams } = new URL(req.url);
    return await resolveWeather({
      mode: searchParams.get("mode") || "current",
      lat: searchParams.get("lat"),
      lng: searchParams.get("lng"),
      address: searchParams.get("address"),
      date: searchParams.get("date"),
      hour: searchParams.get("hour"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });
  } catch (error: any) {
    console.error("Weather route error:", error);
    return NextResponse.json({ error: error?.message || "Weather lookup failed." }, { status: 500, headers: NO_STORE });
  }
}
