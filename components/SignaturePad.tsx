"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Smooth, high-DPI signature canvas. Unified pointer events cover finger, stylus,
 * and mouse; strokes are drawn with quadratic-midpoint smoothing for a natural
 * line. Emits a PNG data URL via onChange (empty string when cleared), which the
 * agreement pipeline already renders as an image signature.
 */
export default function SignaturePad({
  onChange,
  disabled = false,
  penColor = "#0f172a",
}: {
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  penColor?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const midRef = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Size the canvas to its container at device-pixel resolution so lines are
  // crisp and coordinates map 1:1 to CSS pixels.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2.5;
    ctxRef.current = ctx;
  }, [penColor]);

  useEffect(() => {
    setupCanvas();

    // Re-fit on container resize (e.g. rotation). Clearing on resize keeps the
    // math simple; signing is quick, so mid-signature rotations are rare.
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        const hadDrawing = !isEmpty;
        setupCanvas();
        if (hadDrawing) {
          setIsEmpty(true);
          onChange("");
        }
      });
    });
    if (wrapRef.current) observer.observe(wrapRef.current);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupCanvas]);

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    const point = pointFromEvent(event);
    lastRef.current = point;
    midRef.current = point;

    // Dot for a tap (so a quick tap still leaves a mark).
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = penColor;
      ctx.fill();
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    event.preventDefault();
    const ctx = ctxRef.current;
    const last = lastRef.current;
    const prevMid = midRef.current;
    if (!ctx || !last || !prevMid) return;

    const point = pointFromEvent(event);
    const mid = { x: (last.x + point.x) / 2, y: (last.y + point.y) / 2 };

    // Quadratic curve through the previous point gives a smooth, natural line.
    ctx.beginPath();
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
    ctx.stroke();

    lastRef.current = point;
    midRef.current = mid;

    if (isEmpty) setIsEmpty(false);
  }

  function endStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    midRef.current = null;
    const canvas = canvasRef.current;
    if (canvas && !isEmpty) onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onChange("");
  }

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative h-44 w-full overflow-hidden rounded-xl border border-[var(--fl-line)] bg-white"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ cursor: disabled ? "not-allowed" : "crosshair" }}
        />

        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="select-none text-sm font-semibold text-[var(--fl-muted)]">
              Sign here with your finger or mouse
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-3 left-4 right-4 border-b border-dashed border-slate-300" />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-[var(--fl-muted)]">Draw your signature above.</p>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || isEmpty}
          className="rounded-lg border border-[var(--fl-line)] px-3 py-1.5 text-xs font-bold text-[var(--fl-muted)] transition hover:bg-[var(--fl-raised)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
