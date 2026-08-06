"use client";

import { useEffect, useState } from "react";

type Props = {
  // Fallback location used only if device geolocation is unavailable/denied.
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  fallbackLabel?: string;
};

const EMOJI: Record<string, string> = {
  Clear: "☀️",
  Cloudy: "☁️",
  Rain: "🌧️",
  Snow: "❄️",
  Fog: "🌫️",
  Storm: "⛈️",
};

// Current-conditions card. Prefers the DEVICE's geolocation (where the inspector
// actually is), falling back to the passed location (next job) only if geo is
// unavailable or denied. Renders nothing if neither yields weather.
export default function WeatherWidget({
  lat,
  lng,
  address,
  fallbackLabel = "Weather · Next Job",
}: Props) {
  const [weather, setWeather] = useState<any>(null);
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");
  const [locLabel, setLocLabel] = useState("Weather");

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather(params: URLSearchParams) {
      try {
        const res = await fetch(`/api/weather?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return false;
        if (!res.ok || !json?.weather) return false;
        setWeather(json.weather);
        setState("ok");
        return true;
      } catch {
        return false;
      }
    }

    async function run() {
      // 1) Device geolocation (what the user asked for).
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        const coords = await new Promise<{ latitude: number; longitude: number } | null>(
          (resolve) => {
            navigator.geolocation.getCurrentPosition(
              (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
              () => resolve(null),
              { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
            );
          }
        );
        if (cancelled) return;
        if (coords) {
          setLocLabel("Weather · Current Location");
          const params = new URLSearchParams({
            mode: "current",
            lat: String(coords.latitude),
            lng: String(coords.longitude),
          });
          if (await fetchWeather(params)) return;
        }
      }

      // 2) Fallback to the provided location (next inspection).
      const params = new URLSearchParams({ mode: "current" });
      if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
      } else if (address && address.trim()) {
        params.set("address", address);
      } else {
        setState("hidden");
        return;
      }
      setLocLabel(fallbackLabel);
      if (!(await fetchWeather(params))) setState("hidden");
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [lat, lng, address, fallbackLabel]);

  if (state === "hidden") return null;

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-5">
      <p className="text-xs font-black uppercase tracking-wider text-sky-300">{locLabel}</p>
      {state === "loading" ? (
        <p className="mt-3 text-sm text-slate-400">Loading conditions…</p>
      ) : (
        <div className="mt-2 flex items-center gap-4">
          <span className="text-5xl leading-none">{EMOJI[weather.conditionSimple] || "🌡️"}</span>
          <div>
            <p className="text-3xl font-black text-white">
              {weather.temperatureF != null ? `${weather.temperatureF}°F` : "—"}
            </p>
            <p className="text-sm text-slate-300">{weather.conditionText}</p>
            {(weather.highF != null || weather.lowF != null) && (
              <p className="mt-1 text-xs text-slate-400">
                {weather.highF != null ? `H ${weather.highF}°` : ""}
                {weather.highF != null && weather.lowF != null ? " · " : ""}
                {weather.lowF != null ? `L ${weather.lowF}°` : ""}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
