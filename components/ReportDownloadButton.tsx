"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  href: string;
  filename?: string;
};

function getFilenameFromDisposition(
  disposition: string | null,
  fallback: string,
) {
  if (!disposition) return fallback;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/["']/g, ""));
    } catch {
      return utf8Match[1].replace(/["']/g, "");
    }
  }

  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1]?.trim() || fallback;
}

export default function ReportDownloadButton({
  href,
  filename = "inspection-report.pdf",
}: Props) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function startDownload() {
    if (preparing || !href) return;

    setPreparing(true);
    setError("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(href, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(
          message || `Report download failed (${response.status}).`,
        );
      }

      const blob = await response.blob();

      if (!blob.size) {
        throw new Error("The generated report was empty.");
      }

      const downloadName = getFilenameFromDisposition(
        response.headers.get("content-disposition"),
        filename,
      );

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = downloadName;
      anchor.style.display = "none";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 30000);
    } catch (downloadError: any) {
      if (downloadError?.name !== "AbortError") {
        setError(
          downloadError?.message ||
            "The report could not be downloaded. Please try again.",
        );
      }
    } finally {
      abortRef.current = null;
      setPreparing(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={startDownload}
        disabled={preparing || !href}
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

      {error ? (
        <p className="max-w-sm text-sm font-semibold text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
