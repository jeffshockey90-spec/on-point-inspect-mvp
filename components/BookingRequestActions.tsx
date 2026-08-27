"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  requestId: string;
};

export default function BookingRequestActions({ requestId }: Props) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState("");

  async function runAction(action: "confirm" | "decline") {
    setError("");
    setLoadingAction(action);

    try {
      const response = await fetch("/api/booking-requests/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "Booking request update failed.");
      }

      if (action === "confirm" && result?.inspectionId) {
        router.push(`/reports/${result.inspectionId}`);
        router.refresh();
        return;
      }

      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Booking request update failed.");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => runAction("confirm")}
          disabled={!!loadingAction}
          className="rounded-xl bg-teal-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingAction === "confirm" ? "Creating Inspection..." : "Confirm + Create Inspection"}
        </button>

        <button
          type="button"
          onClick={() => runAction("decline")}
          disabled={!!loadingAction}
          className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-[var(--fl-crit-text)] transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingAction === "decline" ? "Declining..." : "Decline"}
        </button>
      </div>

      {error ? <p className="text-xs font-bold text-[var(--fl-crit-text)]">{error}</p> : null}
    </div>
  );
}
