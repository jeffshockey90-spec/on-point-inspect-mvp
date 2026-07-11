"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  src: string;
  fullSrc?: string;
  alt?: string;
  className?: string;
  buttonClassName?: string;
  badgeText?: string;
};

export default function ExpandableReportImage({
  src,
  fullSrc,
  alt = "Report image",
  className = "max-h-[260px] w-full object-cover",
  buttonClassName =
    "block w-full overflow-hidden rounded-xl border border-slate-700 bg-black text-left focus:outline-none focus:ring-2 focus:ring-cyan-300",
  badgeText = "Tap to enlarge",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fullImageUrl = fullSrc || src;

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!expanded) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  if (!src) return null;

  const modal =
    expanded && mounted
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/95 p-4"
            onClick={() => setExpanded(false)}
          >
            <button
              type="button"
              aria-label="Close expanded image"
              className="fixed right-4 top-4 z-[2147483647] min-h-12 rounded-full border border-white/30 bg-black/90 px-4 py-2 text-sm font-black text-white shadow-xl active:scale-[0.98] active:opacity-80 [touch-action:manipulation]"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(false);
              }}
            >
              Close ✕
            </button>

            <img
              src={fullImageUrl}
              alt={alt}
              decoding="async"
              className="max-h-[92vh] max-w-[96vw] rounded-2xl border border-slate-600 bg-black object-contain shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setExpanded(true);
        }}
        className={`group relative ${buttonClassName}`}
        title={badgeText}
        data-fast-click="true"
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          draggable={false}
          className={className}
          style={{ contentVisibility: "auto", containIntrinsicSize: "260px" }}
        />

        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-white/30 bg-black/70 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white">
          {badgeText}
        </span>
      </button>

      {modal}
    </>
  );
}
