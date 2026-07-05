"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateSampleDataButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  async function createSampleData() {
    if (creating) return;

    setCreating(true);
    setMessage("");

    try {
      const response = await fetch("/api/sample-data/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Could not create sample data.");
      }

      setMessage("Sample inspection created.");
      router.refresh();

      if (data?.inspectionId) {
        window.location.href = `/reports/${data.inspectionId}`;
      }
    } catch (error: any) {
      setMessage(error?.message || "Could not create sample data.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={createSampleData}
        disabled={creating}
        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-purple-400/60 bg-purple-500/10 px-5 py-3 text-sm font-black text-purple-200 transition hover:bg-purple-500/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {creating && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {creating ? "Creating Sample..." : "✨ Create Sample Inspection"}
      </button>

      {message ? (
        <p className="text-xs font-bold text-purple-200">{message}</p>
      ) : null}
    </div>
  );
}
