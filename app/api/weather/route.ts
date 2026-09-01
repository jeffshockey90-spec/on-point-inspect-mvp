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

// GET /api/weather
//   ?mode=current|date|forecast   (default: current)
//   &address=<street address>     OR  &lat=..&lng=..
//   &date=YYYY-MM-DD              (mode=date)
//   &hour=0-23                    (mode=date, optional)
//   &startDate=..&endDate=..      (mode=forecast)
//
// Requires a logged-in user so this isn't an open weather proxy. Uses the
// existing Google geocoder for the address -> lat/long, then Open-Meteo (free,
// no key) for the actual weather.
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get("mode") || "current").toLowerCase();

    let lat = Number(searchParams.get("lat"));
    let lng = Number(searchParams.get("lng"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const address = searchParams.get("address") || "";
      if (!address.trim()) {
        return NextResponse.json(
          { error: "Provide either lat/lng or an address." },
          { status: 400 },
        );
      }

      const coords = await geocodeAddress(address);
      if (!coords) {
        return NextResponse.json(
          { error: "Could not locate that address for weather." },
          { status: 422 },
        );
      }
      lat = coords.lat;
      lng = coords.lng;
    }

    if (mode === "forecast") {
      const startDate = searchParams.get("startDate") || "";
      const endDate = searchParams.get("endDate") || startDate;
      if (!startDate) {
        return NextResponse.json(
          { error: "forecast mode needs startDate." },
          { status: 400 },
        );
      }
      const days = await getDailyForecast(lat, lng, startDate, endDate);
      return NextResponse.json({ lat, lng, days });
    }

    if (mode === "date") {
      const date = searchParams.get("date") || "";
      if (!date) {
        return NextResponse.json(
          { error: "date mode needs a date (YYYY-MM-DD)." },
          { status: 400 },
        );
      }
      const hourParam = searchParams.get("hour");
      const hour = hourParam == null ? null : Number(hourParam);
      const weather = await getWeatherForDate(lat, lng, date, hour);
      if (!weather) {
        return NextResponse.json(
          { error: "No weather data available for that date/location." },
          { status: 404 },
        );
      }
      // A date still in the future is a forecast (a prediction that changes as
      // the day nears), not observed conditions. Flag it so the report doesn't
      // silently capture a stale forecast — the inspector should re-run on the
      // inspection day for what actually happened.
      const today = new Date().toISOString().slice(0, 10);
      const isForecast = date > today;
      return NextResponse.json({ lat, lng, weather, isForecast });
    }

    // default: current
    const weather = await getCurrentWeather(lat, lng);
    if (!weather) {
      return NextResponse.json(
        { error: "No current weather available for that location." },
        { status: 404 },
      );
    }
    return NextResponse.json({ lat, lng, weather });
  } catch (error: any) {
    console.error("Weather route error:", error);
    return NextResponse.json(
      { error: error?.message || "Weather lookup failed." },
      { status: 500 },
    );
  }
}
