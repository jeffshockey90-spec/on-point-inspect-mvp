"use client";

type SharePublicSampleReportButtonProps = {
  url?: string;
  title?: string;
  description?: string;
};

export default function SharePublicSampleReportButton({
  url,
  title,
  description,
}: SharePublicSampleReportButtonProps) {
  const shareUrl =
    typeof window !== "undefined" && url
      ? new URL(url, window.location.origin).toString()
      : url || "";

  async function handleShare() {
    if (!shareUrl) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: title || "Sample Inspection Report",
          text: description || "View this sample inspection report.",
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      alert("Sample report link copied.");
    } catch {
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert("Sample report link copied.");
      } catch {
        alert("Unable to share this report right now.");
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={!shareUrl}
      className="rounded-xl border border-[var(--fl-line)] px-5 py-3 text-center font-semibold text-[var(--fl-text)] transition hover:border-teal-400 hover:text-[var(--fl-accent-text)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      Share
    </button>
  );
}