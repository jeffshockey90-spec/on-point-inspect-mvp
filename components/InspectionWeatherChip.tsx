"use client";

import { useEffect, useState } from "react";

type Props = {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  date: string; // YYYY-MM-DD
};

const EMOJI: Record<string, string> = {
  Clear: "☀️",
  Cloudy: "☁️",
  Rain: "🌧️",
  Snow: "❄️",
  Fog: "🌫️",
  Storm: "⛈️",
};

// Compact forecast chip for an upcoming inspection. Open-Meteo's forecast only
// covers roughly the next 16 days, so this renders nothing for dates outside
// that window or when the lookup fails.
export default function InspectionWeatherChip({ lat, lng, address, date }: Props) {
  const [day, setDay] = useState<any>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!date) {
          setHidden(true);
          return;
        }
        const params = new URLSearchParams({ mode: "forecast", startDate: date, endDate: date });
        if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
          params.set("lat", String(lat));
          params.set("lng", String(lng));
        } else if (address && address.trim()) {
          params.set("address", address);
        } else {
          setHidden(true);
          return;
        }
        const res = await fetch(`/api/weather?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        const d = Array.isArray(json?.days) ? json.days[0] : null;
        if (!res.ok || !d || d.highF == null) {
          setHidden(true);
          return;
        }
        setDay(d);
      } catch {
        if (!cancelled) setHidden(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lng, address, date]);

  if (hidden || !day) return null;

  return (
    <span
      title={`${day.conditionText}${day.precipChance != null ? ` · ${day.precipChance}% precip` : ""}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-[var(--fl-info-text)]"
    >
      <span>{EMOJI[day.conditionSimple] || "🌡️"}</span>
      <span className="[font-variant-numeric:tabular-nums]">
        {day.highF}°/{day.lowF}°
      </span>
      {day.precipChance != null && day.precipChance >= 30 && (
        <span className="text-[var(--fl-info-text)]">💧{day.precipChance}%</span>
      )}
    </span>
  );
}
