"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

type OverlayStyle = "inspected" | "just-inspected" | "under-contract" | "custom";

type MarketingImageStudioProps = {
  inspectorLogoUrl?: string | null;
  companyLogoUrl?: string | null;
  initialLogoUrl?: string | null;
};

type ReportOption = {
  id: string;
  label: string;
  address?: string | null;
};

type ReportPhoto = {
  id: string;
  url: string;
  label?: string | null;
};

const BRAND_TEAL = "#0f8f8f";

function cleanText(value: any) {
  return String(value || "").trim();
}

function fileNameFromAddress(address: string) {
  return (
    address
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "inspection-marketing-image"
  );
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("That file is not an image."));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

function downloadPng(canvas: HTMLCanvasElement, fileName: string) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function coverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
) {
  const imageRatio = image.width / image.height;
  const canvasRatio = width / height;

  let drawW = width;
  let drawH = height;
  let x = 0;
  let y = 0;

  if (imageRatio > canvasRatio) {
    drawH = height;
    drawW = height * imageRatio;
    x = (width - drawW) / 2;
  } else {
    drawW = width;
    drawH = width / imageRatio;
    y = (height - drawH) / 2;
  }

  ctx.drawImage(image, x, y, drawW, drawH);
}

function fitCanvasFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  min: number,
  scale: number
) {
  let size = start;
  while (size > min) {
    ctx.font = `900 ${size * scale}px Georgia, "Times New Roman", serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return min;
}

export default function MarketingImageStudio({
  inspectorLogoUrl,
  companyLogoUrl,
  initialLogoUrl,
}: MarketingImageStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const savedLogo = inspectorLogoUrl || companyLogoUrl || initialLogoUrl || "";

  const [reports, setReports] = useState<ReportOption[]>([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [reportPhotos, setReportPhotos] = useState<ReportPhoto[]>([]);
  const [selectedReportPhotoId, setSelectedReportPhotoId] = useState("");
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  const [photo, setPhoto] = useState("");
  const [logoOverride, setLogoOverride] = useState("");
  const [address, setAddress] = useState("");
  const [style, setStyle] = useState<OverlayStyle>("inspected");
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draggingPhoto, setDraggingPhoto] = useState(false);
  const [draggingLogo, setDraggingLogo] = useState(false);
  const [error, setError] = useState("");

  const activeLogo = logoOverride || savedLogo;

  const stampText =
    style === "custom"
      ? customText.trim() || "INSPECTED"
      : style === "under-contract"
        ? "UNDER CONTRACT"
        : style === "just-inspected"
          ? "JUST INSPECTED"
          : "INSPECTED";

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        setLoadingReports(true);
        setError("");

        const response = await fetch("/api/marketing-images/reports", {
          cache: "no-store",
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "Could not load reports.");
        }

        if (!cancelled) {
          setReports(Array.isArray(payload?.reports) ? payload.reports : []);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Could not load reports.");
      } finally {
        if (!cancelled) setLoadingReports(false);
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, []);

  async function selectReport(reportId: string) {
    setSelectedReportId(reportId);
    setReportPhotos([]);
    setSelectedReportPhotoId("");

    if (!reportId) return;

    try {
      setLoadingReport(true);
      setError("");

      const response = await fetch(`/api/marketing-images/reports/${encodeURIComponent(reportId)}`, {
        cache: "no-store",
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Could not load that report.");
      }

      const nextAddress = cleanText(payload?.address);
      const nextPhotos: ReportPhoto[] = Array.isArray(payload?.photos) ? payload.photos : [];

      setAddress(nextAddress);
      setReportPhotos(nextPhotos);

      if (nextPhotos[0]?.url) {
        setPhoto(nextPhotos[0].url);
        setSelectedReportPhotoId(nextPhotos[0].id);
      }
    } catch (err: any) {
      setError(err?.message || "Could not pull report address/photos.");
    } finally {
      setLoadingReport(false);
    }
  }

  function chooseReportPhoto(reportPhoto: ReportPhoto) {
    if (!reportPhoto.url) return;
    setPhoto(reportPhoto.url);
    setSelectedReportPhotoId(reportPhoto.id);
    setError("");
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError("");
      setSelectedReportPhotoId("");
      setPhoto(await readImage(file));
    } catch (err: any) {
      setError(err?.message || "Photo upload failed.");
    } finally {
      event.target.value = "";
    }
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError("");
      setLogoOverride(await readImage(file));
    } catch (err: any) {
      setError(err?.message || "Logo upload failed.");
    } finally {
      event.target.value = "";
    }
  }

  async function useDroppedImage(
    event: DragEvent<HTMLDivElement>,
    setter: (value: string) => void,
    setDragging: (value: boolean) => void,
    errorText: string,
    clearReportPhoto = false
  ) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    try {
      setError("");
      if (clearReportPhoto) setSelectedReportPhotoId("");
      setter(await readImage(file));
    } catch (err: any) {
      setError(err?.message || errorText);
    }
  }

  function allowDrop(event: DragEvent<HTMLDivElement>, setDragging: (value: boolean) => void) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(true);
  }

  function leaveDrop(event: DragEvent<HTMLDivElement>, setDragging: (value: boolean) => void) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
  }

  async function draw(scale = 1) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const width = 1080 * scale;
    const height = 1080 * scale;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, width, height);

    if (photo) {
      const image = await loadImage(photo);
      coverImage(ctx, image, width, height);
    }

    drawImageTone(ctx, width, height, scale);
    await drawLogo(ctx, width, scale);
    drawStamp(ctx, scale);
    drawAddress(ctx, width, height, scale);

    return canvas;
  }

  function drawImageTone(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number
  ) {
    const top = ctx.createLinearGradient(0, 0, 0, 260 * scale);
    top.addColorStop(0, "rgba(0,0,0,.16)");
    top.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, width, 270 * scale);

    const bottom = ctx.createLinearGradient(0, 680 * scale, 0, height);
    bottom.addColorStop(0, "rgba(0,0,0,0)");
    bottom.addColorStop(1, "rgba(0,0,0,.22)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 620 * scale, width, 460 * scale);
  }

  async function drawLogo(ctx: CanvasRenderingContext2D, width: number, scale: number) {
    const size = 214 * scale;
    const x = width - size - 38 * scale;
    const y = 24 * scale;
    const cx = x + size / 2;
    const cy = y + size / 2;

    ctx.save();

    ctx.shadowColor = BRAND_TEAL;
    ctx.shadowBlur = 28 * scale;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#050505";
    ctx.lineWidth = 7 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - 2 * scale, 0, Math.PI * 2);
    ctx.stroke();

    if (activeLogo) {
      try {
        const logo = await loadImage(activeLogo);
        const maxW = size * 0.84;
        const maxH = size * 0.84;
        const ratio = logo.width / logo.height;

        let drawW = maxW;
        let drawH = drawW / ratio;

        if (drawH > maxH) {
          drawH = maxH;
          drawW = drawH * ratio;
        }

        ctx.drawImage(logo, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
      } catch {
        drawFallbackLogo(ctx, cx, cy, scale);
      }
    } else {
      drawFallbackLogo(ctx, cx, cy, scale);
    }

    ctx.restore();
  }

  function drawFallbackLogo(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scale: number
  ) {
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 6 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(cx - 42 * scale, cy - 30 * scale);
    ctx.lineTo(cx, cy - 68 * scale);
    ctx.lineTo(cx + 42 * scale, cy - 30 * scale);
    ctx.moveTo(cx - 32 * scale, cy - 34 * scale);
    ctx.lineTo(cx - 32 * scale, cy + 22 * scale);
    ctx.lineTo(cx + 32 * scale, cy + 22 * scale);
    ctx.lineTo(cx + 32 * scale, cy - 34 * scale);
    ctx.stroke();

    ctx.strokeStyle = BRAND_TEAL;
    ctx.lineWidth = 10 * scale;
    ctx.beginPath();
    ctx.moveTo(cx - 18 * scale, cy - 7 * scale);
    ctx.lineTo(cx - 1 * scale, cy + 11 * scale);
    ctx.lineTo(cx + 45 * scale, cy - 48 * scale);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${24 * scale}px Arial, Helvetica, sans-serif`;
    ctx.fillText("ON POINT", cx, cy + 55 * scale);
    ctx.font = `700 ${12 * scale}px Arial, Helvetica, sans-serif`;
    ctx.fillText("HOME INSPECTIONS", cx, cy + 78 * scale);
    ctx.restore();
  }

  function drawStamp(ctx: CanvasRenderingContext2D, scale: number) {
    const stampW = 730 * scale;
    const stampH = 150 * scale;
    const x = 160 * scale;
    const y = 690 * scale;

    ctx.save();
    ctx.translate(x + stampW / 2, y + stampH / 2);
    ctx.rotate((-7 * Math.PI) / 180);
    ctx.translate(-stampW / 2, -stampH / 2);

    ctx.shadowColor = "rgba(0,0,0,.28)";
    ctx.shadowBlur = 22 * scale;
    ctx.shadowOffsetY = 10 * scale;

    roundRect(ctx, 0, 0, stampW, stampH, 14 * scale);
    ctx.fillStyle = "rgba(255,255,255,.74)";
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = BRAND_TEAL;
    ctx.lineWidth = 4 * scale;
    roundRect(ctx, 18 * scale, 18 * scale, stampW - 36 * scale, stampH - 36 * scale, 2 * scale);
    ctx.stroke();

    ctx.fillStyle = BRAND_TEAL;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const baseSize =
      stampText.length > 14
        ? 44
        : stampText.length > 11
          ? 52
          : stampText.length > 9
            ? 60
            : 68;

    const fontSize = fitCanvasFont(
      ctx,
      stampText.toUpperCase(),
      stampW - 70 * scale,
      baseSize,
      34,
      scale
    );

    ctx.font = `900 ${fontSize * scale}px Georgia, "Times New Roman", serif`;
    ctx.fillText(stampText.toUpperCase(), stampW / 2, stampH / 2 + 2 * scale);

    ctx.restore();
  }

  function drawAddress(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number
  ) {
    const barHeight = 104 * scale;
    const tealLine = 10 * scale;
    const y = height - barHeight - tealLine;

    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, y, width, barHeight);

    ctx.fillStyle = BRAND_TEAL;
    ctx.fillRect(0, height - tealLine, width, tealLine);

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255,255,255,.78)";
    ctx.shadowBlur = 7 * scale;

    const label = address.trim() || "Property Address";
    const fontSize = fitCanvasFont(ctx, label, width - 100 * scale, 50, 30, scale);

    ctx.font = `900 ${fontSize * scale}px Georgia, "Times New Roman", serif`;
    ctx.fillText(label, width / 2, y + barHeight / 2);

    ctx.restore();
  }

  async function preview() {
    try {
      setBusy(true);
      setError("");
      await draw(1);
    } catch {
      setError("Preview failed. Try another image.");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    try {
      setBusy(true);
      setError("");
      const canvas = await draw(2);
      if (!canvas) return;
      downloadPng(canvas, `${fileNameFromAddress(address)}.png`);
    } catch {
      setError("Download failed. Try another image.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      setBusy(true);
      setError("");
      const canvas = await draw(2);
      if (!canvas) return;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );

      if (!blob) return;

      const file = new File([blob], `${fileNameFromAddress(address)}.png`, {
        type: "image/png",
      });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: address || "Inspection marketing image",
          files: [file],
        });
      } else {
        downloadPng(canvas, `${fileNameFromAddress(address)}.png`);
      }
    } catch {
      setError("Share was cancelled or is not supported.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[390px_1fr]">
        <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-300">
            Marketing Studio
          </p>
          <h1 className="mt-2 text-2xl font-black">Inspection graphic</h1>
          <p className="mt-2 text-sm text-slate-300">
            Select a report to pull the property address and property photo.
          </p>

          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border border-teal-300/25 bg-teal-400/10 p-4">
              <label className="block">
                <span className="mb-2 block text-sm font-black text-teal-100">
                  Choose Report
                </span>
                <select
                  value={selectedReportId}
                  onChange={(event) => selectReport(event.target.value)}
                  disabled={loadingReports || loadingReport}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-teal-300 focus:ring-2 disabled:opacity-60"
                >
                  <option value="">
                    {loadingReports ? "Loading reports..." : "Select a report"}
                  </option>
                  {reports.map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.label}
                    </option>
                  ))}
                </select>
              </label>

              {loadingReport ? (
                <p className="mt-3 text-sm font-bold text-teal-100">
                  Pulling address and photos...
                </p>
              ) : null}

              {selectedReportId && reportPhotos.length ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wide text-teal-100">
                      Property Photo
                    </p>
                    <p className="rounded-full bg-teal-400/15 px-2 py-1 text-[10px] font-black text-teal-100">
                      Primary
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => chooseReportPhoto(reportPhotos[0])}
                    className="w-full overflow-hidden rounded-xl border-2 border-teal-300 bg-slate-950 text-left"
                  >
                    <div className="aspect-[16/9] bg-black">
                      <img
                        src={reportPhotos[0].url}
                        alt={reportPhotos[0].label || "Property photo"}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <p className="truncate px-3 py-2 text-xs font-bold text-slate-200">
                      {reportPhotos[0].label || "Primary Property Photo"}
                    </p>
                  </button>
                </div>
              ) : null}

              {selectedReportId && !loadingReport && !reportPhotos.length ? (
                <p className="mt-3 text-sm text-slate-300">
                  No property photo found for this report. You can still upload one below.
                </p>
              ) : null}
            </div>

            <div
              onDragOver={(event) => allowDrop(event, setDraggingPhoto)}
              onDragEnter={(event) => allowDrop(event, setDraggingPhoto)}
              onDragLeave={(event) => leaveDrop(event, setDraggingPhoto)}
              onDrop={(event) =>
                useDroppedImage(event, setPhoto, setDraggingPhoto, "Photo drop failed.", true)
              }
              className={
                draggingPhoto
                  ? "rounded-2xl border-2 border-dashed border-teal-300 bg-teal-400/10 p-4"
                  : "rounded-2xl border border-white/10 bg-slate-900 p-4"
              }
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">Upload Property Photo</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Optional. Drag and drop a photo here, or choose one.
                  </p>
                </div>
                {photo ? (
                  <span className="rounded-full bg-teal-400/15 px-3 py-1 text-xs font-bold text-teal-200">
                    Loaded
                  </span>
                ) : null}
              </div>

              <input
                type="file"
                accept="image/*,.heic,.heif,.webp,.png,.jpg,.jpeg,.gif,.bmp,.avif"
                onChange={uploadPhoto}
                className="block w-full cursor-pointer rounded-2xl border border-white/10 bg-slate-950 p-3 text-sm text-slate-200 file:mr-3 file:rounded-xl file:border-0 file:bg-teal-400 file:px-3 file:py-2 file:font-bold file:text-slate-950"
              />
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-bold">Address</span>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="125 Ashland Dr"
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none ring-teal-300 placeholder:text-slate-500 focus:ring-2"
              />
            </label>

            <div>
              <span className="mb-2 block text-sm font-bold">Overlay Style</span>
              <div className="grid grid-cols-2 gap-2">
                <OptionButton active={style === "inspected"} onClick={() => setStyle("inspected")}>
                  Inspected
                </OptionButton>
                <OptionButton active={style === "just-inspected"} onClick={() => setStyle("just-inspected")}>
                  Just Inspected
                </OptionButton>
                <OptionButton active={style === "under-contract"} onClick={() => setStyle("under-contract")}>
                  Under Contract
                </OptionButton>
                <OptionButton active={style === "custom"} onClick={() => setStyle("custom")}>
                  Custom
                </OptionButton>
              </div>
            </div>

            {style === "custom" ? (
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Custom Stamp</span>
                <input
                  value={customText}
                  onChange={(event) => setCustomText(event.target.value)}
                  placeholder="INSPECTED"
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none ring-teal-300 placeholder:text-slate-500 focus:ring-2"
                />
              </label>
            ) : null}

            <details className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <summary className="cursor-pointer text-sm font-bold">
                Logo override
              </summary>
              <div className="mt-4 space-y-3">
                <div
                  onDragOver={(event) => allowDrop(event, setDraggingLogo)}
                  onDragEnter={(event) => allowDrop(event, setDraggingLogo)}
                  onDragLeave={(event) => leaveDrop(event, setDraggingLogo)}
                  onDrop={(event) =>
                    useDroppedImage(event, setLogoOverride, setDraggingLogo, "Logo drop failed.")
                  }
                  className={
                    draggingLogo
                      ? "rounded-2xl border-2 border-dashed border-teal-300 bg-teal-400/10 p-3"
                      : "rounded-2xl border border-white/10 bg-slate-950 p-3"
                  }
                >
                  <p className="mb-2 text-xs font-bold text-slate-300">
                    Drop logo here or choose file
                  </p>
                  <input
                    type="file"
                    accept="image/*,.heic,.heif,.webp,.png,.jpg,.jpeg,.gif,.bmp,.avif,.svg"
                    onChange={uploadLogo}
                    className="block w-full cursor-pointer rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-slate-200 file:mr-3 file:rounded-xl file:border-0 file:bg-teal-400 file:px-3 file:py-2 file:font-bold file:text-slate-950"
                  />
                </div>
                {logoOverride ? (
                  <button
                    type="button"
                    onClick={() => setLogoOverride("")}
                    className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold hover:bg-white/10"
                  >
                    Clear override
                  </button>
                ) : null}
              </div>
            </details>

            {error ? (
              <p className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}

            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={preview}
                disabled={busy}
                className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black hover:bg-white/15 disabled:opacity-50"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={download}
                disabled={busy}
                className="rounded-2xl bg-teal-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-teal-300 disabled:opacity-50"
              >
                Download
              </button>
              <button
                type="button"
                onClick={share}
                disabled={busy}
                className="rounded-2xl border border-teal-300/40 px-4 py-3 text-sm font-black text-teal-200 hover:bg-teal-300/10 disabled:opacity-50"
              >
                Share
              </button>
            </div>
          </div>
        </aside>

        <main className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl sm:p-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Preview</h2>
              <p className="text-sm text-slate-300">
                Output matches the example: logo badge, angled stamp, black address bar.
              </p>
            </div>
            <button
              type="button"
              onClick={preview}
              disabled={busy}
              className="rounded-2xl border border-teal-300/40 px-4 py-2 text-sm font-bold text-teal-200 hover:bg-teal-300/10 disabled:opacity-50"
            >
              Refresh Preview
            </button>
          </div>

          <div
            onDragOver={(event) => allowDrop(event, setDraggingPhoto)}
            onDragEnter={(event) => allowDrop(event, setDraggingPhoto)}
            onDragLeave={(event) => leaveDrop(event, setDraggingPhoto)}
            onDrop={(event) =>
              useDroppedImage(event, setPhoto, setDraggingPhoto, "Photo drop failed.", true)
            }
            className={
              draggingPhoto
                ? "mx-auto aspect-square w-full max-w-[760px] overflow-hidden rounded-3xl border-2 border-dashed border-teal-300 bg-slate-900 shadow-2xl"
                : "mx-auto aspect-square w-full max-w-[760px] overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl"
            }
          >
            <canvas ref={canvasRef} className="h-full w-full" />
            {!photo ? (
              <div className="-mt-full flex aspect-square h-full w-full items-center justify-center p-8 text-center">
                <div>
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-teal-400/15 text-4xl">
                    🏠
                  </div>
                  <p className="text-lg font-black">Select a report photo or upload one</p>
                  <p className="mt-2 text-sm text-slate-300">
                    Choose a report from the dropdown, drag a photo here, or upload one.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-2xl border border-teal-300 bg-teal-400 px-3 py-3 text-sm font-black text-slate-950"
          : "rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold text-slate-200 hover:bg-white/10"
      }
    >
      {children}
    </button>
  );
}
