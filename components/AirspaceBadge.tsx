"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AirspaceResult, AirspaceStatus } from "../lib/airspace";

// Shows the drone / Part-107 airspace situation for a property (from the FAA UAS
// Facility Map, via /api/airspace). Used on the New Inspection form and in the
// report builder so an inspector knows — before booking or flying — whether a
// drone roof inspection here is clear, needs LAANC, or needs manual FAA
// authorization. It's a planning aid, not an authorization (see the disclaimer).
//
// Pass either coordinates, or address parts (it composes them and geocodes
// server-side). It only fires once the address is complete enough to resolve.

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
  { border: string; bg: string; text: string; dot: string; label: string }
> = {
  prohibited: {
    border: "border-red-500/50",
    bg: "bg-red-500/15",
    text: "text-[var(--fl-crit-text)]",
    dot: "bg-red-500",
    label: "No-fly zone",
  },
  clear: {
    border: "border-green-500/40",
    bg: "bg-green-500/10",
    text: "text-[var(--fl-good-text)]",
    dot: "bg-green-500",
    label: "Clear to fly",
  },
  laanc: {
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/10",
    text: "text-[var(--fl-warn-text)]",
    dot: "bg-yellow-500",
    label: "LAANC required",
  },
  authorization: {
    border: "border-red-500/40",
    bg: "bg-red-500/10",
    text: "text-[var(--fl-crit-text)]",
    dot: "bg-red-500",
    label: "FAA authorization required",
  },
  unknown: {
    border: "border-[var(--fl-line)]",
    bg: "bg-[var(--fl-surface-2)]",
    text: "text-[var(--fl-muted)]",
    dot: "bg-[var(--fl-faint)]",
    label: "Airspace unknown",
  },
};

function buildQuery(props: Props): string | null {
  if (Number.isFinite(props.lat as number) && Number.isFinite(props.lng as number)) {
    return `lat=${props.lat}&lng=${props.lng}`;
  }
  const parts = [props.address, props.city, props.state, props.zip]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  const full = parts.join(", ");
  // Need a street plus at least a state or zip to resolve reliably — this also
  // stops us geocoding half-typed addresses on every keystroke.
  const hasStreet = String(props.address || "").trim().length >= 5;
  const hasRegion = Boolean(String(props.state || "").trim() || String(props.zip || "").trim());
  if (!hasStreet || !hasRegion) return null;
  return `address=${encodeURIComponent(full)}`;
}

export default function AirspaceBadge(props: Props) {
  const { className = "" } = props;
  const [result, setResult] = useState<AirspaceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lastQueryRef = useRef<string | null>(null);
  // Tracks the query we've already auto-retried once, so a transient "unknown"
  // (FAA blip / cold start) self-heals without the inspector having to notice
  // the grey box and tap Re-check — but we never loop.
  const autoRetriedRef = useRef<string | null>(null);

  const query = buildQuery(props);

  const runCheck = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    try {
      // Cache-buster: some in-app WebViews (iOS/Capacitor) have cached a prior
      // /api/airspace response for the identical URL and keep serving it even
      // with cache:"no-store" — which once stranded a stale "clear to fly" on a
      // property that is actually controlled. A unique URL per call guarantees a
      // fresh answer every time.
      const res = await fetch(`/api/airspace?${q}&_ts=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Airspace check failed.");
      }
      const airspace = data.airspace as AirspaceResult;
      setResult(airspace);
      // One silent retry if the FAA data couldn't be reached this time.
      if (airspace?.status === "unknown" && autoRetriedRef.current !== q) {
        autoRetriedRef.current = q;
        setTimeout(() => void runCheck(q), 2500);
      }
    } catch (err: any) {
      setError(err?.message || "Airspace check failed.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced auto-check whenever the resolvable address changes.
  useEffect(() => {
    if (!query) return;
    if (query === lastQueryRef.current) return;
    const handle = setTimeout(() => {
      lastQueryRef.current = query;
      void runCheck(query);
    }, 700);
    return () => clearTimeout(handle);
  }, [query, runCheck]);

  const style = STYLES[result?.status || "unknown"];

  return (
    <div
      className={`rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base" aria-hidden>
            🚁
          </span>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
            Drone Airspace · Part 107
          </p>
        </div>
        {query && !loading && (
          <button
            type="button"
            onClick={() => {
              lastQueryRef.current = query;
              void runCheck(query);
            }}
            className="shrink-0 rounded-lg border border-[var(--fl-line)] px-3 py-1 text-xs font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)]"
          >
            Re-check
          </button>
        )}
      </div>

      {!query && (
        <p className="mt-3 text-sm text-[var(--fl-muted)]">
          Enter the property address to check whether a drone roof inspection here is clear to fly,
          needs LAANC, or needs FAA authorization.
        </p>
      )}

      {query && loading && (
        <p className="mt-3 flex items-center gap-2 text-sm text-[var(--fl-muted)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Checking FAA airspace…
        </p>
      )}

      {query && !loading && error && (
        <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-[var(--fl-crit-text)]">
          {error}
        </p>
      )}

      {query && !loading && !error && result && (
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

            {(result.status === "laanc" || result.status === "authorization") && (
              <a
                href={
                  result.status === "authorization"
                    ? "https://faadronezone-access.faa.gov/"
                    : "https://www.faa.gov/uas/getting_started/laanc"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-teal-500/50 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/20"
              >
                {result.status === "authorization"
                  ? "File FAA authorization (DroneZone) →"
                  : "File LAANC authorization →"}
              </a>
            )}
          </div>

          <p className="mt-2 text-[11px] leading-5 text-[var(--fl-faint)]">
            Planning aid only — not an FAA authorization. The remote pilot in command is responsible
            for filing any required authorization and confirming active TFRs on the day of the
            flight. Source: FAA UAS Facility Map.
          </p>
        </div>
      )}
    </div>
  );
}
