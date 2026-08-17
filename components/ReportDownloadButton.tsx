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
  // On iOS the built PDF is held here between the "build" tap and the "save"
  // tap, because the OS share sheet only opens from a fresh user gesture.
  const [readyFile, setReadyFile] = useState<File | null>(null);
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

  // iOS second step: the PDF is already built, so open the share sheet now —
  // this runs inside a fresh tap, which is what iOS requires for it to appear.
  async function saveReadyFile() {
    const file = readyFile;
    if (!file) return;
    const nav = navigator as any;
    try {
      await nav.share({ files: [file], title: file.name });
      setReadyFile(null);
    } catch (shareError: any) {
      // Sheet dismissed — keep it armed so another tap can retry.
      if (shareError?.name === "AbortError") return;
      // Sharing genuinely failed — open the built PDF so it's not a dead end.
      try {
        const objectUrl = URL.createObjectURL(file);
        window.location.href = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      } catch {
        /* ignore */
      }
      setReadyFile(null);
    }
  }

  async function startDownload() {
    if (preparing) return;

    // Second tap on iOS: save the already-built PDF from this fresh gesture.
    if (readyFile) {
      await saveReadyFile();
      return;
    }

    if (!href) return;

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
      // iPhone/iPad — Safari AND the native app. iOS renders a PDF inline no
      // matter the disposition, so a plain navigation just VIEWS it (that black
      // screen while it builds, then the PDF). The only real "save" is the OS
      // share sheet (Save to Files / Print), which works in Safari and WKWebView.
      if (isAppleMobile()) {
        const nav = navigator as any;
        const file = new File([blob], downloadName, { type: "application/pdf" });

        if (nav.canShare?.({ files: [file] }) && nav.share) {
          // Try to save in ONE tap — works when the build was fast enough that
          // iOS still honors the original tap.
          try {
            await nav.share({ files: [file], title: downloadName });
            return;
          } catch (shareError: any) {
            if (shareError?.name === "AbortError") return; // user dismissed
            // The build outran iOS's tap window — arm the button so one more
            // (fresh) tap opens the share sheet.
            setReadyFile(file);
            return;
          }
        }

        // No file-share support at all — open the built PDF (blob) as a
        // last resort so it isn't a dead end.
        const objectUrl = URL.createObjectURL(blob);
        window.location.href = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
        return;
      }

      // Desktop (Windows/Mac/Linux, all browsers incl. Safari): hand the blob to
      // the browser as a real file download.
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = downloadName;
      anchor.rel = "noopener";
      anchor.target = "_self";
      anchor.style.display = "none";

      document.body.appendChild(anchor);
      anchor.click();

      // Safari (macOS especially) can CANCEL the download if the anchor or its
      // blob URL is torn down in the same tick as the click. Clean up on a delay
      // so the download has fully started first.
      window.setTimeout(() => {
        anchor.remove();
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
        disabled={preparing || (!href && !readyFile)}
        aria-busy={preparing}
        data-fast-click="true"
        className={`${className} ${preparing ? "cursor-wait opacity-80" : ""}`}
      >
        {preparing ? (
          <>
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>{preparingText}</span>
          </>
        ) : readyFile ? (
          <span>⬇ Save PDF</span>
        ) : error ? (
          <span>⚠ Download failed — tap to retry</span>
        ) : (
          children
        )}
      </button>

      {/* The share sheet only opens from a fresh tap, so once the PDF is built we
          ask for that second tap explicitly instead of failing silently. */}
      {readyFile && !preparing && (
        <p className="text-sm font-semibold leading-5 text-emerald-300">
          Ready — tap “Save PDF”, then choose Save to Files.
        </p>
      )}

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
