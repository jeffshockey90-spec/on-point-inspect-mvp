"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type PublicProfileActionsProps = {
  profileUrl?: string;
  logoUrl?: string;
  companyName?: string;
  showPoweredBy?: boolean;
};

const TEAL = "#14b8a6";
const DARK = "var(--fl-ground)";

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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}


function addQrSource(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  try {
    const parsed = new URL(clean);
    if (!parsed.searchParams.has("source") && !parsed.searchParams.has("utm_source")) {
      parsed.searchParams.set("source", "qr");
    }
    return parsed.toString();
  } catch {
    const separator = clean.includes("?") ? "&" : "?";
    return `${clean}${separator}source=qr`;
  }
}

export default function PublicProfileActions({
  profileUrl,
  logoUrl,
  companyName = "Inspector Profile",
  showPoweredBy = true,
}: PublicProfileActionsProps) {
  const url = String(profileUrl || "").trim();
  const [svgMarkup, setSvgMarkup] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const fileBase = useMemo(() => cleanFilename(companyName), [companyName]);
  const centerLogo = String(logoUrl || "").trim();
  const hasCompanyLogo = centerLogo.length > 0;
  const qrValue = useMemo(() => addQrSource(url), [url]);

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

      if (!qrValue) return;

      try {
        const svg = await QRCode.toString(qrValue, {
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
  }, [qrValue]);

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

  async function downloadPng() {
    if (!svgMarkup || !url || !hasCompanyLogo) return;

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = svgToDataUrl(svgMarkup);

    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not prepare QR download."));
      });
    } catch (downloadError) {
      console.error(downloadError);
      setError("QR PNG could not be downloaded on this device.");
      return;
    }

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

          const padding = 26;
          const imageBox = boxSize - padding * 2;
          const ratio = Math.min(
            imageBox / logo.naturalWidth,
            imageBox / logo.naturalHeight,
          );
          const drawWidth = logo.naturalWidth * ratio;
          const drawHeight = logo.naturalHeight * ratio;

          ctx.drawImage(
            logo,
            boxX + boxSize / 2 - drawWidth / 2,
            boxY + boxSize / 2 - drawHeight / 2,
            drawWidth,
            drawHeight,
          );
        }
      } catch {
        // If the logo is blocked by CORS, keep the QR download working.
      }
    }

    const link = document.createElement("a");
    link.download = `${fileBase}-profile-qr.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function printQrCard() {
    if (!svgMarkup || !url || !hasCompanyLogo) return;

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
            body { margin: 0; padding: 40px; background: var(--fl-ground); color: white; font-family: Arial, sans-serif; }
            .card { max-width: 430px; margin: 0 auto; border: 1px solid #334155; border-radius: 28px; padding: 24px; text-align: center; background: var(--fl-surface); }
            .qr-wrap { position: relative; width: 300px; max-width: 100%; margin: 0 auto; border-radius: 24px; background: white; padding: 14px; }
            .qr-wrap svg { display: block; width: 100%; height: auto; }
            .logo-wrap { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 68px; height: 68px; border-radius: 16px; background: var(--fl-ground); border: 3px solid ${TEAL}; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 8px; }
            .logo-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
            h1 { color: ${TEAL}; font-size: 18px; letter-spacing: .22em; text-transform: uppercase; margin: 18px 0 6px; }
            p { color: #cbd5e1; font-size: 14px; line-height: 1.5; }
            .powered { color: #64748b; font-size: 11px; font-weight: 900; letter-spacing: .26em; text-transform: uppercase; margin-top: 22px; }
            @media print { body { background: white; } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="qr-wrap">${svgMarkup}${logoHtml}</div>
            <h1>Scan to View Profile</h1>
            <p>Learn more and request an inspection.</p>
            ${showPoweredBy ? '<div class="powered">Powered by FLOW</div>' : ""}
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  if (!url) {
    return (
      <div className="w-full max-w-full rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-5 text-sm leading-6 text-[var(--fl-muted)]">
        Save your profile slug first. Your personalized QR code will appear here automatically.
      </div>
    );
  }

  return (
    <section className="w-full max-w-full overflow-hidden rounded-2xl border border-teal-500/35 bg-[var(--fl-ground)] shadow-xl">
      <div className="grid w-full min-w-0 gap-0">
        <div className="min-w-0 p-4 sm:p-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-accent-text)]">
              Marketing Kit
            </p>
            <span className="rounded-full border border-purple-400/50 bg-purple-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fl-purple-text)]">
              Personalized QR
            </span>
          </div>

          <h2 className="mt-3 break-words text-2xl font-semibold text-[var(--fl-text)]">
            Your Profile QR Code
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fl-muted)]">
            Share your permanent FLOW profile QR code so clients and realtors can view your profile and request an inspection.
          </p>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
              Great For
            </p>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              {usageBadges.map((badge) => (
                <span
                  key={badge}
                  className="min-w-0 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-center text-xs font-semibold text-teal-100"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-[var(--fl-crit-text)]">
              {error}
            </p>
          )}

          {!hasCompanyLogo && (
            <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm font-bold text-[var(--fl-warn-text)]">
                Upload your company logo to create a branded QR code.
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--fl-warn-text)]/80">
                Download and print are disabled until a company logo is uploaded.
              </p>
            </div>
          )}

          <div className="mt-6 w-full overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fl-accent-text)]">
              Downloads
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={downloadPng}
                disabled={!ready || !hasCompanyLogo}
                className="block w-full max-w-full rounded-xl bg-teal-500 px-4 py-3 text-center text-sm font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
              >
                Download PNG
              </button>

              <button
                type="button"
                onClick={printQrCard}
                disabled={!ready || !hasCompanyLogo}
                className="block w-full max-w-full rounded-xl border border-teal-500/60 px-4 py-3 text-center text-sm font-semibold text-[var(--fl-accent-text)] transition active:scale-[0.98] hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
              >
                Print Card
              </button>

              <button
                type="button"
                onClick={copyLink}
                className="block w-full max-w-full rounded-xl border border-[var(--fl-line)] px-4 py-3 text-center text-sm font-semibold text-[var(--fl-text)] transition active:scale-[0.98] hover:border-cyan-400 hover:text-[var(--fl-info-text)] [touch-action:manipulation]"
              >
                Copy Public Link
              </button>

              <button
                type="button"
                onClick={shareProfile}
                className="block w-full max-w-full rounded-xl border border-[var(--fl-line)] px-4 py-3 text-center text-sm font-semibold text-[var(--fl-text)] transition active:scale-[0.98] hover:border-cyan-400 hover:text-[var(--fl-info-text)] [touch-action:manipulation]"
              >
                Share Profile
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center border-t border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4 sm:p-6">
          <div className="w-full max-w-[240px] rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-4 text-center shadow-2xl shadow-black/30">
            <div className="relative rounded-2xl bg-white p-3">
              {svgMarkup ? (
                <div
                  className="block h-auto w-full overflow-hidden rounded-2xl [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: svgMarkup }}
                />
              ) : (
                <div className="aspect-square w-full rounded-2xl bg-white" />
              )}

              {hasCompanyLogo ? (
                <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-2xl border-4 border-teal-500 bg-[var(--fl-ground)] p-2 shadow-xl">
                  <img
                    src={centerLogo}
                    alt={`${companyName} logo`}
                    className="max-h-full max-w-full object-contain"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              ) : (
                <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border-4 border-amber-500 bg-[var(--fl-ground)] p-2 text-center shadow-xl">
                  <span className="text-[9px] font-semibold uppercase leading-tight text-[var(--fl-warn-text)]">
                    Upload
                    <br />
                    Logo
                  </span>
                </div>
              )}
            </div>

            {!ready && !error && (
              <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                Generating QR...
              </p>
            )}

            <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fl-accent-text)]">
              Scan to View Profile
            </p>
            <p className="mt-1 text-center text-xs leading-5 text-[var(--fl-muted)]">
              Learn more and request an inspection.
            </p>

            {!hasCompanyLogo && (
              <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-xs font-bold text-[var(--fl-warn-text)]">
                  Upload company logo to brand this QR.
                </p>
              </div>
            )}

            {showPoweredBy && (
              <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--fl-faint)]">
                Powered by FLOW
              </p>
            )}
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
