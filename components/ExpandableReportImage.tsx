"use client";

import { useState } from "react";

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
  buttonClassName = "block w-full overflow-hidden rounded-xl border border-slate-700 bg-black text-left focus:outline-none focus:ring-2 focus:ring-cyan-300",
  badgeText = "Tap to enlarge",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const fullImageUrl = fullSrc || src;

  if (!src) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`group relative ${buttonClassName}`}
        title={badgeText}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className={`${className} transition duration-200 group-hover:scale-[1.02]`}
        />
        <span className="absolute bottom-2 right-2 rounded-full border border-white/30 bg-black/70 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white shadow-xl">
          {badgeText}
        </span>
      </button>

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        >
          <button
            type="button"
            aria-label="Close expanded image"
            className="absolute right-4 top-4 rounded-full border border-white/30 bg-black/80 px-4 py-2 text-sm font-black text-white shadow-xl"
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
            className="max-h-[88vh] max-w-[94vw] rounded-2xl border border-slate-600 bg-black object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
