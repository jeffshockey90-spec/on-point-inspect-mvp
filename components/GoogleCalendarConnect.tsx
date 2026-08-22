"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, Check, RefreshCw } from "lucide-react";

type Status = { connected: boolean; email: string | null; configured: boolean };

const BANNERS: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Google Calendar connected.", ok: true },
  denied: { text: "Connection was cancelled.", ok: false },
  failed: { text: "Couldn't connect — please try again.", ok: false },
  badstate: { text: "Security check failed — please try again.", ok: false },
  notconfigured: { text: "Google Calendar isn't set up on this account yet.", ok: false },
};

export default function GoogleCalendarConnect() {
  const params = useSearchParams();
  const banner = BANNERS[params.get("gcal") || ""];
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/google/calendar", { cache: "no-store" });
      setStatus(await r.json());
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function sync() {
    setBusy(true);
    setSyncMsg("");
    try {
      const r = await fetch("/api/google/calendar", { method: "POST" });
      const d = await r.json();
      setSyncMsg(r.ok ? `Synced ${d.synced} inspection${d.synced === 1 ? "" : "s"} to your calendar.` : d.error || "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Google Calendar? Existing events stay on your calendar.")) return;
    setBusy(true);
    try {
      await fetch("/api/google/calendar", { method: "DELETE" });
      setSyncMsg("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-5">
      <div className="flex items-start gap-3">
        <Calendar className="mt-0.5 h-6 w-6 shrink-0 text-cyan-300" />
        <div className="min-w-0 flex-1">
          <p className="font-black text-white">Google Calendar</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">
            Push your scheduled inspections onto your Google Calendar so they show up alongside
            everything else. Re-syncing updates existing events instead of duplicating them.
          </p>

          {banner && (
            <p className={`mt-3 rounded-lg border px-3 py-2 text-sm font-bold ${banner.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200"}`}>
              {banner.text}
            </p>
          )}

          {status?.connected ? (
            <div className="mt-4">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-200">
                <Check className="h-3.5 w-3.5" />
                Connected{status.email ? ` · ${status.email}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={sync}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                  {busy ? "Syncing…" : "Sync upcoming inspections"}
                </button>
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={busy}
                  className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
              {syncMsg && <p className="mt-3 text-sm font-bold text-slate-300">{syncMsg}</p>}
            </div>
          ) : status && !status.configured ? (
            <p className="mt-4 text-sm text-amber-300">
              Google Calendar isn&apos;t configured on this account yet.
            </p>
          ) : (
            <a
              href="/api/google/calendar/connect"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-400"
            >
              <Calendar className="h-4 w-4" />
              Connect Google Calendar
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
