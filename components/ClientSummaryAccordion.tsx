"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ExpandableReportImage from "./ExpandableReportImage";

type SummaryTone = "red" | "teal" | "yellow" | "blue";

type SummaryGroup = {
  key: string;
  title: string;
  description?: string;
  tone: SummaryTone;
  findings: any[];
};

const INITIAL_ITEMS = 6;
const LOAD_MORE_ITEMS = 6;

function getFindingTitle(finding: any) {
  return (
    finding?.title ||
    finding?.finding_title ||
    finding?.defect_title ||
    finding?.name ||
    "Untitled Finding"
  );
}

function getFindingSummary(finding: any) {
  return (
    finding?.observation ||
    finding?.recommendation ||
    finding?.implication ||
    finding?.comment ||
    "Tap to review this finding."
  );
}

function getItemNumber(finding: any) {
  return String(
    finding?.item_number ||
      finding?.itemNumber ||
      finding?.finding_number ||
      finding?.findingNumber ||
      finding?.reference_number ||
      finding?.referenceNumber ||
      "",
  ).trim();
}

function getMediaUrl(media: any) {
  if (!media) return "";
  return (
    media?.signed_url ||
    media?.public_url ||
    media?.image_url ||
    media?.photo_url ||
    media?.video_url ||
    media?.url ||
    ""
  );
}

