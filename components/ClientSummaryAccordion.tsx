"use client";

import { useState } from "react";

type SummaryTone = "red" | "teal" | "yellow" | "blue";

type SummaryGroup = {
  key: string;
  title: string;
  description?: string;
  tone: SummaryTone;
  findings: any[];
};

function getSeverityBucket(severityValue: any) {
  const severity = String(severityValue || "Recommended Repair").toLowerCase();

  if (
    severity.includes("safety") ||
    severity.includes("hazard") ||
    severity.includes("major")
  ) {
    return "safety";
  }

  if (severity.includes("repair") || severity.includes("defect")) {
    return "repair";
  }

  if (
    severity.includes("maintenance") ||
    severity.includes("monitor") ||
    severity.includes("minor")
  ) {
    return "maintenance";
  }

  if (
    severity.includes("information") ||
    severity.includes("info") ||
    severity.includes("client")
  ) {
    return "information";
  }

  return "repair";
}

function getSeverityClass(severityValue: any) {
  const bucket = getSeverityBucket(severityValue);

  if (bucket === "safety")
    return "border-red-400/70 bg-red-500/20 text-red-100 shadow-[0_0_18px_rgba(239,68,68,0.18)]";
  if (bucket === "maintenance")
    return "border-yellow-400/70 bg-yellow-500/20 text-yellow-100 shadow-[0_0_18px_rgba(234,179,8,0.14)]";
  if (bucket === "information")
    return "border-blue-400/70 bg-blue-500/20 text-blue-100 shadow-[0_0_18px_rgba(59,130,246,0.14)]";
  return "border-teal-400/70 bg-teal-500/20 text-teal-100 shadow-[0_0_18px_rgba(20,184,166,0.14)]";
}

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
    "Tap to view finding details."
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

function getMediaPreviewUrl(media: any) {
  if (!media) return "";

  const fullUrl = getMediaUrl(media);
  const thumbnailUrl = String(
    media?.signed_thumbnail_url ||
      media?.thumbnail_url ||
      ""
  ).trim();

  // Use lightweight preview URLs first. These are generated from the original
  // stored image when possible, then fall back to the full signed photo.
  return thumbnailUrl || fullUrl;
}

function handleImageFallback(
  event: React.SyntheticEvent<HTMLImageElement>,
  fallbackUrl: string,
) {
  const image = event.currentTarget;

  if (fallbackUrl && image.src !== fallbackUrl) {
    image.src = fallbackUrl;
    return;
  }

  image.style.display = "none";
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
    path.match(/\.(mp4|mov|m4v|webm|avi|quicktime)$/) !== null ||
    url.match(/\.(mp4|mov|m4v|webm|avi|quicktime)(\?|$)/) !== null
  );
}

