"use client";
import { useEffect, useState } from "react";

function formatTripDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

function isNative() {
  return typeof window !== "undefined" && Boolean((window as any).Capacitor?.isNativePlatform?.());
}

export default function MileageControls({ inspectionId, purpose = "Inspection travel" }: { inspectionId?: string; purpose?: string }) {
  const [active, setActive] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [yearMiles, setYearMiles] = useState(0);
  const [busy, setBusy] = useState(false);
  // "granted" | "denied" | "prompt" | "unknown". Note: the Geolocation plugin
  // can't distinguish iOS "Always" from "While Using" - both report granted -
  // so we also detect a stalled trip below.
  const [locationPermission, setLocationPermission] = useState<string>("granted");

  async function checkLocationPermission() {
    if (!isNative()) { setLocationPermission("granted"); return; }
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const p = await Geolocation.checkPermissions();
      const granted = p.location === "granted" || p.coarseLocation === "granted";
      setLocationPermission(granted ? "granted" : String(p.location || "prompt"));
    } catch {
      setLocationPermission("unknown");
    }
  }

  async function refresh() {
    const data = await fetch("/api/mileage", { cache: "no-store" }).then((r) => r.ok ? r.json() : null);
    setActive(data?.active || null);
    setRecent(Array.isArray(data?.recent) ? data.recent : []);
    setYearMiles(Number(data?.yearMiles || 0));
  }

  useEffect(() => { refresh(); checkLocationPermission(); const timer = setInterval(refresh, 15000); return () => clearInterval(timer); }, []);
  function start() { setBusy(true); checkLocationPermission(); window.dispatchEvent(new CustomEvent("onpoint:mileage-start", { detail: { inspectionId, purpose } })); setTimeout(async () => { await refresh(); setBusy(false); }, 1200); }
  function stop() { setBusy(true); window.dispatchEvent(new CustomEvent("onpoint:mileage-stop")); setTimeout(async () => { await refresh(); setBusy(false); }, 1200); }

  const permissionMissing =
    locationPermission === "denied" || locationPermission === "prompt";
  // A trip running for a while with no distance recorded almost always means
  // location updates aren't coming through (usually "While Using" instead of
  // "Always", so it pauses once the screen locks).
  const startedMsAgo = active?.started_at
    ? Date.now() - new Date(active.started_at).getTime()
    : 0;
  const stalled =
    Boolean(active) &&
    startedMsAgo > 90000 &&
    Number(active?.total_miles || 0) === 0;

  return (
    <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--fl-accent-text)]">Mileage Tracker</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--fl-text)]">{Number(active?.total_miles || 0).toFixed(1)} mi</p>
      <p className="mt-1 text-sm text-[var(--fl-muted)]">{active ? "GPS tracking is active" : "Ready to record business mileage"}</p>
      <button disabled={busy} onClick={active ? stop : start} className={`mt-4 w-full rounded-xl px-4 py-3 font-semibold ${active ? "bg-rose-500 text-white" : "bg-teal-400 text-slate-950"}`}>{busy ? "Working…" : active ? "End Mileage Trip" : "Start Mileage Trip"}</button>

      {permissionMissing && (
        <div className="mt-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p className="font-semibold">FLOW doesn&apos;t have location access</p>
          <p className="mt-1 text-amber-200/90">
            Mileage can&apos;t record without it. Open{" "}
            <span className="font-bold">Settings → FLOW → Location</span> and choose{" "}
            <span className="font-bold">Always</span> so tracking continues while you drive.
          </p>
        </div>
      )}

      {!permissionMissing && stalled && (
        <div className="mt-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p className="font-semibold">Not recording distance yet</p>
          <p className="mt-1 text-amber-200/90">
            This trip is still at 0.0 mi. If it stays there while you drive, set location to{" "}
            <span className="font-bold">Always</span> in{" "}
            <span className="font-bold">Settings → FLOW → Location</span> — with
            &ldquo;While Using&rdquo; it stops tracking once your screen locks.
          </p>
        </div>
      )}

      {active && !permissionMissing && !stalled && isNative() && (
        <p className="mt-2 text-xs text-[var(--fl-muted)]">
          Keep tracking accurate with the screen off by allowing{" "}
          <span className="font-bold text-[var(--fl-muted)]">Always</span> location access.
        </p>
      )}

      <div className="mt-5 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Total This Year</p>
        <p className="mt-1 text-2xl font-semibold text-[var(--fl-accent-text)]">{yearMiles.toFixed(1)} mi</p>
      </div>

      {recent.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Recent Trips</p>
          <div className="space-y-2">
            {recent.slice(0, 10).map((trip: any) => (
              <div
                key={trip.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--fl-text)]">
                    {trip.inspections?.property_address || trip.purpose || "Trip"}
                  </p>
                  <p className="text-xs text-[var(--fl-faint)]">{formatTripDate(trip.started_at)}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-[var(--fl-accent-text)]">
                  {Number(trip.total_miles || 0).toFixed(1)} mi
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
