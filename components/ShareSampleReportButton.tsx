"use client";

import { useEffect, useMemo, useState } from "react";

type ShareSampleReportButtonProps = {
  shareUrl: string;
  title?: string;
  description?: string;
  compact?: boolean;
};

function getAbsoluteUrl(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;

  if (typeof window === "undefined") return clean;
  const path = clean.startsWith("/") ? clean : `/${clean}`;
  return `${window.location.origin}${path}`;
}

export default function ShareSampleReportButton({
  shareUrl,
  title = "Sample Inspection Report",
  description = "View this sample inspection report.",
  compact = false,
}: ShareSampleReportButtonProps) {
  const [copied, setCopied] = useState(false);
  const [absoluteUrl, setAbsoluteUrl] = useState(shareUrl || "");

  useEffect(() => {
    setAbsoluteUrl(getAbsoluteUrl(shareUrl));
  }, [shareUrl]);

  const shareText = useMemo(() => {
    return `${description}\n\n${absoluteUrl}`.trim();
  }, [absoluteUrl, description]);

  async function copyLink() {
    if (!absoluteUrl) return;

    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function shareReport() {
    if (!absoluteUrl) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url: absoluteUrl,
        });
        return;
      } catch {}
    }

    await copyLink();
  }

  const buttonBase = compact
    ? "inline-flex flex-1 items-center justify-center rounded-xl border border-teal-500/60 px-4 py-3 text-center text-sm font-black text-teal-300 transition hover:bg-teal-500/10"
    : "inline-flex items-center justify-center rounded-xl border border-teal-500/60 px-5 py-3 font-bold text-teal-300 transition hover:bg-teal-500/10";

  const encodedSubject = encodeURIComponent(title);
  const encodedBody = encodeURIComponent(shareText);
  const smsBody = encodeURIComponent(`${title}\n${absoluteUrl}`.trim());

  if (compact) {
    return (
      <button
        type="button"
        onClick={shareReport}
        disabled={!shareUrl}
        className={`${buttonBase} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {copied ? "Copied" : "Share"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button
        type="button"
        onClick={shareReport}
        disabled={!shareUrl}
        className={`${buttonBase} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {copied ? "Copied Link" : "Share Sample Report"}
      </button>

      <a
        href={`mailto:?subject=${encodedSubject}&body=${encodedBody}`}
        className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
      >
        Email
      </a>

      <a
        href={`sms:?&body=${smsBody}`}
        className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
      >
        Text
      </a>

      <button
        type="button"
        onClick={copyLink}
        disabled={!shareUrl}
        className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-200 transition hover:border-teal-400 hover:text-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
