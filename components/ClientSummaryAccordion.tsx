"use client";

import { useMemo, useState } from "react";

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
    };
  }
  if (tone === "yellow") {
    return {
      border: "border-yellow-500/45",
      count: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    };
  }
  if (tone === "blue") {
    return {
      border: "border-blue-500/45",
      count: "border-blue-500/40 bg-blue-500/10 text-blue-200",
    };
  }
  return {
    border: "border-teal-500/45",
    count: "border-teal-500/40 bg-teal-500/10 text-teal-200",
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
}: {
  finding: any;
  tone: SummaryTone;
  open: boolean;
  onToggle: () => void;
  eager: boolean;
}) {
  const media = getPrimaryMedia(finding);
  const fullUrl = getMediaUrl(media);
  const previewUrl = getPreviewUrl(media);
  const title = getFindingTitle(finding);
  const summary = getFindingSummary(finding);
  const itemNumber = getItemNumber(finding);
  const isVideo = isVideoMedia(media || finding, fullUrl);
  const [imageFailed, setImageFailed] = useState(false);
  const toneStyle = toneClasses(tone);

  function openFullFinding() {
    const target = document.getElementById("inspection-findings");
    target?.scrollIntoView({ block: "start" });
  }

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-[#0b1426] ${toneStyle.border}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "210px" }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-fast-click="true"
        className="grid w-full grid-cols-[116px_minmax(0,1fr)] gap-4 p-4 text-left active:opacity-85 [touch-action:manipulation] sm:grid-cols-[132px_minmax(0,1fr)]"
      >
        <div className="relative h-[116px] w-[116px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 sm:h-[132px] sm:w-[132px]">
          {!imageFailed && previewUrl ? (
            <img
              src={previewUrl}
              alt={title}
              width={132}
              height={132}
              loading={eager ? "eager" : "lazy"}
              fetchPriority={eager ? "high" : "low"}
              decoding="async"
              draggable={false}
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs font-bold text-slate-500">
              {isVideo ? "Video" : "Photo unavailable"}
            </div>
          )}
          {isVideo && (
            <span className="absolute bottom-2 left-2 rounded-full bg-black/80 px-2 py-1 text-[10px] font-black text-cyan-200">
              ▶ VIDEO
            </span>
          )}
        </div>

        <div className="min-w-0">
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
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-800 px-4 pb-4 pt-3">
          {finding.observation && (
            <p className="text-sm leading-6 text-slate-200">{finding.observation}</p>
          )}
          <button
            type="button"
            onClick={openFullFinding}
            data-fast-click="true"
            className="mt-3 min-h-11 rounded-xl border border-cyan-500 px-4 py-2 text-sm font-black text-cyan-200 active:scale-[0.98] active:opacity-80 [touch-action:manipulation]"
          >
            Open Full Report Finding
          </button>
        </div>
      )}
    </article>
  );
}

export default function ClientSummaryAccordion({
  groups,
}: {
  groups: SummaryGroup[];
}) {
  const [openId, setOpenId] = useState<string | number | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

  const normalizedGroups = useMemo(
    () => (groups || []).filter((group) => Array.isArray(group.findings) && group.findings.length > 0),
    [groups],
  );

  if (!normalizedGroups.length) return null;

  return (
    <div className="mt-6 space-y-8 overflow-x-hidden">
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
            style={{ contentVisibility: "auto", containIntrinsicSize: "520px" }}
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
                  />
                );
              })}
            </div>

            {remaining > 0 && (
              <button
                type="button"
                onClick={() =>
                  setVisibleCounts((current) => ({
                    ...current,
                    [group.key]: Math.min(group.findings.length, visibleCount + LOAD_MORE_ITEMS),
                  }))
                }
                data-fast-click="true"
                className="mt-4 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm font-black text-white active:scale-[0.99] active:opacity-80 [touch-action:manipulation]"
              >
                Show {Math.min(remaining, LOAD_MORE_ITEMS)} More
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
