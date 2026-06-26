"use client";

type PublicProfileActionsProps = {
  profileUrl?: string;
  logoUrl?: string;
  companyName?: string;
};

const TEAL = "14b8a6";
const TEAL_HEX = "#14b8a6";
const FALLBACK_LOGO = "/logo.jpg?v=2";

function cleanText(value: any) {
  return String(value || "").trim();
}

function cleanFilename(value: string) {
  return String(value || "inspector-profile")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function getQrUrl(url: string, size = 900) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=16&color=${TEAL}&bgcolor=ffffff&data=${encodeURIComponent(
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

export default function PublicProfileActions({
  profileUrl,
  logoUrl,
  companyName,
}: PublicProfileActionsProps) {
  const url = cleanText(profileUrl);
  const name = cleanText(companyName) || "Inspector Portfolio";
  const centerLogo = cleanText(logoUrl) || FALLBACK_LOGO;
  const qrPreviewUrl = url ? getQrUrl(url, 720) : "";

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
          title: name,
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

  async function drawCardCanvas() {
    const width = 1200;
    const height = 1800;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx || !url) return null;

    const qrImage = await loadImage(getQrUrl(url, 1000));
    let logoImage: HTMLImageElement | null = null;

    try {
      logoImage = await loadImage(centerLogo);
    } catch {
      if (centerLogo !== FALLBACK_LOGO) {
        try {
          logoImage = await loadImage(FALLBACK_LOGO);
        } catch {
          logoImage = null;
        }
      }
    }

    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, width, height);

    const gradient = ctx.createRadialGradient(600, 480, 50, 600, 480, 760);
    gradient.addColorStop(0, "rgba(20,184,166,0.24)");
    gradient.addColorStop(1, "rgba(2,6,23,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.lineWidth = 5;
    roundedRect(ctx, 48, 40, width - 96, height - 80, 72);
    ctx.stroke();

    const qrBox = 960;
    const qrX = (width - qrBox) / 2;
    const qrY = 92;

    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, qrX, qrY, qrBox, qrBox, 70);
    ctx.fill();
    ctx.drawImage(qrImage, qrX + 50, qrY + 50, qrBox - 100, qrBox - 100);

    if (logoImage) {
      const logoBox = 210;
      const logoX = width / 2 - logoBox / 2;
      const logoY = qrY + qrBox / 2 - logoBox / 2;

      ctx.fillStyle = "#020617";
      roundedRect(ctx, logoX, logoY, logoBox, logoBox, 38);
      ctx.fill();

      ctx.strokeStyle = TEAL_HEX;
      ctx.lineWidth = 8;
      roundedRect(ctx, logoX, logoY, logoBox, logoBox, 38);
      ctx.stroke();

      const inner = logoBox - 34;
      const ratio = Math.min(inner / logoImage.naturalWidth, inner / logoImage.naturalHeight);
      const drawWidth = logoImage.naturalWidth * ratio;
      const drawHeight = logoImage.naturalHeight * ratio;
      ctx.drawImage(
        logoImage,
        logoX + logoBox / 2 - drawWidth / 2,
        logoY + logoBox / 2 - drawHeight / 2,
        drawWidth,
        drawHeight,
      );
    }

    ctx.textAlign = "center";
    ctx.fillStyle = TEAL_HEX;
    ctx.font = "900 44px Arial";
    ctx.letterSpacing = "8px";
    ctx.fillText("SCAN TO VIEW PROFILE", width / 2, 1225);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "400 42px Arial";
    ctx.fillText("Learn more and request an", width / 2, 1310);
    ctx.fillText("inspection.", width / 2, 1380);

    ctx.fillStyle = TEAL_HEX;
    ctx.fillRect(width / 2 - 84, 1460, 168, 6);

    ctx.fillStyle = "#64748b";
    ctx.font = "900 32px Arial";
    ctx.fillText("P O W E R E D   B Y", width / 2 - 120, 1570);
    ctx.fillStyle = TEAL_HEX;
    ctx.fillText("O N   P O I N T", width / 2 + 230, 1570);
    ctx.fillText("I N S P E C T", width / 2, 1640);

    return canvas;
  }

  async function downloadQr() {
    if (!url) return;

    try {
      const canvas = await drawCardCanvas();
      if (!canvas) return;

      const link = document.createElement("a");
      link.download = `${cleanFilename(name)}-profile-qr-card.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("QR card download failed:", error);
      alert("Unable to download the QR card right now.");
    }
  }

  async function printCard() {
    if (!url) return;

    try {
      const canvas = await drawCardCanvas();
      if (!canvas) return;
      const imageUrl = canvas.toDataURL("image/png");

      const printWindow = window.open("", "_blank", "width=900,height=1100");
      if (!printWindow) return;

      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <title>${name} QR Code</title>
            <style>
              body { margin: 0; padding: 24px; background: #ffffff; }
              img { display: block; max-width: 100%; width: 520px; margin: 0 auto; }
            </style>
          </head>
          <body>
            <img src="${imageUrl}" alt="${name} QR Code" />
            <script>window.onload = () => window.print();</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (error) {
      console.error("QR card print failed:", error);
      alert("Unable to print the QR card right now.");
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
    <section className="min-w-0 overflow-hidden rounded-3xl border border-teal-500/35 bg-[#020817] shadow-xl">
      <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
        <div className="min-w-0 p-4 sm:p-6">
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
            Share your permanent On Point Inspect profile QR code so clients and realtors can view your profile and request an inspection.
          </p>

          <div className="mt-5 min-w-0 rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="shrink-0 text-lg">🔗</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Profile Link
                </p>
                <p className="mt-2 break-all text-sm font-bold leading-6 text-white">
                  {url}
                </p>
              </div>
              <button
                type="button"
                onClick={copyLink}
                className="shrink-0 rounded-xl border border-teal-500/40 px-3 py-2 text-teal-300 transition hover:bg-teal-500/10"
                aria-label="Copy public profile link"
              >
                ⧉
              </button>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
              Great For
            </p>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                "Business Cards",
                "Report Covers",
                "Vehicle Magnets",
                "Open Houses",
                "Realtor Offices",
                "Yard Signs",
              ].map((badge) => (
                <span
                  key={badge}
                  className="min-w-0 rounded-2xl border border-teal-500/40 bg-teal-500/10 px-3 py-3 text-center text-xs font-black text-teal-100"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6 min-w-0 rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
              Downloads
            </p>
            <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={downloadQr}
                className="min-w-0 rounded-xl bg-teal-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-teal-400"
              >
                Download PNG
              </button>

              <button
                type="button"
                onClick={printCard}
                className="min-w-0 rounded-xl border border-teal-500/60 px-5 py-3 text-sm font-black text-teal-300 transition hover:bg-teal-500/10"
              >
                Print Card
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={copyLink}
              className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-black text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
            >
              Copy Public Link
            </button>

            <button
              type="button"
              onClick={shareProfile}
              className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-black text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
            >
              Share Profile
            </button>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center border-t border-slate-800 bg-[#050816]/70 p-4 sm:p-6 lg:border-l lg:border-t-0">
          <div className="w-full max-w-[220px] rounded-3xl border border-slate-700 bg-[#0b1220] p-4 text-center shadow-2xl shadow-black/30 sm:max-w-[260px]">
            <div className="relative rounded-3xl bg-white p-3">
              <img
                src={qrPreviewUrl}
                alt="Public profile QR code"
                className="block aspect-square h-auto w-full rounded-2xl object-contain"
              />

              {centerLogo && (
                <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-2xl border-4 border-teal-500 bg-[#020617] p-1.5 shadow-xl">
                  <img
                    src={centerLogo}
                    alt={`${name} logo`}
                    className="max-h-full max-w-full object-contain"
                    onError={(event) => {
                      if (event.currentTarget.src.includes(FALLBACK_LOGO)) {
                        event.currentTarget.style.display = "none";
                        return;
                      }
                      event.currentTarget.src = FALLBACK_LOGO;
                    }}
                  />
                </div>
              )}
            </div>

            <p className="mt-4 text-center text-xs font-black uppercase tracking-[0.22em] text-teal-300">
              Scan to View Profile
            </p>
            <p className="mt-1 text-center text-xs leading-5 text-slate-400">
              Learn more and request an inspection.
            </p>
            <p className="mt-4 text-center text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
              Powered by On Point Inspect
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
