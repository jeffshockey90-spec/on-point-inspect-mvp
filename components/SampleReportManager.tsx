"use client";

import { useEffect, useState } from "react";

function getAbsoluteUrl(value: string) {
  if (typeof window === "undefined") return value;

  const clean = String(value || "").trim();
  if (!clean) return "";
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;

  return `${window.location.origin}${clean.startsWith("/") ? clean : `/${clean}`}`;
}

export default function SampleReportManager({
  inspectionId,
  initialEnabled = false,
  initialTitle = "",
  initialDescription = "",
  shareUrl = "",
}: {
  inspectionId: string;
  initialEnabled?: boolean;
  initialTitle?: string;
  initialDescription?: string;
  shareUrl?: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewerName, setViewerName] = useState("");
  const [trackingCopied, setTrackingCopied] = useState(false);

  // IMPORTANT:
  // Keep this value stable between server render and client hydration.
  // Do not use window.location here, or Next will throw a hydration mismatch.
  const publicShareUrl = String(shareUrl || `/share/${inspectionId}`).trim();

  useEffect(() => {
    setEnabled(initialEnabled);
    setTitle(initialTitle);
    setDescription(initialDescription);
  }, [initialEnabled, initialTitle, initialDescription]);

  async function saveSampleReport() {
    if (saving) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/sample-reports/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          enabled,
          title,
          description,
          // Store the same stable URL that was rendered. This avoids hydration
          // issues and still works as an internal public link.
          shareUrl: publicShareUrl,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error || "Unable to save sample report settings.",
        );
      }

      setMessage(
        enabled
          ? "Sample report is now visible on your public profile."
          : "Sample report is hidden from your public profile.",
      );
    } catch (err: any) {
      setError(err?.message || "Unable to save sample report settings.");
    } finally {
      setSaving(false);
    }
  }

  async function shareReport() {
    if (!publicShareUrl) return;

    const absoluteUrl = getAbsoluteUrl(publicShareUrl);

    if (navigator.share) {
      try {
        await navigator.share({
          title: title || "Sample inspection report",
          text: description || "View this sample inspection report.",
          url: absoluteUrl,
        });
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(absoluteUrl || publicShareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  // Robust clipboard write that falls back to the legacy execCommand path when
  // navigator.clipboard is unavailable (older browsers / non-secure contexts).
  async function copyToClipboard(text: string) {
    if (!text) return false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }

  // Named tracking link: opening it attributes the view to this recipient in the
  // owner's "Report Viewed" push. Preserves the share token in publicShareUrl and
  // appends ?role=realtor&v=<encoded name>.
  function buildTrackingLink() {
    const absoluteUrl = getAbsoluteUrl(publicShareUrl) || publicShareUrl;
    if (!absoluteUrl) return "";

    try {
      const url = new URL(absoluteUrl, window.location.origin);
      url.searchParams.set("role", "realtor");
      const name = viewerName.trim();
      if (name) url.searchParams.set("v", name);
      return url.toString();
    } catch {
      const name = viewerName.trim();
      const params = `role=realtor${name ? `&v=${encodeURIComponent(name)}` : ""}`;
      return `${absoluteUrl}${absoluteUrl.includes("?") ? "&" : "?"}${params}`;
    }
  }

  async function copyTrackingLink() {
    const link = buildTrackingLink();
    if (!link) return;

    const ok = await copyToClipboard(link);
    if (ok) {
      setTrackingCopied(true);
      window.setTimeout(() => setTrackingCopied(false), 2000);
    }
  }

  return (
    <section className="mb-8 max-w-full overflow-hidden rounded-2xl border border-teal-500/40 bg-teal-950/20 p-4 shadow-xl">
      <div className="flex max-w-full flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="break-words text-xs font-semibold uppercase tracking-[0.25em] text-teal-300">
            Public Profile Marketing
          </p>
          <h2 className="mt-2 break-words text-2xl font-semibold text-white">
            Sample Report
          </h2>
          <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-[#8a93a3]">
            Feature this report on your public inspector profile so clients and
            realtors can preview the quality of your work.
          </p>
        </div>

        <span
          className={`w-fit shrink-0 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
            enabled
              ? "border-teal-400/60 bg-teal-500/15 text-teal-300"
              : "border-[#232b38] bg-[#131923] text-[#8a93a3]"
          }`}
        >
          {enabled ? "Visible on Profile" : "Not Public"}
        </span>
      </div>

      <div className="mt-5 grid max-w-full gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <label className="flex min-w-0 max-w-full flex-col gap-3 rounded-2xl border border-[#232b38] bg-[#0a0e13] p-4 sm:flex-row sm:items-start">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-5 w-5 shrink-0 accent-teal-400 sm:mt-1"
          />
          <span className="block min-w-0 flex-1">
            <span className="block break-words font-semibold text-white">
              Show on public profile
            </span>
            <span className="mt-1 block break-words text-sm leading-6 text-[#8a93a3]">
              Adds this report to the Sample Reports section of your public
              profile.
            </span>
          </span>
        </label>

        <div className="grid min-w-0 max-w-full gap-3 md:grid-cols-2">
          <label className="block min-w-0">
            <p className="mb-2 break-words text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
              Sample Report Title
            </p>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Example: Buyer Inspection Sample"
              className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-teal-400"
            />
          </label>

          <label className="block min-w-0">
            <p className="mb-2 break-words text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
              Short Description
            </p>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Example: Full residential inspection with photos and summary."
              className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-teal-400"
            />
          </label>
        </div>
      </div>

      {publicShareUrl && (
        <p className="mt-4 max-w-full break-all rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-xs font-bold text-[#8a93a3]">
          Public sample link: {publicShareUrl}
        </p>
      )}

      <div className="mt-4 rounded-2xl border border-teal-500/30 bg-[#0a0e13] p-4">
        <p className="break-words text-xs font-semibold uppercase tracking-wide text-teal-300">
          Tracking Link
        </p>
        <p className="mt-1 break-words text-sm leading-6 text-[#8a93a3]">
          Add the realtor&apos;s name to get a personalized link. When they open
          it, your view notification names them and shows their device.
        </p>

        <div className="mt-3 flex max-w-full flex-col gap-3 sm:flex-row">
          <input
            value={viewerName}
            onChange={(event) => setViewerName(event.target.value)}
            placeholder="Recipient name (e.g. Jane Smith)"
            className="w-full min-w-0 flex-1 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-teal-400"
          />
          <button
            type="button"
            onClick={copyTrackingLink}
            disabled={!publicShareUrl}
            className="inline-flex w-full items-center justify-center rounded-xl border border-teal-500/60 px-5 py-3 text-sm font-semibold text-teal-300 transition hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {trackingCopied ? "Copied" : "Copy tracking link"}
          </button>
        </div>
      </div>

      {message && (
        <p className="mt-4 max-w-full break-words rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm font-bold text-emerald-300">
          {message}
        </p>
      )}

      {error && (
        <p className="mt-4 max-w-full break-words rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm font-bold text-red-300">
          {error}
        </p>
      )}

      <div className="mt-5 flex max-w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={saveSampleReport}
          disabled={saving}
          className="inline-flex w-full items-center justify-center rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {saving ? "Saving..." : "Save Sample Report Settings"}
        </button>

        <button
          type="button"
          onClick={shareReport}
          disabled={!publicShareUrl}
          className="inline-flex w-full items-center justify-center rounded-xl border border-teal-500/60 px-5 py-3 text-sm font-semibold text-teal-300 transition hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {copied ? "Copied Link" : "Share / Copy Sample Link"}
        </button>
      </div>
    </section>
  );
}
