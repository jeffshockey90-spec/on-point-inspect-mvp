"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function CreateDemoReportButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [isNavigating, startTransition] = useTransition();

  const busy = creating || isNavigating;

  async function createDemoReport() {
    if (busy) return;

    const confirmed = window.confirm(
      "Create a public demo copy of this report? Client, realtor, agreement, and payment details will be removed from the demo copy."
    );

    if (!confirmed) return;

    setCreating(true);
    setMessage("");

    try {
      const res = await fetch("/api/demo-reports/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inspectionId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to create demo report.");
      }

      const demoId = data.demoInspectionId || data.demoId || data.id;
      const demoUrl = data.demoUrl || (demoId ? `/demo/${demoId}` : "");

      if (!demoUrl) {
        throw new Error("Demo report was created, but no demo URL was returned.");
      }

      setMessage("Demo report created. Opening demo...");

      startTransition(() => {
        router.push(demoUrl);
        router.refresh();
      });
    } catch (error: any) {
      setMessage(error?.message || "Failed to create demo report.");
      setCreating(false);
    }
  }

  return (
    <div className="inline-flex flex-col gap-2">
      <button
        type="button"
        onClick={createDemoReport}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-500 px-5 py-3 font-bold text-fuchsia-300 transition active:scale-[0.98] hover:bg-fuchsia-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
      >
        {busy && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}

        {creating
          ? "Creating Demo..."
          : isNavigating
            ? "Opening Demo..."
            : "Create Demo Report"}
      </button>

      {message && (
        <p className="max-w-xs text-xs font-bold text-slate-400">{message}</p>
      )}
    </div>
  );
}
