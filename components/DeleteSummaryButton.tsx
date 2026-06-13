"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function DeleteSummaryButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  const busy = deleting || isRefreshing;

  async function deleteSummary() {
    if (busy) return;

    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }

    const confirmed = window.confirm(
      "Delete the Executive Summary for this report?"
    );

    if (!confirmed) return;

    setDeleting(true);
    setDeleted(false);

    try {
      const res = await fetch("/api/delete-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Failed to delete summary.");
        return;
      }

      setDeleted(true);

      startTransition(() => {
        router.refresh();
      });
    } catch (error: any) {
      alert(error?.message || "Failed to delete summary.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={deleteSummary}
      disabled={busy || deleted}
      aria-busy={busy}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500 px-5 py-3 font-bold text-red-300 transition active:scale-[0.98] hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
    >
      {busy && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {deleting
        ? "Deleting..."
        : isRefreshing
          ? "Updating..."
          : deleted
            ? "Deleted"
            : "Delete Summary"}
    </button>
  );
}
