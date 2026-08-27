"use client";

import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type GalleryImage = {
  src: string;
  fullSrc?: string;
  alt?: string;
};

type Props = {
  src: string;
  fullSrc?: string;
  alt?: string;
  className?: string;
  buttonClassName?: string;
  badgeText?: string;
  // Sibling images belonging to the same finding, so the expanded viewer
  // can flip between all of them instead of only showing this one photo.
  // If omitted (or has 1 or fewer entries), behaves as a single image.
  images?: GalleryImage[];
  index?: number;
};

function ExpandableReportImage({
  src,
  fullSrc,
  alt = "Report image",
  className = "max-h-[260px] w-full object-cover",
  buttonClassName =
    "block w-full overflow-hidden rounded-xl border border-[var(--fl-line)] bg-black text-left focus:outline-none focus:ring-2 focus:ring-cyan-300",
  badgeText = "Tap to enlarge",
  images,
  index = 0,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(index);
  const fullImageUrl = fullSrc || src;

  const gallery = images && images.length > 1 ? images : null;
  const galleryCount = gallery?.length ?? 0;
  const activeImage = gallery ? gallery[activeIndex] : null;
  const displaySrc = activeImage ? activeImage.fullSrc || activeImage.src : fullImageUrl;
  const displayAlt = activeImage?.alt || alt;

  useEffect(() => {
    if (expanded) setActiveIndex(index);
  }, [expanded, index]);

  useEffect(() => {
    if (!expanded) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    const goPrev = () => {
      if (!gallery) return;
      setActiveIndex((current) => (current - 1 + galleryCount) % galleryCount);
    };

    const goNext = () => {
      if (!gallery) return;
      setActiveIndex((current) => (current + 1) % galleryCount);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded, gallery, galleryCount]);

  if (!src) return null;

  const modal =
    expanded && typeof document !== "undefined"
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={displayAlt}
            className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/95 p-4"
            onClick={() => setExpanded(false)}
          >
            <button
              type="button"
              aria-label="Close expanded image"
              className="fixed right-4 top-4 z-[2147483647] min-h-12 rounded-full border border-white/30 bg-black/90 px-4 py-2 text-sm font-semibold text-[var(--fl-text)] shadow-xl active:scale-[0.98] active:opacity-80 [touch-action:manipulation]"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(false);
              }}
            >
              Close ✕
            </button>

            {gallery && (
              <span className="fixed left-1/2 top-4 z-[2147483647] -translate-x-1/2 rounded-full border border-white/30 bg-black/90 px-4 py-2 text-sm font-semibold text-[var(--fl-text)] shadow-xl">
                {activeIndex + 1} / {galleryCount}
              </span>
            )}

            {gallery && (
              <button
                type="button"
                aria-label="Previous photo"
                className="fixed left-2 top-1/2 z-[2147483647] min-h-12 min-w-12 -translate-y-1/2 rounded-full border border-white/30 bg-black/90 px-4 py-3 text-xl font-semibold text-[var(--fl-text)] shadow-xl active:scale-[0.98] active:opacity-80 [touch-action:manipulation] sm:left-4"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex((current) => (current - 1 + galleryCount) % galleryCount);
                }}
              >
                ‹
              </button>
            )}

            {gallery && (
              <button
                type="button"
                aria-label="Next photo"
                className="fixed right-2 top-1/2 z-[2147483647] min-h-12 min-w-12 -translate-y-1/2 rounded-full border border-white/30 bg-black/90 px-4 py-3 text-xl font-semibold text-[var(--fl-text)] shadow-xl active:scale-[0.98] active:opacity-80 [touch-action:manipulation] sm:right-4"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex((current) => (current + 1) % galleryCount);
                }}
              >
                ›
              </button>
            )}

            <img
              src={displaySrc}
              alt={displayAlt}
              decoding="async"
              className="max-h-[92vh] max-w-[96vw] rounded-2xl border border-[var(--fl-line)] bg-black object-contain shadow-2xl"
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
        />

        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-white/30 bg-black/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-text)]">
          {gallery ? `${badgeText} • ${galleryCount} photos` : badgeText}
        </span>
      </button>

      {modal}
    </>
  );
}

export default memo(ExpandableReportImage);
