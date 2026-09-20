"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AirspaceResult, AirspaceStatus } from "../lib/airspace";

// Drone / Part-107 airspace card. Rewritten to POST to /api/drone-airspace so
// the answer can never be served from a stale cache (the old GET badge got
// pinned to a "clear to fly" on controlled airspace by an in-app WebView cache).
// It also SHOWS what it resolved — coordinates, airport, and the check time — so
// a stale or wrong reading is obvious at a glance.

type Props = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
  className?: string;
};

const STYLES: Record<
  AirspaceStatus,
  { border: string; bg: string; text: string; dot: string }
> = {
  prohibited: {
    border: "border-red-500/50",
    bg: "bg-red-500/15",
    text: "text-[var(--fl-crit-text)]",
    dot: "bg-red-500",
  },
  clear: {
    border: "border-green-500/40",
    bg: "bg-green-500/10",
    text: "text-[var(--fl-good-text)]",
    dot: "bg-green-500",
  },
  laanc: {
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/10",
    text: "text-[var(--fl-warn-text)]",
    dot: "bg-yellow-500",
  },
  authorization: {
    border: "border-red-500/40",
    bg: "bg-red-500/10",
    text: "text-[var(--fl-crit-text)]",
    dot: "bg-red-500",
  },
  unknown: {
    border: "border-[var(--fl-line)]",
    bg: "bg-[var(--fl-surface-2)]",
    text: "text-[var(--fl-muted)]",
    dot: "bg-[var(--fl-faint)]",
  },
};

type Payload = { lat: number; lng: number } | { address: string };

function buildPayload(props: Props): Payload | null {
  if (Number.isFinite(props.lat as number) && Number.isFinite(props.lng as number)) {
    return { lat: props.lat as number, lng: props.lng as number };
  }
  const parts = [props.address, props.city, props.state, props.zip]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  const hasStreet = String(props.address || "").trim().length >= 5;
  const hasRegion = Boolean(String(props.state || "").trim() || String(props.zip || "").trim());
  if (!hasStreet || !hasRegion) return null;
  return { address: parts.join(", ") };
}

export default function DroneAirspaceCard(props: Props) {
  const { className = "" } = props;
  const [result, setResult] = useState<AirspaceResult | null>(null);
  const [resolved, setResolved] = useState<{ lat: number; lng: number } | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lastKeyRef = useRef<string | null>(null);
  const autoRetriedRef = useRef<string | null>(null);

  const payload = buildPayload(props);
  const key = payload ? JSON.stringify(payload) : null;

  const runCheck = useCallback(async (body: Payload) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/drone-airspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Airspace check failed.");

      const airspace = data.airspace as AirspaceResult;
      setResult(airspace);
      setResolved(data?.resolved && Number.isFinite(data.resolved.lat) ? data.resolved : null);
      setCheckedAt(new Date());

      const k = JSON.stringify(body);
      if (airspace?.status === "unknown" && autoRetriedRef.current !== k) {
        autoRetriedRef.current = k;
        setTimeout(() => void runCheck(body), 2500);
      }
    } catch (err: any) {
      setError(err?.message || "Airspace check failed.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!payload || !key) return;
    if (key === lastKeyRef.current) return;
    const handle = setTimeout(() => {
      lastKeyRef.current = key;
      void runCheck(payload);
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, runCheck]);

  const style = STYLES[result?.status || "unknown"];

  return (
    <div className={`rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base" aria-hidden>
            🚁
          </span>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
            Drone Airspace · Part 107
          </p>
        </div>
        {payload && !loading && (
          <button
            type="button"
            onClick={() => {
              autoRetriedRef.current = null;
              void runCheck(payload);
            }}
            className="shrink-0 rounded-lg border border-[var(--fl-line)] px-3 py-1 text-xs font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)] [touch-action:manipulation]"
          >
            Re-check
          </button>
        )}
      </div>

      {!payload && (
        <p className="mt-3 text-sm text-[var(--fl-muted)]">
          Enter the property address to check whether a drone roof inspection here is clear to fly,
          needs LAANC, or needs FAA authorization.
        </p>
      )}

      {payload && loading && (
        <p className="mt-3 flex items-center gap-2 text-sm text-[var(--fl-muted)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Checking FAA airspace…
        </p>
      )}

      {payload && !loading && error && (
        <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-[var(--fl-crit-text)]">
          {error}
        </p>
      )}

      {payload && !loading && !error && result && (
        <div className="mt-3">
          <div className={`rounded-xl border ${style.border} ${style.bg} p-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden />
              <span className={`text-sm font-bold ${style.text}`}>{result.headline}</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {result.status === "prohibited" && result.restrictedAreaName && (
                <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--fl-crit-text)]">
                  ⛔ {result.restrictedAreaName}
                </span>
              )}
              {result.airspaceClass && result.status !== "prohibited" && (
                <span className="inline-flex items-center rounded-full border border-[var(--fl-line)] bg-[var(--fl-ground)] px-2.5 py-1 text-[11px] font-semibold text-[var(--fl-text)]">
                  Class {result.airspaceClass}
                </span>
              )}
              {result.ceilingFt != null && result.ceilingFt > 0 && (
                <span className="inline-flex items-center rounded-full border border-[var(--fl-line)] bg-[var(--fl-ground)] px-2.5 py-1 text-[11px] font-semibold text-[var(--fl-text)]">
                  LAANC ceiling {result.ceilingFt} ft AGL
                </span>
              )}
              {result.status === "clear" && (
                <span className="inline-flex items-center rounded-full border border-[var(--fl-line)] bg-[var(--fl-ground)] px-2.5 py-1 text-[11px] font-semibold text-[var(--fl-text)]">
                  Up to 400 ft AGL
                </span>
              )}
              {result.airport?.name && (
                <span className="inline-flex items-center rounded-full border border-[var(--fl-line)] bg-[var(--fl-ground)] px-2.5 py-1 text-[11px] font-semibold text-[var(--fl-text)]">
                  ✈ {result.airport.name}
                </span>
              )}
            </div>

            <p className={`mt-2 text-sm leading-6 ${style.text}`}>{result.detail}</p>

            {Array.isArray(result.advisories) && result.advisories.length > 0 && (
              <div className="mt-3 space-y-2">
                {result.advisories.map((a, i) => (
                  <p
                    key={i}
                    className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-[12px] leading-5 font-medium text-[var(--fl-warn-text)]"
                  >
                    ⚠ {a}
                  </p>
                ))}
              </div>
            )}

            {(result.status === "laanc" || result.status === "authorization") && (
              <a
                href={
                  result.status === "authorization"
                    ? "https://faadronezone-access.faa.gov/"
                    : "https://www.faa.gov/uas/getting_started/laanc"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-teal-500/50 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/20 [touch-action:manipulation]"
              >
                {result.status === "authorization"
                  ? "File FAA authorization (DroneZone) →"
                  : "File LAANC authorization →"}
              </a>
            )}
          </div>

          {/* Transparency line: exactly what was checked, and when. Makes a
              stale/wrong reading obvious instead of silently trusted. */}
          <p className="mt-2 text-[11px] leading-5 text-[var(--fl-faint)]">
            {checkedAt && <>Checked {checkedAt.toLocaleTimeString()} · </>}
            {resolved && (
              <>
                {resolved.lat.toFixed(4)}, {resolved.lng.toFixed(4)} ·{" "}
              </>
            )}
            Planning aid only — not an FAA authorization. The remote pilot in command files any
            required authorization and confirms active TFRs on the day of the flight. Source: FAA
            UAS Facility Map.
          </p>
        </div>
      )}
    </div>
  );
}
