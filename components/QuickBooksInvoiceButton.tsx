"use client";

import { useEffect, useRef, useState } from "react";
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
  // Synchronous latch: `disabled={busy}` lags a frame behind a fast double-tap
  // (iOS ghost-click), and QuickBooks' sync is a non-atomic check-then-create,
  // so two near-simultaneous POSTs each create a REAL invoice. A ref blocks the
  // second dispatch in the same frame.
  const inFlightRef = useRef(false);

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
    if (inFlightRef.current) return; // block a same-frame double-tap
    inFlightRef.current = true;
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
      inFlightRef.current = false;
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-green-500/50 bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-[var(--fl-good-text)] transition hover:bg-green-500/20 disabled:opacity-50"
      >
        <Receipt className="h-4 w-4" />
        {busy ? "Sending…" : "Send invoice to QuickBooks"}
      </button>
      {msg && (
        <p className={`mt-2 text-sm font-bold ${ok ? "text-[var(--fl-good-text)]" : "text-[var(--fl-warn-text)]"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
