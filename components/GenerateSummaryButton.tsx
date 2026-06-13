"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function GenerateSummaryButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isRefreshing, startTransition] = useTransition();

  const busy = generating || isRefreshing;

  async function generateSummary() {
    if (busy) return;

    if (!inspectionId) {
      alert("Missing inspection ID.");
      return;
    }

    setGenerating(true);
    setGenerated(false);
    setErrorMessage("");

    try {
      const res = await fetch("/api/generate-summary", {
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
        const message = data.error || "Failed to generate executive summary.";
        setErrorMessage(message);
        alert(message);
        return;
      }

      setGenerated(true);

      startTransition(() => {
        router.refresh();
      });
    } catch (error: any) {
      const message = error?.message || "Failed to generate executive summary.";
      setErrorMessage(message);
      alert(message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={generateSummary}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-teal-500 bg-[#071224] px-5 py-3 font-bold text-teal-300 transition hover:bg-teal-500/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
      >
        {busy && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}

        {generating
          ? "Generating..."
          : isRefreshing
            ? "Updating Report..."
            : generated
              ? "Summary Saved"
              : "Generate Executive Summary"}
      </button>

      {generated && !busy && (
        <span className="text-xs font-semibold text-teal-300">
          Executive summary saved.
        </span>
      )}

      {errorMessage && !busy && (
        <span className="text-xs font-semibold text-red-300">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