function isVideoUrl(value?: string) {
  return /\.(mp4|mov|m4v|webm|avi|quicktime)(\?|#|$)/i.test(String(value || ""));
}

function isVideoMedia(media: any, urlValue?: string) {
  const url = String(urlValue || "").toLowerCase();
  const path = String(
    media?.file_path ||
      media?.storage_path ||
      media?.photo_path ||
      media?.image_path ||
      "",
  ).toLowerCase();
  const type = String(
    media?.mime_type ||
      media?.media_type ||
      media?.content_type ||
      media?.file_type ||
      "",
  ).toLowerCase();

  return (
    Boolean(media?.is_video) ||
    Boolean(media?.video_url) ||
    type.startsWith("video/") ||
    type.includes("quicktime") ||
    /\.(mp4|mov|m4v|webm|avi|quicktime)$/.test(path) ||
    /\.(mp4|mov|m4v|webm|avi|quicktime)(\?|#|$)/.test(url)
  );
}

function getPreviewUrl(media: any) {
  if (!media) return "";

  const fullUrl = getMediaUrl(media);
  const preview = String(
    media?.signed_thumbnail_url ||
      media?.thumbnail_url ||
      media?.signed_preview_url ||
      media?.poster_url ||
      media?.posterUrl ||
      media?.video_thumbnail_url ||
      media?.videoThumbnailUrl ||
      "",
  ).trim();

  if (preview && preview !== fullUrl && !isVideoUrl(preview)) return preview;
  if (isVideoMedia(media, fullUrl)) return preview && !isVideoUrl(preview) ? preview : "";
  return preview || fullUrl;
}

function getPrimaryMedia(finding: any) {
  const photos = Array.isArray(finding?.photos) ? finding.photos : [];
  const image = photos.find((photo: any) => {
    const url = getMediaUrl(photo);
    return url && !isVideoMedia(photo, url);
  });
  if (image) return image;

  const first = photos.find((photo: any) => getMediaUrl(photo));
  if (first) return first;

  const fullUrl =
    finding?.signed_image_url ||
    finding?.image_url ||
    finding?.public_image_url ||
    finding?.video_url ||
    "";

  if (!fullUrl) return null;

  return {
    signed_url: fullUrl,
    public_url: fullUrl,
    signed_thumbnail_url:
      finding?.signed_preview_image_url ||
      finding?.signed_thumbnail_url ||
      finding?.thumbnail_url ||
      "",
    video_url: finding?.video_url || "",
    file_path:
      finding?.file_path ||
      finding?.storage_path ||
      finding?.photo_path ||
      finding?.image_path ||
      "",
    mime_type:
      finding?.mime_type ||
      finding?.media_type ||
      finding?.content_type ||
      finding?.file_type ||
      "",
    is_video: finding?.is_video || finding?.media_type === "video",
  };
}

function toneClasses(tone: SummaryTone) {
  if (tone === "red") {
    return {
      border: "border-red-500/55",
      count: "border-red-500/40 bg-red-500/10 text-red-200",
      stripe: "border-l-red-500",
    };
  }
  if (tone === "yellow") {
    return {
      border: "border-yellow-500/45",
      count: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
      stripe: "border-l-yellow-500",
    };
  }
  if (tone === "blue") {
    return {
      border: "border-blue-500/45",
      count: "border-blue-500/40 bg-blue-500/10 text-blue-200",
      stripe: "border-l-blue-500",
    };
  }
  return {
    border: "border-teal-500/45",
    count: "border-teal-500/40 bg-teal-500/10 text-teal-200",
    stripe: "border-l-teal-500",
  };
}

function severityClass(value: any) {
  const severity = String(value || "Recommended Repair").toLowerCase();
  if (severity.includes("safety") || severity.includes("major")) {
    return "border-red-500/50 bg-red-500/10 text-red-200";
  }
  if (severity.includes("maintenance") || severity.includes("monitor")) {
    return "border-yellow-500/50 bg-yellow-500/10 text-yellow-200";
  }
  if (severity.includes("information")) {
    return "border-blue-500/50 bg-blue-500/10 text-blue-200";
  }
  return "border-teal-500/50 bg-teal-500/10 text-teal-200";
}

function CompactSummaryCard({
  finding,
  tone,
  open,
  onToggle,
  eager,
  cardId,
}: {
  finding: any;
  tone: SummaryTone;
  open: boolean;
  onToggle: () => void;
  eager: boolean;
  cardId: string;
}) {
  const media = getPrimaryMedia(finding);
  const fullUrl = getMediaUrl(media);
  const previewUrl = getPreviewUrl(media);
  const title = getFindingTitle(finding);
  const summary = getFindingSummary(finding);
  const itemNumber = getItemNumber(finding);
  const isVideo = isVideoMedia(media || finding, fullUrl);
  const [imageFailed, setImageFailed] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const toneStyle = toneClasses(tone);

  useEffect(() => {
    if (!videoOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setVideoOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [videoOpen]);

  // A plain onClick + scrollIntoView doesn't work here: the Full Report
  // panel is hidden (`hidden` attribute) until ShareReportTabs' own click
  // listener switches tabs, which it only does for real `<a href="#...">`
  // clicks. Rendering a real anchor lets that existing tab-switch-then-scroll
  // logic handle this correctly instead of scrolling to a hidden element.
  const fullFindingHref = `#finding-${finding.id}`;

  return (
    <article
      data-summary-card-id={cardId}
      className={`overflow-hidden rounded-2xl border border-l-4 bg-[#0b1426] transition hover:bg-[#0e1830] ${toneStyle.border} ${toneStyle.stripe}`}
    >
      <div className="grid w-full grid-cols-[116px_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[132px_minmax(0,1fr)]">
        <div className="relative h-[116px] w-[116px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 sm:h-[132px] sm:w-[132px]">
          {!imageFailed && previewUrl && !isVideo ? (
            <ExpandableReportImage
              src={previewUrl}
              fullSrc={fullUrl || previewUrl}
              alt={title}
              badgeText="View"
              className="h-full w-full object-cover"
              buttonClassName="block h-full w-full overflow-hidden bg-slate-900 text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
            />
          ) : isVideo && fullUrl ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setVideoOpen(true);
              }}
              aria-label={`Open ${title} video full screen`}
              className="relative block h-full w-full overflow-hidden text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`${title} video thumbnail`}
                  className="h-full w-full object-cover"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <video
                  src={fullUrl.includes("#t=") ? fullUrl : `${fullUrl}#t=0.1`}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                  onError={() => setImageFailed(true)}
                />
              )}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/80 text-xl text-white shadow-lg">
                  ▶
                </span>
              </span>
              <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/80 px-2 py-1 text-[10px] font-black text-cyan-200">
                VIDEO
              </span>
            </button>
          ) : (
            <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs font-bold text-slate-500">
              {isVideo ? "Video unavailable" : "Photo unavailable"}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          data-fast-click="true"
          className="min-w-0 text-left active:opacity-85 [touch-action:manipulation]"
        >
          <div className="flex flex-wrap gap-2">
            {itemNumber && (
              <span className="rounded-full border border-cyan-500/50 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-cyan-200">
                Item #{itemNumber}
              </span>
            )}
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${severityClass(
                finding.severity,
              )}`}
            >
              {finding.severity || "Recommended Repair"}
            </span>
          </div>

          <h4 className="mt-3 line-clamp-2 text-lg font-black leading-tight text-white">
            {title}
          </h4>
          <p className="mt-2 text-xs font-black uppercase tracking-wide text-teal-300">
            {finding.section || "Report"}
          </p>
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">
            {summary}
          </p>
          <p className="mt-3 text-sm font-black text-cyan-300">
            {open ? "Hide Details ↑" : "View Finding →"}
          </p>
        </button>
      </div>

      {videoOpen &&
        isVideo &&
        fullUrl &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${title} video player`}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/95 p-3 sm:p-6"
            onClick={() => setVideoOpen(false)}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setVideoOpen(false);
              }}
              aria-label="Close video"
              className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-[10001] flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/80 text-2xl font-black text-white active:scale-95"
            >
              ×
            </button>

            <div
              className="flex h-full w-full items-center justify-center"
              onClick={(event) => event.stopPropagation()}
            >
              <video
                src={fullUrl}
                poster={previewUrl || undefined}
                controls
                autoPlay
                playsInline
                preload="auto"
                className="h-auto max-h-[92dvh] w-auto max-w-[94vw] rounded-xl bg-black object-contain shadow-2xl"
              >
                Your browser does not support video playback.
              </video>
            </div>
          </div>,
          document.body,
        )}

      {open && (
        <div className="border-t border-slate-800 px-4 pb-4 pt-4">
          {(() => {
            const allMedia = (Array.isArray(finding?.photos) ? finding.photos : []).filter(
              (item: any) => Boolean(getMediaUrl(item)),
            );

            if (allMedia.length === 0) return null;

            const photoItems = allMedia.filter(
              (item: any) => !isVideoMedia(item, getMediaUrl(item)),
            );
            const galleryImages = photoItems.map((item: any) => ({
              src: getPreviewUrl(item) || getMediaUrl(item),
              fullSrc: getMediaUrl(item),
              alt: title,
            }));

            return (
              <div className={`mb-4 grid gap-3 ${allMedia.length > 1 ? "sm:grid-cols-2" : ""}`}>
                {allMedia.map((item: any, mediaIndex: number) => {
                  const itemUrl = getMediaUrl(item);
                  const itemPreviewUrl = getPreviewUrl(item);
                  const itemIsVideo = isVideoMedia(item, itemUrl);
                  const photoIndex = photoItems.indexOf(item);

                  return itemIsVideo ? (
                    <video
                      key={item.id || item.file_path || itemUrl || mediaIndex}
                      src={itemUrl}
                      poster={itemPreviewUrl && itemPreviewUrl !== itemUrl ? itemPreviewUrl : undefined}
                      controls
                      muted
                      playsInline
                      preload="metadata"
                      className="max-h-[360px] w-full rounded-xl border border-slate-700 bg-black object-contain"
                    >
                      Your browser does not support video playback.
                    </video>
                  ) : (
                    <ExpandableReportImage
                      key={item.id || item.file_path || itemUrl || mediaIndex}
                      src={itemPreviewUrl || itemUrl}
                      fullSrc={itemUrl}
                      alt={`${title} photo ${mediaIndex + 1}`}
                      badgeText="Tap to enlarge"
                      className="max-h-[360px] w-full rounded-xl border border-slate-700 object-contain"
                      buttonClassName="block w-full overflow-hidden rounded-xl border border-slate-700 bg-black text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                      images={galleryImages}
                      index={photoIndex >= 0 ? photoIndex : 0}
                    />
                  );
                })}
              </div>
            );
          })()}

          <div className="grid gap-3">
            {finding.observation && (
              <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-blue-300">
                  Observation
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-100">
                  {finding.observation}
                </p>
              </div>
            )}

            {finding.implication && (
              <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-yellow-300">
                  Implication
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-100">
                  {finding.implication}
                </p>
              </div>
            )}

            {finding.recommendation && (
              <div className="rounded-xl border border-teal-500/40 bg-teal-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-teal-300">
                  Recommendation
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-100">
                  {finding.recommendation}
                </p>
              </div>
            )}
          </div>

          <a
            href={fullFindingHref}
            data-fast-click="true"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-cyan-500 px-4 py-2 text-sm font-black text-cyan-200 active:scale-[0.98] active:opacity-80 [touch-action:manipulation]"
          >
            Open Full Report Finding
          </a>
        </div>
      )}
    </article>
  );
}

function ShowMoreButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [flash, setFlash] = useState(false);
  const hasFlashedRef = useRef(false);

  useEffect(() => {
    const node = buttonRef.current;
    if (!node || hasFlashedRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasFlashedRef.current) {
          hasFlashedRef.current = true;
          setFlash(true);
          observer.disconnect();
        }
      },
      { threshold: 0.6 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        setFlash(false);
        onClick();
      }}
      data-fast-click="true"
      className={`mt-4 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm font-black text-white active:scale-[0.99] active:opacity-80 [touch-action:manipulation] ${
        flash ? "animate-attention-flash" : ""
      }`}
    >
      {label}
    </button>
  );
}

export default function ClientSummaryAccordion({
  groups,
}: {
  groups: SummaryGroup[];
}) {
  const [openId, setOpenId] = useState<string | number | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openId) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const clickedCard = target.closest<HTMLElement>("[data-summary-card-id]");

      // Clicking inside any finding card is handled by that card itself.
      // Clicking anywhere else closes the currently open finding.
      if (!clickedCard) {
        setOpenId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [openId]);

  const normalizedGroups = useMemo(
    () => (groups || []).filter((group) => Array.isArray(group.findings) && group.findings.length > 0),
    [groups],
  );

  if (!normalizedGroups.length) return null;

  return (
    <div ref={rootRef} className="mt-6 space-y-8 overflow-x-hidden">
      {normalizedGroups.map((group) => {
        const visibleCount = visibleCounts[group.key] || INITIAL_ITEMS;
        const visibleFindings = group.findings.slice(0, visibleCount);
        const remaining = Math.max(0, group.findings.length - visibleFindings.length);
        const toneStyle = toneClasses(group.tone);

        return (
          <section
            key={group.key}
            id={`client-summary-${group.key}`}
            className="scroll-mt-24"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-2xl font-black text-white">{group.title}</h3>
                {group.description && (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                    {group.description}
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-full border px-3 py-2 text-sm font-black ${toneStyle.count}`}>
                {group.findings.length} item{group.findings.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visibleFindings.map((finding: any, index: number) => {
                const cardId = `${group.key}-${finding.id || finding.title || index}`;
                return (
                  <CompactSummaryCard
                    key={cardId}
                    finding={finding}
                    tone={group.tone}
                    open={openId === cardId}
                    onToggle={() => setOpenId(openId === cardId ? null : cardId)}
                    eager={index < 2 && group.key === normalizedGroups[0]?.key}
                    cardId={cardId}
                  />
                );
              })}
            </div>

            {remaining > 0 && (
              <ShowMoreButton
                label={`Show ${Math.min(remaining, LOAD_MORE_ITEMS)} More`}
                onClick={() =>
                  setVisibleCounts((current) => ({
                    ...current,
                    [group.key]: Math.min(group.findings.length, visibleCount + LOAD_MORE_ITEMS),
                  }))
                }
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
