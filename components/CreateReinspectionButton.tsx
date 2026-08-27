"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

// Creates a re-inspection from this report (copies it + its findings) and opens
// the new report so the inspector can re-evaluate each item.
export default function CreateReinspectionButton({ inspectionId }: { inspectionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (busy) return;
    if (!confirm("Create a re-inspection? This copies this report and its findings into a new report to re-check.")) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/inspections/reinspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: Number(inspectionId) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.id) {
        setError(data?.error || "Could not create re-inspection.");
        setBusy(false);
        return;
      }
      router.push(`/reports/${data.id}`);
    } catch {
      setError("Could not create re-inspection.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={create}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] transition hover:border-teal-400 hover:bg-teal-500/10 hover:text-[var(--fl-accent-text)] disabled:opacity-60"
      >
        <RotateCcw className="h-4 w-4" />
        {busy ? "Creating…" : "Re-inspection"}
      </button>
      {error && <span className="mt-1 text-xs font-bold text-[var(--fl-crit-text)]">{error}</span>}
    </span>
  );
}
