"use client";

import { useEffect, useRef, useState } from "react";

export default function ReportDownloadButton({ href }: { href: string }) {
  const [preparing, setPreparing] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  function startDownload() {
    if (preparing) return;

    setPreparing(true);

    // Open immediately from the user's click so browsers do not block it.
    const downloadWindow = window.open(href, "_blank");

    // Fall back to the current tab if the browser blocks a new tab.
    if (!downloadWindow) {
      window.location.assign(href);
      return;
    }

    try {
      downloadWindow.opener = null;
    } catch {}

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setPreparing(false);
    }, 12000);
  }

  return (
    <button
      type="button"
      onClick={startDownload}
      disabled={preparing}
      aria-busy={preparing}
      data-fast-click="true"
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-cyan-500 bg-cyan-500/10 px-5 py-3 font-bold text-cyan-300 transition active:scale-[0.98] active:opacity-80 disabled:cursor-wait disabled:opacity-75 [touch-action:manipulation] hover:bg-cyan-500 hover:text-black"
    >
      {preparing ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Preparing PDF...
        </>
      ) : (
        <>⬇ Download Report</>
      )}
    </button>
  );
}
