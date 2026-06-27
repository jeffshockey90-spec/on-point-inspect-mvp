"use client";

import { useEffect, useMemo, useState } from "react";

type GalleryImage = {
  id: string;
  title: string;
  caption?: string;
  category?: string;
  imageUrl: string;
  href?: string;
};

export default function PublicProfileGallery({
  images = [],
}: {
  images?: GalleryImage[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const cleanImages = useMemo(
    () => (images || []).filter((image) => image?.imageUrl),
    [images],
  );

  const activeImage =
    activeIndex !== null && cleanImages[activeIndex]
      ? cleanImages[activeIndex]
      : null;

  const previewImages = cleanImages.slice(0, 5);
  const remainingCount = Math.max(0, cleanImages.length - previewImages.length);

  function openGallery(index: number) {
    setActiveIndex(index);
  }

  function closeGallery() {
    setActiveIndex(null);
  }

  function showPrevious() {
    setActiveIndex((current) => {
      if (current === null || cleanImages.length === 0) return current;
      return current === 0 ? cleanImages.length - 1 : current - 1;
    });
  }

  function showNext() {
    setActiveIndex((current) => {
      if (current === null || cleanImages.length === 0) return current;
      return current === cleanImages.length - 1 ? 0 : current + 1;
    });
  }

  useEffect(() => {
    if (activeIndex === null) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeGallery();
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeIndex, cleanImages.length]);

  if (cleanImages.length === 0) return null;

  return (
    <>
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-teal-300">
                Portfolio Gallery
              </p>
              <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">
                Inspection Portfolio Gallery
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Tap any photo to view the full gallery without making this page longer.
              </p>
            </div>

            <button
              type="button"
              onClick={() => openGallery(0)}
              className="rounded-xl border border-teal-400/60 px-5 py-3 text-center font-black text-teal-200 transition hover:bg-teal-500 hover:text-slate-950"
            >
              View All Photos ({cleanImages.length})
            </button>
          </div>

          <div className="mt-7 grid gap-3 lg:grid-cols-[1.35fr_0.65fr]">
            <button
              type="button"
              onClick={() => openGallery(0)}
              className="group relative min-h-[320px] overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 text-left shadow-xl transition hover:-translate-y-1 hover:border-teal-400/70"
            >
              <img
                src={cleanImages[0].imageUrl}
                alt={cleanImages[0].title || "Portfolio gallery photo"}
                loading="lazy"
                decoding="async"
                className="h-full min-h-[320px] w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-5">
                {cleanImages[0].category && (
                  <span className="rounded-full border border-teal-300/60 bg-teal-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-teal-100">
                    {cleanImages[0].category}
                  </span>
                )}
                <h3 className="mt-3 text-2xl font-black text-white">
                  {cleanImages[0].title || "Portfolio Photo"}
                </h3>
                {cleanImages[0].caption && (
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-200">
                    {cleanImages[0].caption}
                  </p>
                )}
              </div>
            </button>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              {previewImages.slice(1, 5).map((image, index) => {
                const realIndex = index + 1;
                const isLastPreview = realIndex === previewImages.length - 1 && remainingCount > 0;

                return (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => openGallery(realIndex)}
                    className="group relative min-h-[150px] overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 text-left shadow-xl transition hover:-translate-y-1 hover:border-teal-400/70"
                  >
                    <img
                      src={image.imageUrl}
                      alt={image.title || "Portfolio gallery photo"}
                      loading="lazy"
                      decoding="async"
                      className="h-full min-h-[150px] w-full object-cover transition duration-300 group-hover:scale-105"
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                    {isLastPreview && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                        <span className="rounded-2xl border border-white/30 bg-white/10 px-5 py-3 text-xl font-black text-white backdrop-blur">
                          +{remainingCount} More
                        </span>
                      </div>
                    )}

                    {!isLastPreview && (
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <p className="line-clamp-1 text-xs font-black text-white">
                          {image.title || image.category || "Portfolio Photo"}
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {activeImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 p-3 text-white backdrop-blur sm:p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto flex h-full max-w-7xl flex-col">
            <div className="flex items-center justify-between gap-3 pb-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
                  {activeIndex! + 1} / {cleanImages.length}
                </p>
                <h3 className="mt-1 truncate text-lg font-black text-white sm:text-2xl">
                  {activeImage.title || "Portfolio Photo"}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeGallery}
                className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-red-400 hover:bg-red-500 hover:text-white"
              >
                ✕ Close
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
              <img
                src={activeImage.imageUrl}
                alt={activeImage.title || "Portfolio gallery photo"}
                className="h-full w-full object-contain"
              />

              {cleanImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={showPrevious}
                    className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/55 text-2xl font-black text-white backdrop-blur transition hover:bg-teal-500 hover:text-slate-950 sm:left-5 sm:h-14 sm:w-14"
                    aria-label="Previous photo"
                  >
                    ‹
                  </button>

                  <button
                    type="button"
                    onClick={showNext}
                    className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/55 text-2xl font-black text-white backdrop-blur transition hover:bg-teal-500 hover:text-slate-950 sm:right-5 sm:h-14 sm:w-14"
                    aria-label="Next photo"
                  >
                    ›
                  </button>
                </>
              )}
            </div>

            {(activeImage.caption || activeImage.category) && (
              <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/85 p-4">
                {activeImage.category && (
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-300">
                    {activeImage.category}
                  </p>
                )}
                {activeImage.caption && (
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {activeImage.caption}
                  </p>
                )}
              </div>
            )}

            {cleanImages.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {cleanImages.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => openGallery(index)}
                    className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border transition ${
                      index === activeIndex
                        ? "border-teal-300 opacity-100"
                        : "border-slate-700 opacity-60 hover:opacity-100"
                    }`}
                    aria-label={`Open photo ${index + 1}`}
                  >
                    <img
                      src={image.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