function getFindingPrimaryMedia(finding: any) {
  const photos = Array.isArray(finding?.photos) ? finding.photos : [];

  const imagePhoto = photos.find((photo: any) => {
    const url = getMediaUrl(photo);
    return url && !isVideoMedia(photo, url);
  });
  if (imagePhoto) return imagePhoto;

  const firstUsablePhoto = photos.find((photo: any) => getMediaUrl(photo));
  if (firstUsablePhoto) return firstUsablePhoto;

  const legacyUrl =
    finding?.signed_image_url ||
    finding?.image_url ||
    finding?.public_image_url ||
    finding?.video_url ||
    "";
  if (!legacyUrl) return null;

  return {
    signed_url: legacyUrl,
    public_url: legacyUrl,
    image_url: legacyUrl,
    photo_url: legacyUrl,
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

function getFindingMediaList(finding: any) {
  const photos = Array.isArray(finding?.photos) ? finding.photos : [];
  const usablePhotos = photos.filter((photo: any) =>
    Boolean(getMediaUrl(photo)),
  );
  if (usablePhotos.length > 0) return usablePhotos;

  const primaryMedia = getFindingPrimaryMedia(finding);
  return primaryMedia && getMediaUrl(primaryMedia) ? [primaryMedia] : [];
}

function toneCardClass(tone: SummaryTone, active: boolean) {
  const open = active
    ? "border-cyan-300/80 shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_28px_80px_rgba(0,0,0,0.55)]"
    : "shadow-[0_18px_48px_rgba(0,0,0,0.38)]";

  if (tone === "red")
    return `${open} border-red-500/80 bg-gradient-to-b from-[#10192b] via-[#081323] to-[#020817] hover:border-red-300/90`;
  if (tone === "yellow")
    return `${open} border-yellow-500/75 bg-gradient-to-b from-[#10192b] via-[#081323] to-[#020817] hover:border-yellow-300/90`;
  if (tone === "blue")
    return `${open} border-blue-500/75 bg-gradient-to-b from-[#10192b] via-[#081323] to-[#020817] hover:border-blue-300/90`;
  return `${open} border-teal-500/75 bg-gradient-to-b from-[#10192b] via-[#081323] to-[#020817] hover:border-teal-300/90`;
}

function toneCountClass(tone: SummaryTone) {
  if (tone === "red") return "border-red-500/40 bg-red-500/10 text-red-300";
  if (tone === "yellow")
    return "border-yellow-500/40 bg-yellow-500/10 text-yellow-300";
  if (tone === "blue") return "border-blue-500/40 bg-blue-500/10 text-blue-300";
  return "border-teal-500/40 bg-teal-500/10 text-teal-300";
}

function DetailIcon({ tone }: { tone: "blue" | "yellow" | "teal" | "slate" }) {
  const className =
    tone === "blue"
      ? "bg-blue-500/25 text-blue-100"
      : tone === "yellow"
        ? "bg-yellow-500/25 text-yellow-100"
        : tone === "teal"
          ? "bg-teal-500/25 text-teal-100"
          : "bg-slate-500/25 text-slate-100";

  const icon = tone === "blue" ? "👁" : tone === "yellow" ? "⚠" : tone === "teal" ? "✓" : "•";

  return (
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg ${className}`}>
      {icon}
    </span>
  );
}

function FindingTextCard({
  title,
  value,
  tone,
}: {
  title: string;
  value?: any;
  tone: "blue" | "yellow" | "teal" | "slate";
}) {
  const clean = String(value || "").trim();
  if (!clean) return null;

  const color =
    tone === "blue"
      ? "border-blue-500/70 bg-blue-500/10 text-slate-100 shadow-[inset_0_0_22px_rgba(59,130,246,0.08)]"
      : tone === "yellow"
        ? "border-yellow-500/75 bg-yellow-500/10 text-slate-100 shadow-[inset_0_0_22px_rgba(234,179,8,0.08)]"
        : tone === "teal"
          ? "border-teal-500/70 bg-teal-500/10 text-slate-100 shadow-[inset_0_0_22px_rgba(20,184,166,0.08)]"
          : "border-slate-700 bg-[#020817]/80 text-slate-200";

  const heading =
    tone === "blue"
      ? "text-blue-400"
      : tone === "yellow"
        ? "text-yellow-400"
        : tone === "teal"
          ? "text-cyan-300"
          : "text-slate-300";

  return (
    <div
      className={`box-border w-full max-w-full rounded-2xl border p-4 sm:p-5 ${color}`}
    >
      <div className="flex w-full min-w-0 items-start gap-4">
        <DetailIcon tone={tone} />
        <div className="min-w-0 flex-1">
          <p className={`break-words text-sm font-black uppercase tracking-wide ${heading}`}>
            {title}
          </p>
          <p className="mt-4 whitespace-pre-line break-words text-base leading-8 text-slate-100 [overflow-wrap:anywhere]">
            {clean}
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryFindingCard({
  finding,
  tone,
  isOpen,
  onToggle,
}: {
  finding: any;
  tone: SummaryTone;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const primaryMedia = getFindingPrimaryMedia(finding);
  const mediaUrl = getMediaUrl(primaryMedia);
  const previewUrl = getMediaPreviewUrl(primaryMedia);
  const mediaList = getFindingMediaList(finding).filter((item: any) => {
    const url = getMediaUrl(item);
    return url && url !== mediaUrl;
  });
  const title = getFindingTitle(finding);
  const summary = getFindingSummary(finding);
  const itemNumber = getItemNumber(finding);
  const video = isVideoMedia(primaryMedia || finding, mediaUrl);

  return (
    <article
      className={`relative w-full max-w-full min-w-0 self-start overflow-hidden rounded-2xl border text-left transition duration-200 ${isOpen ? "sm:col-span-2 xl:col-span-2" : ""} ${toneCardClass(
        tone,
        isOpen,
      )}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        data-fast-click="true"
        className="block w-full max-w-full min-w-0 text-left transition duration-150 active:scale-[0.99] [touch-action:manipulation]"
      >
        {itemNumber && (
          <div className="absolute left-3 top-3 z-20 rounded-full border border-cyan-300/80 bg-[#020617]/90 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.22)] backdrop-blur">
            Item #{itemNumber}
          </div>
        )}

        {mediaUrl && (
          <div className="relative h-44 w-full max-w-full overflow-hidden border-b border-slate-800 bg-black sm:h-48">
            {video ? (
              <>
                <video
                  src={mediaUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover opacity-70"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="rounded-full border border-cyan-400 bg-black/75 px-4 py-2 text-xs font-black uppercase tracking-wide text-cyan-300 shadow-[0_0_22px_rgba(34,211,238,0.25)]">
                    ▷ Video
                  </span>
                </div>
              </>
            ) : (
              <img
                src={previewUrl || mediaUrl}
                alt={title}
                onError={(event) => handleImageFallback(event, mediaUrl)}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="h-full w-full object-cover"
              />
            )}
          </div>
        )}

        <div className={`p-4 sm:p-5 ${!mediaUrl && itemNumber ? "pt-14" : ""}`}>
          <div className="mb-4 flex max-w-full flex-wrap items-center gap-2">
            {itemNumber && (
              <span className="rounded-full border border-cyan-400/80 bg-cyan-500/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.14)]">
                Item #{itemNumber}
              </span>
            )}

            <span
              className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${getSeverityClass(finding.severity)}`}
            >
              {finding.severity || "Recommended Repair"}
            </span>
            <span className="rounded-full border border-slate-500/60 bg-slate-900/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-200">
              {finding.section || "Report"}
            </span>
          </div>

          <h4 className="break-words text-xl font-black leading-tight text-white sm:text-2xl">
            {title}
          </h4>
          <p
            className={`mt-4 text-[15px] leading-7 text-slate-200 ${isOpen ? "" : "line-clamp-3"}`}
          >
            {summary}
          </p>
          <p className="mt-5 text-base font-black text-cyan-300">
            {isOpen ? "Collapse ↑" : "See More →"}
          </p>
        </div>
      </button>

      {isOpen && (
        <div className="box-border w-full max-w-full min-w-0 overflow-hidden px-4 pb-5 sm:px-5 sm:pb-6">
          {video && mediaUrl && (
            <video
              src={mediaUrl}
              controls
              playsInline
              preload="metadata"
              className="mb-4 max-h-[520px] w-full max-w-full rounded-xl border border-slate-700 bg-black object-contain"
            />
          )}

          {mediaList.length > 0 && (
            <div className="mb-5 grid w-full max-w-full min-w-0 gap-4 md:grid-cols-2">
              {mediaList.map((item: any, mediaIndex: number) => {
                const itemUrl = getMediaUrl(item);
                const itemPreviewUrl = getMediaPreviewUrl(item);
                const itemIsVideo = isVideoMedia(item, itemUrl);
                if (!itemUrl) return null;

                return itemIsVideo ? (
                  <video
                    key={item.id || item.file_path || itemUrl || mediaIndex}
                    src={itemUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="max-h-[520px] w-full max-w-full rounded-xl border border-slate-700 bg-black object-contain"
                  />
                ) : (
                  <img
                    key={item.id || item.file_path || itemUrl || mediaIndex}
                    src={itemPreviewUrl || itemUrl}
                    alt={`Summary finding media ${mediaIndex + 1}`}
                    onError={(event) => handleImageFallback(event, itemUrl)}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    className="max-h-[520px] w-full max-w-full rounded-xl border border-slate-700 object-contain"
                  />
                );
              })}
            </div>
          )}

          <div className="box-border flex w-full max-w-full min-w-0 flex-col gap-4">
            <FindingTextCard
              title="Observation"
              value={finding.observation}
              tone="blue"
            />
            <FindingTextCard
              title="Implication"
              value={finding.implication}
              tone="yellow"
            />
            <FindingTextCard
              title="Recommendation"
              value={finding.recommendation}
              tone="teal"
            />
            <FindingTextCard
              title="Additional Notes"
              value={finding.comment}
              tone="slate"
            />
          </div>

          {(finding.equipment_type || finding.equipmentType) && (
            <div className="mt-5 border-t border-slate-600/70 pt-5">
              <p className="text-sm font-black text-cyan-300">Equipment Type</p>
              <p className="mt-2 break-words text-lg font-semibold text-white">
                {finding.equipment_type || finding.equipmentType}
              </p>
            </div>
          )}
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

  if (!groups?.length) return null;

  return (
    <div className="mt-6 w-full max-w-full space-y-8 overflow-x-hidden">
      {groups.map((group) => (
        <section
          key={group.key}
          id={`client-summary-${group.key}`}
          className="w-full max-w-full overflow-x-hidden scroll-mt-6"
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-black text-white sm:text-3xl">
                {group.title}
              </h3>
              {group.description && (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  {group.description}
                </p>
              )}
            </div>

            <span
              className={`rounded-full border px-4 py-2 text-sm font-black ${toneCountClass(group.tone)}`}
            >
              {group.findings.length} item
              {group.findings.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid w-full max-w-full min-w-0 grid-cols-1 items-start gap-5 overflow-visible sm:grid-cols-2 xl:grid-cols-4">
            {group.findings.map((finding: any, index: number) => {
              const cardId = `${group.key}-${finding.id || finding.title || index}`;
              const isOpen = openId === cardId;

              return (
                <SummaryFindingCard
                  key={cardId}
                  finding={finding}
                  tone={group.tone}
                  isOpen={isOpen}
                  onToggle={() => setOpenId(isOpen ? null : cardId)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
