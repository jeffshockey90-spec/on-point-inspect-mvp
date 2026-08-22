"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Receipt, Check, RefreshCw } from "lucide-react";

type Status = { connected: boolean; company: string | null; configured: boolean };

const BANNERS: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "QuickBooks connected.", ok: true },
  denied: { text: "Connection was cancelled.", ok: false },
  failed: { text: "Couldn't connect — please try again.", ok: false },
  badstate: { text: "Security check failed — please try again.", ok: false },
  notconfigured: { text: "QuickBooks isn't set up on this account yet.", ok: false },
};

export default function QuickBooksConnect() {
  const params = useSearchParams();
  const banner = BANNERS[params.get("qbo") || ""];
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/quickbooks", { cache: "no-store" });
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
      const r = await fetch("/api/quickbooks", { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        setSyncMsg(d.error || "Sync failed.");
      } else {
        const parts = [
          `Synced ${d.synced} invoice${d.synced === 1 ? "" : "s"} to QuickBooks`,
        ];
        if (d.skipped) parts.push(`${d.skipped} skipped (no amount)`);
        if (d.errors?.length) parts.push(`${d.errors.length} error(s): ${d.errors.join("; ")}`);
        setSyncMsg(`${parts.join(" · ")}.`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect QuickBooks? Invoices already created stay in QuickBooks.")) return;
    setBusy(true);
    try {
      await fetch("/api/quickbooks", { method: "DELETE" });
      setSyncMsg("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-5">
      <div className="flex items-start gap-3">
        <Receipt className="mt-0.5 h-6 w-6 shrink-0 text-green-300" />
        <div className="min-w-0 flex-1">
          <p className="font-black text-white">QuickBooks</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">
            Turn your inspections into QuickBooks invoices — each client becomes a
            customer and each billable inspection an invoice for its fee. Re-syncing
            updates the existing invoice instead of duplicating it.
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
                Connected{status.company ? ` · ${status.company}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={sync}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-green-400 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                  {busy ? "Syncing…" : "Sync inspections to invoices"}
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
              QuickBooks isn&apos;t configured on this account yet.
            </p>
          ) : (
            <a
              href="/api/quickbooks/connect"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-green-400"
            >
              <Receipt className="h-4 w-4" />
              Connect QuickBooks
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
