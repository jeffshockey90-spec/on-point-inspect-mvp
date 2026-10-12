"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton({ published }: { published: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || published}
      aria-busy={pending}
      className={`min-w-[154px] rounded-xl px-5 py-3 font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 [touch-action:manipulation] ${
        published
          ? "bg-green-700 text-white"
          : "bg-green-500 text-slate-950 hover:bg-green-400"
      }`}
    >
      {pending
        ? "Publishing..."
        : published
          ? "Report Published"
          : "Publish Report"}
    </button>
  );
}

export default function PublishReportActionButton({
  action,
  inspectionId,
  published,
}: {
  action: (formData: FormData) => void | Promise<void>;
  inspectionId: string;
  published: boolean;
}) {
  // How many AI drafts are still awaiting approval (findings + limitations +
  // equipment). These are HELD OUT of the published report until approved, so
  // we warn before publishing so none gets silently left off. Best-effort: a
  // failed/zero count just falls back to the normal confirm.
  const [pendingDrafts, setPendingDrafts] = useState(0);

  useEffect(() => {
    if (published || !inspectionId) return;
    let active = true;

    const refresh = async () => {
      try {
        const res = await fetch(
          `/api/field-review/pending?inspectionId=${encodeURIComponent(inspectionId)}`,
          { cache: "no-store" },
        );
        const data = await res.json().catch(() => ({}));
        if (active && res.ok) setPendingDrafts(Number(data?.counts?.total) || 0);
      } catch {
        /* non-blocking — fall back to the normal confirm */
      }
    };

    // Re-check whenever the queue could have changed (approve, background sync,
    // app refocus) — a one-shot mount fetch went stale, so after Approve-All it
    // could false-warn, or miss drafts that synced in after the page loaded.
    void refresh();
    const onFocus = () => void refresh();
    const onChange = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("opi:draft-queue-changed", onChange);
    window.addEventListener("opi:inspection-data-changed", onChange);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("opi:draft-queue-changed", onChange);
      window.removeEventListener("opi:inspection-data-changed", onChange);
    };
  }, [inspectionId, published]);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (published) {
          event.preventDefault();
          return;
        }

        const confirmed = window.confirm(
          pendingDrafts > 0
            ? `${pendingDrafts} AI draft${pendingDrafts === 1 ? "" : "s"} ${
                pendingDrafts === 1 ? "is" : "are"
              } still awaiting your approval and will NOT appear in the published report until approved (see the review queue at the top).\n\nPublish and email the report anyway?`
            : "Publish this report and email it to all report recipients?",
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="inspection_id" value={inspectionId} />
      <SubmitButton published={published} />
    </form>
  );
}