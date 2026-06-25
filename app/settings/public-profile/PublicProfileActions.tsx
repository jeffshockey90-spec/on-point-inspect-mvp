"use client";

type PublicProfileActionsProps = {
  profileUrl?: string;
  logoUrl?: string;
  companyName?: string;
};

export default function PublicProfileActions({
  profileUrl,
  logoUrl,
  companyName,
}: PublicProfileActionsProps) {
  const url = String(profileUrl || "").trim();

  async function copyLink() {
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      alert("Public profile link copied.");
    } catch {
      alert("Unable to copy link.");
    }
  }

  async function shareProfile() {
    if (!url) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: companyName || "Inspector Profile",
          text: "View my public inspection portfolio.",
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      alert("Public profile link copied.");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        alert("Public profile link copied.");
      } catch {
        alert("Unable to share profile.");
      }
    }
  }

  function downloadQr() {
    if (!url) return;

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(
      url,
    )}`;

    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = "public-profile-qr-code.png";
    link.click();
  }

  function printCard() {
    window.print();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={copyLink}
          disabled={!url}
          className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Copy Public Link
        </button>

        <button
          type="button"
          onClick={shareProfile}
          disabled={!url}
          className="rounded-xl border border-cyan-500/50 px-5 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Share Profile
        </button>

        <button
          type="button"
          onClick={downloadQr}
          disabled={!url}
          className="rounded-xl border border-teal-500/50 px-5 py-3 text-sm font-black text-teal-200 transition hover:bg-teal-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download QR
        </button>

        <button
          type="button"
          onClick={printCard}
          className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-black text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200"
        >
          Print Card
        </button>
      </div>

      {url && (
        <div className="rounded-3xl border border-cyan-500/30 bg-slate-950 p-5 text-center print:block">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
              url,
            )}`}
            alt="Public profile QR code"
            className="mx-auto h-52 w-52 rounded-2xl border border-slate-700 bg-white p-3"
          />

          {logoUrl && (
            <img
              src={logoUrl}
              alt={companyName || "Company logo"}
              className="mx-auto mt-4 max-h-16 max-w-[180px] object-contain"
            />
          )}

          <p className="mt-4 text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
            Scan to View
          </p>

          <h3 className="mt-2 text-xl font-black text-white">
            {companyName || "Inspector Portfolio"}
          </h3>

          <p className="mt-2 break-all text-xs text-slate-400">{url}</p>
        </div>
      )}
    </div>
  );
}