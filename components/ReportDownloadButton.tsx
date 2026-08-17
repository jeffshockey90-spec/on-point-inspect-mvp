"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  href: string;
  children: React.ReactNode;
  filename?: string;
  className?: string;
  preparingText?: string;
};

/**
 * Any iPhone/iPad — the native Capacitor app AND mobile Safari (which is every
 * browser engine on iOS). iPadOS reports itself as "MacIntel", so the
 * touch-point check separates an iPad from a real Mac.
 *
 * These all get the PDF by navigating straight to the URL inside the click
 * gesture: iOS Safari hands the attachment to the download manager (saves to
 * Files), and the native app's WKWebView opens the PDF so the user can Save to
 * Files / print from the share sheet. The fetched-blob path below is what breaks
 * on iOS — Safari drops the user-gesture grant across the `await`, blob: URLs
 * are flaky, and the WKWebView has no blob download handling — so it stays
 * desktop-only.
 */
function isAppleMobile() {
  if (typeof navigator === "undefined") return false;

  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

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

  // Fetch the server-built PDF as a blob, surfacing the route's real error text
  // (and a friendly timeout message) instead of a JSON dump.
  async function fetchReportBlob(signal: AbortSignal) {
    const response = await fetch(href, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let message = "";
      try {
        message = JSON.parse(raw)?.error || "";
      } catch {
        // The friendly HTML error page isn't JSON; pull its message line.
        const match = raw.match(/<p[^>]*>([^<]+)<\/p>/i);
        message = match?.[1]?.trim() || raw.slice(0, 200);
      }

      if (response.status === 504 || response.status === 408) {
        message =
          "This report has too many photos to build in time. We've been notified — please tell your inspector.";
      }

      throw new Error(message || `Report download failed (${response.status}).`);
    }

    const blob = await response.blob();
    if (!blob.size) throw new Error("The generated report was empty.");

    const downloadName = getFilenameFromDisposition(
      response.headers.get("content-disposition"),
      filename,
    );

    return { blob, downloadName };
  }

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
      const { blob, downloadName } = await fetchReportBlob(controller.signal);

      // iPhone/iPad (Safari AND the native app): a plain <a download> doesn't
      // save on iOS. Hand the finished PDF to the native share sheet, which has
      // "Save to Files" / Print and works in Safari and the app's WKWebView.
      if (isAppleMobile()) {
        const nav = navigator as any;
        const file = new File([blob], downloadName, { type: "application/pdf" });

        if (nav.canShare?.({ files: [file] }) && nav.share) {
          try {
            await nav.share({ files: [file], title: downloadName });
            return;
          } catch (shareError: any) {
            // User dismissed the sheet — that's a choice, not a failure.
            if (shareError?.name === "AbortError") return;
            // Otherwise (e.g. the gesture expired during a long build) fall
            // through to opening the PDF so it isn't a dead end.
          }
        }

        window.location.href = href;
        return;
      }

      // Desktop (Windows/Mac/Linux): hand the blob to the browser as a real file
      // download.
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
        // Long enough to actually read now that it renders inline.
        errorTimer.current = setTimeout(() => setError(""), 20000);
      }
    } finally {
      abortRef.current = null;
      setPreparing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={startDownload}
        disabled={preparing || !href}
        aria-busy={preparing}
        data-fast-click="true"
        className={`${className} ${preparing ? "cursor-wait opacity-80" : ""}`}
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

      {/* The reason used to live only in the button's `title`, which is
          unreachable on a phone — so a realtor saw "failed" with no way to learn
          why, and no way to tell us anything useful. Render it inline instead. */}
      {error && (
        <p role="alert" className="text-sm font-semibold leading-5 text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
