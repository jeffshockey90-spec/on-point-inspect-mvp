"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";

// One-tap "create/update this inspection's QuickBooks invoice". Renders only
// when QuickBooks is connected for the inspector, so it stays out of the way
// for everyone who hasn't set it up.
export default function QuickBooksInvoiceButton({
  inspectionId,
}: {
  inspectionId: string | number;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/quickbooks", { cache: "no-store" });
        const d = await r.json();
        setConnected(Boolean(d?.connected));
      } catch {
        setConnected(false);
      }
    })();
  }, []);

  if (!connected) return null;

  async function send() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/quickbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId }),
      });
      const d = await r.json();
      setOk(r.ok);
      setMsg(r.ok ? "Invoice sent to QuickBooks." : d.error || "Sync failed.");
    } catch {
      setOk(false);
      setMsg("Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-green-500/50 bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-green-200 transition hover:bg-green-500/20 disabled:opacity-50"
      >
        <Receipt className="h-4 w-4" />
        {busy ? "Sending…" : "Send invoice to QuickBooks"}
      </button>
      {msg && (
        <p className={`mt-2 text-sm font-bold ${ok ? "text-emerald-300" : "text-amber-300"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
