"use client";
import { useEffect, useState } from "react";

export default function MileageControls({ inspectionId, purpose = "Inspection travel" }: { inspectionId?: string; purpose?: string }) {
  const [active, setActive] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  async function refresh() { const data = await fetch("/api/mileage", { cache: "no-store" }).then((r) => r.ok ? r.json() : null); setActive(data?.active || null); }
  useEffect(() => { refresh(); const timer = setInterval(refresh, 15000); return () => clearInterval(timer); }, []);
  function start() { setBusy(true); window.dispatchEvent(new CustomEvent("onpoint:mileage-start", { detail: { inspectionId, purpose } })); setTimeout(async () => { await refresh(); setBusy(false); }, 1200); }
  function stop() { setBusy(true); window.dispatchEvent(new CustomEvent("onpoint:mileage-stop")); setTimeout(async () => { await refresh(); setBusy(false); }, 1200); }
  return <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
    <p className="text-xs font-black uppercase tracking-wider text-teal-300">Mileage Tracker</p>
    <p className="mt-2 text-2xl font-black text-white">{Number(active?.total_miles || 0).toFixed(1)} mi</p>
    <p className="mt-1 text-sm text-slate-300">{active ? "GPS tracking is active" : "Ready to record business mileage"}</p>
    <button disabled={busy} onClick={active ? stop : start} className={`mt-4 w-full rounded-xl px-4 py-3 font-black ${active ? "bg-rose-500 text-white" : "bg-teal-400 text-slate-950"}`}>{busy ? "Working…" : active ? "End Mileage Trip" : "Start Mileage Trip"}</button>
  </div>;
}
