"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export default function CreateDemoReportButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isNavigating, startTransition] = useTransition();

  const busy = creating || isNavigating;

  const fullDemoUrl = useMemo(() => {
    if (!demoUrl) return "";

    if (typeof window === "undefined") return demoUrl;

    return `${window.location.origin}${demoUrl}`;
  }, [demoUrl]);

  async function copyDemoLink(urlToCopy = fullDemoUrl) {
    if (!urlToCopy) return;

    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      setMessage("Demo link copied.");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage("Could not copy automatically. Open the demo and copy the URL.");
    }
  }

  async function openDemo(urlToOpen = demoUrl) {
    if (!urlToOpen || busy) return;

    startTransition(() => {
      router.push(urlToOpen);
      router.refresh();
    });
  }

  async function createDemoReport() {
    if (busy) return;

    const confirmed = window.confirm(
      "Create a public demo copy of this report? Client, realtor, agreement, and payment details will be removed from the demo copy."
    );

    if (!confirmed) return;

    setCreating(true);
    setMessage("");
    setDemoUrl("");
    setCopied(false);

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

      const nextDemoId = data.demoInspectionId || data.demoId || data.id;
      const nextDemoUrl = data.demoUrl || (nextDemoId ? `/demo/${nextDemoId}` : "");

      if (!nextDemoUrl) {
        throw new Error("Demo report was created, but no demo URL was returned.");
      }

      setDemoUrl(nextDemoUrl);
      setMessage("Demo report created. Opening demo...");

      startTransition(() => {
        router.push(nextDemoUrl);
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
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-500 px-5 py-3 font-bold text-[var(--fl-purple-text)] transition active:scale-[0.98] hover:bg-fuchsia-500/10 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
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

      {demoUrl && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openDemo()}
            disabled={busy}
            className="rounded-lg border border-teal-500 px-3 py-2 text-xs font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            View Demo
          </button>

          <button
            type="button"
            onClick={() => copyDemoLink()}
            className="rounded-lg border border-[var(--fl-line)] px-3 py-2 text-xs font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)]"
          >
            {copied ? "Copied!" : "Copy Demo Link"}
          </button>
        </div>
      )}

      {message && (
        <p className="max-w-xs text-xs font-bold text-[var(--fl-muted)]">{message}</p>
      )}
    </div>
  );
}
