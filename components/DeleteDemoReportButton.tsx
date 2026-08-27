"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function DeleteDemoReportButton({
  demoInspectionId,
  label = "Delete Demo",
}: {
  demoInspectionId: string;
  label?: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [isRefreshing, startTransition] = useTransition();

  const busy = deleting || isRefreshing;

  async function deleteDemoReport() {
    if (busy) return;

    const confirmed = window.confirm(
      "Delete this demo report? This only deletes the public demo copy. Your original report will not be changed."
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage("");

    try {
      const res = await fetch("/api/demo-reports/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ demoInspectionId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete demo report.");
      }

      setMessage("Demo report deleted.");

      startTransition(() => {
        router.refresh();
      });
    } catch (error: any) {
      setMessage(error?.message || "Failed to delete demo report.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={deleteDemoReport}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500 px-3 py-2 text-xs font-semibold text-red-300 transition active:scale-[0.98] hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
      >
        {busy && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {busy ? "Deleting..." : label}
      </button>

      {message && <p className="max-w-xs text-[11px] font-bold text-[#59626f]">{message}</p>}
    </div>
  );
}
