"use client";

import { useMemo, useState } from "react";

type PublicProfileActionsProps = {
  profileUrl?: string;
  logoUrl?: string;
  companyName?: string;
};

const TEAL = "14b8a6";
const TEAL_HEX = "#14b8a6";
const DARK = "#020617";
const CARD_BG = "#0b1220";
const FALLBACK_LOGO = "/logo.jpg?v=2";

function cleanFilename(value: string) {
  return String(value || "inspector-profile")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function getQrImageUrl(url: string, size = 900) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=16&color=${TEAL}&bgcolor=ffffff&ecc=H&data=${encodeURIComponent(
    url,
  )}`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) ctx.fillText(line, x, y);
}

export default function PublicProfileActions({
  profileUrl,
  logoUrl,
  companyName,
}: PublicProfileActionsProps) {
  const [status, setStatus] = useState("");

  const url = String(profileUrl || "").trim();
  const company = String(companyName || "Inspector Profile").trim();
  const centerLogo = String(logoUrl || FALLBACK_LOGO).trim();
  const fileBase = useMemo(() => cleanFilename(company), [company]);
  const qrUrl = url ? getQrImageUrl(url, 900) : "";

  async function copyLink() {
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setStatus("Public profile link copied.");
    } catch {
      setStatus("Unable to copy link.");
    }
  }

  async function shareProfile() {
    if (!url) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: company,
          text: "View my public inspection portfolio.",
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      setStatus("Public profile link copied.");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setStatus("Public profile link copied.");
      } catch {
        setStatus("Unable to share profile.");
      }
    }
  }

  async function drawQrCardCanvas() {
    if (!url) return null;

    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1280;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createRadialGradient(450, 260, 80, 450, 260, 580);
    gradient.addColorStop(0, "rgba(20,184,166,0.24)");
    gradient.addColorStop(0.48, "rgba(15,23,42,0.95)");
    gradient.addColorStop(1, "rgba(2,6,23,1)");
    ctx.fillStyle = gradient;
    roundedRect(ctx, 32, 32, 836, 1216, 48);
    ctx.fill();

    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.lineWidth = 3;
    roundedRect(ctx, 32, 32, 836, 1216, 48);
    ctx.stroke();

    const qrImage = await loadImage(getQrImageUrl(url, 1200));
    const qrX = 112;
    const qrY = 86;
    const qrSize = 676;

    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, qrX, qrY, qrSize, qrSize, 34);
    ctx.fill();
    ctx.drawImage(qrImage, qrX + 28, qrY + 28, qrSize - 56, qrSize - 56);

    try {
      const logo = await loadImage(centerLogo);
      const logoBox = 150;
      const logoX = qrX + qrSize / 2 - logoBox / 2;
      const logoY = qrY + qrSize / 2 - logoBox / 2;

      ctx.fillStyle = "#020617";
      roundedRect(ctx, logoX, logoY, logoBox, logoBox, 32);
      ctx.fill();

      ctx.shadowColor = "rgba(20,184,166,0.55)";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "rgba(20,184,166,0.85)";
      ctx.lineWidth = 4;
      roundedRect(ctx, logoX, logoY, logoBox, logoBox, 32);
      ctx.stroke();
      ctx.shadowBlur = 0;

      const padding = 12;
      const logoArea = logoBox - padding * 2;
      const ratio = Math.min(logoArea / logo.naturalWidth, logoArea / logo.naturalHeight);
      const drawWidth = logo.naturalWidth * ratio;
      const drawHeight = logo.naturalHeight * ratio;

      ctx.drawImage(
        logo,
        logoX + logoBox / 2 - drawWidth / 2,
        logoY + logoBox / 2 - drawHeight / 2,
        drawWidth,
        drawHeight,
      );
    } catch {
      // If the logo image has CORS restrictions, still download a working QR card.
    }

    ctx.fillStyle = TEAL_HEX;
    ctx.font = "900 34px Arial";
    ctx.textAlign = "center";
    ctx.letterSpacing = "8px" as any;
    ctx.fillText("SCAN TO VIEW PROFILE", 450, 850);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "400 28px Arial";
    drawWrappedText(ctx, "Learn more and request an inspection.", 450, 908, 650, 38);

    ctx.strokeStyle = TEAL_HEX;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(392, 1002);
    ctx.lineTo(508, 1002);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "900 23px Arial";
    ctx.fillText("POWERED BY", 330, 1096);
    ctx.fillStyle = TEAL_HEX;
    ctx.fillText("ON POINT", 540, 1096);
    ctx.fillText("INSPECT", 450, 1144);

    return canvas;
  }

  async function downloadQr() {
    if (!url) return;

    try {
      const canvas = await drawQrCardCanvas();
      if (!canvas) return;

      const link = document.createElement("a");
      link.download = `${fileBase}-profile-qr-card.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("QR download failed:", error);
      setStatus("Unable to download QR card. Try opening the profile again.");
    }
  }

  async function printCard() {
    if (!url) return;

    try {
      const canvas = await drawQrCardCanvas();
      if (!canvas) return;

      const imageUrl = canvas.toDataURL("image/png");
      const printWindow = window.open("", "_blank", "width=900,height=1100");
      if (!printWindow) return;

      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <title>${company} QR Card</title>
            <style>
              body { margin: 0; padding: 24px; background: #ffffff; text-align: center; }
              img { max-width: 100%; height: auto; }
            </style>
          </head>
          <body>
            <img src="${imageUrl}" alt="${company} QR card" />
            <script>window.onload = () => window.print();</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (error) {
      console.error("QR print failed:", error);
      setStatus("Unable to print QR card. Try downloading it instead.");
    }
  }

  if (!url) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-950 p-5 text-sm leading-6 text-slate-400">
        Save your profile slug first. Your personalized QR code will appear here automatically.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-700 bg-[#020817] shadow-2xl shadow-black/30">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-300">
              Marketing Kit
            </p>
            <span className="rounded-full border border-purple-400/50 bg-purple-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-purple-200">
              Personalized QR
            </span>
          </div>

          <h2 className="mt-4 text-2xl font-black text-white sm:text-3xl">
            Your Profile QR Code
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Share your permanent On Point Inspect profile QR code so clients and realtors can view your profile and request an inspection.
          </p>

          <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-1 text-lg text-teal-300">🔗</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wide text-teal-300">
                  Profile Link
                </p>
                <p className="mt-2 break-all text-sm font-bold text-white">
                  {url}
                </p>
              </div>
              <button
                type="button"
                onClick={copyLink}
                className="rounded-lg border border-teal-500/40 px-2 py-1 text-teal-300 transition hover:bg-teal-500/10"
                aria-label="Copy profile link"
              >
                ⧉
              </button>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-300">
              Great For
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {["Business Cards", "Report Covers", "Vehicle Magnets", "Open Houses", "Realtor Offices", "Yard Signs"].map((badge) => (
                <span
                  key={badge}
                  className="rounded-xl border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-center text-xs font-black text-teal-100"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-300">
              Downloads
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={downloadQr}
                className="rounded-xl bg-teal-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-400"
              >
                Download PNG
              </button>

              <button
                type="button"
                onClick={printCard}
                className="rounded-xl border border-teal-500/60 px-5 py-3 text-sm font-black text-teal-300 transition hover:bg-teal-500/10"
              >
                Print Card
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={copyLink}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
            >
              Copy Public Link
            </button>
            <button
              type="button"
              onClick={shareProfile}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-black text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
            >
              Share Profile
            </button>
          </div>

          {status && (
            <p className="mt-4 rounded-xl border border-teal-500/30 bg-teal-500/10 p-3 text-sm font-bold text-teal-200">
              {status}
            </p>
          )}
        </div>

        <div className="flex items-center justify-center border-t border-slate-800 bg-[#050816]/70 p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div className="w-full max-w-[230px] rounded-[1.7rem] border border-slate-700 bg-[#0b1220] p-4 text-center shadow-2xl shadow-black/40">
            <div className="relative rounded-[1.35rem] bg-white p-3 shadow-[0_0_28px_rgba(20,184,166,0.12)]">
              <img
                src={getQrImageUrl(url, 650)}
                alt="Public profile QR code"
                className="block aspect-square w-full rounded-xl object-contain"
              />

              <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-xl border-2 border-teal-500 bg-[#020617] p-1 shadow-xl shadow-teal-500/20 sm:h-16 sm:w-16">
                <img
                  src={centerLogo}
                  alt={`${company} logo`}
                  className="h-full w-full object-contain"
                  onError={(event) => {
                    event.currentTarget.src = FALLBACK_LOGO;
                  }}
                />
              </div>
            </div>

            <p className="mt-4 text-[11px] font-black uppercase tracking-[0.22em] text-teal-300">
              Scan to View Profile
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              Learn more and request an inspection.
            </p>
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
              Powered by On Point Inspect
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
