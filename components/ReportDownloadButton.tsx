"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  href: string;
  children: React.ReactNode;
  filename?: string;
  className?: string;
  preparingText?: string;
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

// Downloads a server-generated report PDF via fetch so the button can show an
// accurate "Preparing..." state for the ENTIRE time the server is building the
// file, then hands the finished blob to the browser to save. A plain <a>
// download gives no completion signal, so its spinner can't track the real
// work; this does.
export default function ReportDownloadButton({
  href,
  children,
  filename = "inspection-report.pdf",
  className = "",
  preparingText = "Preparing PDF...",
}: Props) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  async function startDownload() {
    if (preparing || !href) return;

    setPreparing(true);
    setError("");
    if (errorTimer.current) {
      clearTimeout(errorTimer.current);
      errorTimer.current = null;
    }

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
      anchor.rel = "noopener";
      anchor.style.display = "none";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 30000);
    } catch (downloadError: any) {
      if (downloadError?.name !== "AbortError") {
        const message =
          downloadError?.message ||
          "The report could not be downloaded. Please try again.";
        setError(message);
        errorTimer.current = setTimeout(() => setError(""), 6000);
      }
    } finally {
      abortRef.current = null;
      setPreparing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={startDownload}
      disabled={preparing || !href}
      aria-busy={preparing}
      data-fast-click="true"
      title={error || undefined}
      className={`${className} ${
        preparing ? "cursor-wait opacity-80" : ""
      }`}
    >
      {preparing ? (
        <>
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{preparingText}</span>
        </>
      ) : error ? (
        <span>⚠ Download failed — tap to retry</span>
      ) : (
        children
      )}
    </button>
  );
}
