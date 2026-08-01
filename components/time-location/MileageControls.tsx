"use client";
import { useEffect, useState } from "react";

function formatTripDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

export default function MileageControls({ inspectionId, purpose = "Inspection travel" }: { inspectionId?: string; purpose?: string }) {
  const [active, setActive] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [yearMiles, setYearMiles] = useState(0);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const data = await fetch("/api/mileage", { cache: "no-store" }).then((r) => r.ok ? r.json() : null);
    setActive(data?.active || null);
    setRecent(Array.isArray(data?.recent) ? data.recent : []);
    setYearMiles(Number(data?.yearMiles || 0));
  }

  useEffect(() => { refresh(); const timer = setInterval(refresh, 15000); return () => clearInterval(timer); }, []);
  function start() { setBusy(true); window.dispatchEvent(new CustomEvent("onpoint:mileage-start", { detail: { inspectionId, purpose } })); setTimeout(async () => { await refresh(); setBusy(false); }, 1200); }
  function stop() { setBusy(true); window.dispatchEvent(new CustomEvent("onpoint:mileage-stop")); setTimeout(async () => { await refresh(); setBusy(false); }, 1200); }

  return (
    <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
      <p className="text-xs font-black uppercase tracking-wider text-teal-300">Mileage Tracker</p>
      <p className="mt-2 text-2xl font-black text-white">{Number(active?.total_miles || 0).toFixed(1)} mi</p>
      <p className="mt-1 text-sm text-slate-300">{active ? "GPS tracking is active" : "Ready to record business mileage"}</p>
      <button disabled={busy} onClick={active ? stop : start} className={`mt-4 w-full rounded-xl px-4 py-3 font-black ${active ? "bg-rose-500 text-white" : "bg-teal-400 text-slate-950"}`}>{busy ? "Working…" : active ? "End Mileage Trip" : "Start Mileage Trip"}</button>

      <div className="mt-5 rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Total This Year</p>
        <p className="mt-1 text-2xl font-black text-teal-300">{yearMiles.toFixed(1)} mi</p>
      </div>

      {recent.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Recent Trips</p>
          <div className="space-y-2">
            {recent.slice(0, 10).map((trip: any) => (
              <div
                key={trip.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-[#020817]/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {trip.inspections?.property_address || trip.purpose || "Trip"}
                  </p>
                  <p className="text-xs text-slate-500">{formatTripDate(trip.started_at)}</p>
                </div>
                <p className="shrink-0 text-sm font-black text-teal-300">
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
