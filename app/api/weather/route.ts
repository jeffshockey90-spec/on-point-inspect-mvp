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
      const today = new Date().toISOString().slice(0, 10);

      let weather = null;
      let isForecast = false;

      if (date === today) {
        // Inspection is TODAY → pull real-time CURRENT conditions, i.e. what's
        // actually happening during the inspection. This intentionally avoids
        // getWeatherForDate's archive fallback: the historical/reanalysis API
        // is a coarse (~9km) model that can falsely report light drizzle when
        // it's clear on the ground, which is what was corrupting same-day
        // auto-fills. Fall back to the date lookup only if "current" is down.
        weather = await getCurrentWeather(lat, lng);
        if (!weather) weather = await getWeatherForDate(lat, lng, date, hour, { allowArchive: false });
      } else if (date > today) {
        // A future date is a forecast (a prediction that changes as the day
        // nears). Flag it so the report doesn't silently keep a stale forecast.
        isForecast = true;
        weather = await getWeatherForDate(lat, lng, date, hour);
      } else {
        // Past inspection → look up conditions for that date/hour.
        weather = await getWeatherForDate(lat, lng, date, hour);
      }

      if (!weather) {
        return NextResponse.json(
          { error: "No weather data available for that date/location." },
          { status: 404 },
        );
      }
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
