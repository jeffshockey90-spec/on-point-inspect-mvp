"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type PublicProfileQrCodeProps = {
  profileUrl: string;
  logoUrl?: string;
  companyName?: string;
};

const TEAL = "#14b8a6";
const DARK = "#020617";
const FALLBACK_LOGO = "/logo.jpg?v=2";

function cleanFilename(value: string) {
  return String(value || "inspector-profile")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function PublicProfileQrCode({
  profileUrl,
  logoUrl,
  companyName = "Inspector Profile",
}: PublicProfileQrCodeProps) {
  const [svgMarkup, setSvgMarkup] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const fileBase = useMemo(() => cleanFilename(companyName), [companyName]);
  const centerLogo = String(logoUrl || FALLBACK_LOGO).trim();

  const usageBadges = [
    "Business Cards",
    "Report Covers",
    "Vehicle Magnets",
    "Open Houses",
    "Realtor Offices",
    "Yard Signs",
  ];

  useEffect(() => {
    let cancelled = false;

    async function buildQr() {
      setReady(false);
      setError("");
      setSvgMarkup("");

      if (!profileUrl) return;

      try {
        const svg = await QRCode.toString(profileUrl, {
          type: "svg",
          width: 420,
          margin: 2,
          errorCorrectionLevel: "H",
          color: {
            dark: TEAL,
            light: "#ffffff",
          },
        });

        if (!cancelled) {
          setSvgMarkup(svg);
          setReady(true);
        }
      } catch (qrError) {
        console.error("Public profile QR generation failed:", qrError);
        if (!cancelled) {
          setError("QR code could not be generated on this device.");
        }
      }
    }

    buildQr();

    return () => {
      cancelled = true;
    };
  }, [profileUrl]);

  async function downloadPng() {
    if (!svgMarkup || !profileUrl) return;

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = svgToDataUrl(svgMarkup);

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not prepare QR download."));
    }).catch((downloadError) => {
      console.error(downloadError);
      setError("QR PNG could not be downloaded on this device.");
    });

    if (!image.complete || image.naturalWidth === 0) return;

    const size = 900;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);

    // Try to add the center logo to downloads. If the logo is blocked by CORS,
    // skip it so the QR download still works.
    if (centerLogo) {
      try {
        const logo = new Image();
        logo.crossOrigin = "anonymous";
        logo.referrerPolicy = "no-referrer";
        logo.src = centerLogo;

        await new Promise<void>((resolve) => {
          logo.onload = () => resolve();
          logo.onerror = () => resolve();
        });

        if (logo.complete && logo.naturalWidth > 0) {
          const boxSize = 190;
          const boxX = size / 2 - boxSize / 2;
          const boxY = size / 2 - boxSize / 2;

          ctx.fillStyle = DARK;
          roundedRect(ctx, boxX, boxY, boxSize, boxSize, 34);
          ctx.fill();

          ctx.strokeStyle = TEAL;
          ctx.lineWidth = 8;
          roundedRect(ctx, boxX, boxY, boxSize, boxSize, 34);
          ctx.stroke();

          const padding = 28;
          const imageBox = boxSize - padding * 2;
          const ratio = Math.min(imageBox / logo.naturalWidth, imageBox / logo.naturalHeight);
          const drawWidth = logo.naturalWidth * ratio;
          const drawHeight = logo.naturalHeight * ratio;
          ctx.drawImage(
            logo,
            boxX + boxSize / 2 - drawWidth / 2,
            boxY + boxSize / 2 - drawHeight / 2,
            drawWidth,
            drawHeight
          );
        }
      } catch {}
    }

    const link = document.createElement("a");
    link.download = `${fileBase}-profile-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function printQrCard() {
    if (!svgMarkup || !profileUrl) return;

    const qrSvg = svgMarkup;
    const logoHtml = centerLogo
      ? `<div class="logo-wrap"><img src="${escapeHtml(centerLogo)}" alt="Logo" /></div>`
      : "";

    const printWindow = window.open("", "_blank", "width=900,height=1100");
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(companyName)} QR Code</title>
          <style>
            body { margin: 0; padding: 40px; background: #020617; color: white; font-family: Arial, sans-serif; }
            .card { max-width: 620px; margin: 0 auto; border: 2px solid ${TEAL}; border-radius: 28px; padding: 34px; text-align: center; background: #0b1220; }
            .eyebrow { color: ${TEAL}; font-size: 13px; font-weight: 900; letter-spacing: .22em; text-transform: uppercase; }
            h1 { margin: 12px 0 8px; font-size: 34px; line-height: 1.1; }
            p { color: #cbd5e1; font-size: 18px; line-height: 1.5; }
            .qr-wrap { position: relative; width: 360px; max-width: 100%; margin: 18px auto; border-radius: 24px; background: white; padding: 14px; }
            .qr-wrap svg { display: block; width: 100%; height: auto; }
            .logo-wrap { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 78px; height: 78px; border-radius: 18px; background: #020617; border: 4px solid ${TEAL}; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 10px; }
            .logo-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
            .url { color: ${TEAL}; word-break: break-all; font-weight: 800; }
            @media print { body { background: white; } .card { color: #020617; background: white; } h1 { color: #020617; } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="eyebrow">FLOW</div>
            <h1>${escapeHtml(companyName)}</h1>
            <p>Scan to view my inspector profile and request an inspection.</p>
            <div class="qr-wrap">${qrSvg}${logoHtml}</div>
            <p class="url">${escapeHtml(profileUrl)}</p>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  if (!profileUrl) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-950 p-5 text-sm leading-6 text-slate-400">
        Save your profile slug first. Your personalized QR code will appear here automatically.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-teal-500/35 bg-[#020817] shadow-xl">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
              Marketing Kit
            </p>
            <span className="rounded-full border border-purple-400/50 bg-purple-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-purple-200">
              Personalized QR
            </span>
          </div>

          <h2 className="mt-3 text-2xl font-black text-white">
            Your Profile QR Code
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Share your permanent FLOW profile QR code so clients and realtors can view your profile and request an inspection.
          </p>

          <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Profile Link
            </p>
            <p className="mt-2 break-all text-sm font-bold text-white">
              {profileUrl}
            </p>
          </div>

          <div className="mt-5">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Great For
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {usageBadges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs font-black text-teal-200"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm font-bold text-red-300">
              {error}
            </p>
          )}

          <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Downloads
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={downloadPng}
                disabled={!ready}
                className="inline-flex w-full items-center justify-center rounded-xl bg-teal-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Download PNG
              </button>

              <button
                type="button"
                onClick={printQrCard}
                disabled={!ready}
                className="inline-flex w-full items-center justify-center rounded-xl border border-teal-500/60 px-5 py-3 text-sm font-black text-teal-300 transition hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Print Card
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center border-t border-slate-800 bg-[#050816]/70 p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div className="w-full max-w-[240px] rounded-3xl border border-slate-700 bg-[#0b1220] p-4 text-center shadow-2xl shadow-black/30">
            <div className="relative rounded-3xl bg-white p-3">
              {svgMarkup ? (
                <div
                  className="block h-auto w-full overflow-hidden rounded-2xl [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: svgMarkup }}
                />
              ) : (
                <div className="aspect-square w-full rounded-2xl bg-white" />
              )}

              {centerLogo && (
                <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-2xl border-4 border-teal-500 bg-[#020617] p-2 shadow-xl">
                  <img
                    src={centerLogo}
                    alt={`${companyName} logo`}
                    className="max-h-full max-w-full object-contain"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              )}
            </div>

            {!ready && !error && (
              <p className="mt-3 text-center text-xs font-black uppercase tracking-wide text-slate-500">
                Generating QR...
              </p>
            )}

            <p className="mt-4 text-center text-xs font-black uppercase tracking-[0.18em] text-teal-300">
              Scan to View Profile
            </p>
            <p className="mt-1 text-center text-xs leading-5 text-slate-400">
              Learn more and request an inspection.
            </p>
            <p className="mt-4 text-center text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
              Powered by FLOW
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
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
