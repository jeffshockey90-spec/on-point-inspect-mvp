"use client";

import { useEffect, useState } from "react";

type Props = {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string;
};

const EMOJI: Record<string, string> = {
  Clear: "☀️",
  Cloudy: "☁️",
  Rain: "🌧️",
  Snow: "❄️",
  Fog: "🌫️",
  Storm: "⛈️",
};

// Current-conditions card for the owner's area. Renders nothing if there's no
// usable location or the lookup fails, so it never shows a broken state.
export default function WeatherWidget({ lat, lng, address, label = "Local Weather" }: Props) {
  const [weather, setWeather] = useState<any>(null);
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
        const res = await fetch(`/api/weather?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json?.weather) {
          setState("hidden");
          return;
        }
        setWeather(json.weather);
        setState("ok");
      } catch {
        if (!cancelled) setState("hidden");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lng, address]);

  if (state === "hidden") return null;

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-5">
      <p className="text-xs font-black uppercase tracking-wider text-sky-300">{label}</p>
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
