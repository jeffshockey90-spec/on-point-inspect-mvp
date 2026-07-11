"use client";

import { useEffect, useState } from "react";

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
  buttonClassName = "block w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-left focus:outline-none focus:ring-2 focus:ring-cyan-300",
  badgeText = "Tap to enlarge",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fullImageUrl = fullSrc || src;

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  if (!src) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => !failed && setExpanded(true)}
        className={`relative active:opacity-85 [touch-action:manipulation] ${buttonClassName}`}
        title={badgeText}
        data-fast-click="true"
      >
        {!loaded && !failed && (
          <span className="absolute inset-0 animate-pulse bg-slate-800" aria-hidden="true" />
        )}
        {!failed ? (
          <img
            src={src}
            alt={alt}
            width={960}
            height={640}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`${className} ${loaded ? "opacity-100" : "opacity-0"}`}
            style={{ contentVisibility: "auto", containIntrinsicSize: "260px" }}
          />
        ) : (
          <span className="flex min-h-32 items-center justify-center text-sm font-bold text-slate-500">
            Photo unavailable
          </span>
        )}
        {!failed && (
          <span className="absolute bottom-2 right-2 rounded-full border border-white/25 bg-black/75 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white">
            {badgeText}
          </span>
        )}
      </button>

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setExpanded(false)}
        >
          <button
            type="button"
            aria-label="Close expanded image"
            className="absolute right-4 top-4 min-h-12 rounded-full border border-white/30 bg-black/85 px-4 py-2 text-sm font-black text-white active:scale-[0.98] [touch-action:manipulation]"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(false);
            }}
            data-fast-click="true"
          >
            Close ✕
          </button>
          <img
            src={fullImageUrl}
            alt={alt}
            decoding="async"
            className="max-h-[88vh] max-w-[94vw] rounded-xl border border-slate-700 bg-black object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
