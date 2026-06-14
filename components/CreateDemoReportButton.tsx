"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateDemoReportButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  async function createDemoReport() {
    if (creating) return;

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

      setMessage("Demo report created. Opening...");
      router.push(`/demo/${data.demoId}`);
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
        disabled={creating}
        aria-busy={creating}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-500 px-5 py-3 font-bold text-fuchsia-300 transition active:scale-[0.98] hover:bg-fuchsia-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
      >
        {creating && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {creating ? "Creating Demo..." : "Create Demo Report"}
      </button>

      {message && (
        <p className="max-w-xs text-xs font-bold text-slate-400">{message}</p>
      )}
    </div>
  );
}
