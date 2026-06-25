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

  if (bucket === "safety") return "border-red-500/50 bg-red-500/15 text-red-200";
  if (bucket === "maintenance") return "border-yellow-500/50 bg-yellow-500/15 text-yellow-200";
  if (bucket === "information") return "border-blue-500/50 bg-blue-500/15 text-blue-200";
  return "border-teal-500/50 bg-teal-500/15 text-teal-200";
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

function getMediaUrl(media: any) {
  if (!media) return "";
  return media?.signed_url || media?.public_url || media?.image_url || media?.photo_url || media?.url || "";
}

function getMediaPreviewUrl(media: any) {
  if (!media) return "";
  return media?.signed_thumbnail_url || media?.thumbnail_url || getMediaUrl(media);
}

function isVideoMedia(media: any, urlValue?: string) {
  const url = String(urlValue || "").toLowerCase();
  const path = String(
    media?.file_path || media?.storage_path || media?.photo_path || media?.image_path || "",
  ).toLowerCase();
  const type = String(
    media?.mime_type || media?.media_type || media?.content_type || media?.file_type || "",
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

  const legacyUrl = finding?.signed_image_url || finding?.image_url || finding?.public_image_url || "";
  if (!legacyUrl) return null;

  return {
    signed_url: legacyUrl,
    public_url: legacyUrl,
    image_url: legacyUrl,
    photo_url: legacyUrl,
    file_path: finding?.file_path || finding?.storage_path || finding?.photo_path || finding?.image_path || "",
    mime_type: finding?.mime_type || finding?.media_type || finding?.content_type || finding?.file_type || "",
    is_video: finding?.is_video || finding?.media_type === "video",
  };
}

function getFindingMediaList(finding: any) {
  const photos = Array.isArray(finding?.photos) ? finding.photos : [];
  const usablePhotos = photos.filter((photo: any) => Boolean(getMediaUrl(photo)));
  if (usablePhotos.length > 0) return usablePhotos;

  const primaryMedia = getFindingPrimaryMedia(finding);
  return primaryMedia && getMediaUrl(primaryMedia) ? [primaryMedia] : [];
}

function toneCardClass(tone: SummaryTone, active: boolean) {
  const base = active ? "ring-2 ring-white/70" : "";
  if (tone === "red") return `${base} border-red-500/60 bg-red-950/25 hover:bg-red-950/40`;
  if (tone === "yellow") return `${base} border-yellow-500/60 bg-yellow-950/20 hover:bg-yellow-950/35`;
  if (tone === "blue") return `${base} border-blue-500/60 bg-blue-950/20 hover:bg-blue-950/35`;
  return `${base} border-teal-500/60 bg-teal-950/20 hover:bg-teal-950/35`;
}

function toneCountClass(tone: SummaryTone) {
  if (tone === "red") return "border-red-500/40 bg-red-500/10 text-red-300";
  if (tone === "yellow") return "border-yellow-500/40 bg-yellow-500/10 text-yellow-300";
  if (tone === "blue") return "border-blue-500/40 bg-blue-500/10 text-blue-300";
  return "border-teal-500/40 bg-teal-500/10 text-teal-300";
}

function FindingTextCard({ title, value, tone }: { title: string; value?: any; tone: "blue" | "yellow" | "teal" | "slate" }) {
  const clean = String(value || "").trim();
  if (!clean) return null;

  const color =
    tone === "blue"
      ? "border-blue-500/40 bg-blue-500/10 text-blue-100"
      : tone === "yellow"
        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-100"
        : tone === "teal"
          ? "border-teal-500/40 bg-teal-500/10 text-teal-100"
          : "border-slate-700 bg-[#020817] text-slate-200";

  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-xs font-black uppercase tracking-wide text-white">{title}</p>
      <p className="mt-2 whitespace-pre-line text-sm leading-6">{clean}</p>
    </div>
  );
}

function CollapsedSummaryCard({
  finding,
  tone,
  isOpen,
  onClick,
}: {
  finding: any;
  tone: SummaryTone;
  isOpen: boolean;
  onClick: () => void;
}) {
  const primaryMedia = getFindingPrimaryMedia(finding);
  const mediaUrl = getMediaUrl(primaryMedia);
  const previewUrl = getMediaPreviewUrl(primaryMedia);
  const title = getFindingTitle(finding);
  const summary = getFindingSummary(finding);
  const video = isVideoMedia(primaryMedia || finding, mediaUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`overflow-hidden rounded-2xl border text-left align-top shadow-xl transition hover:-translate-y-0.5 hover:border-white/40 ${toneCardClass(
        tone,
        isOpen,
      )}`}
    >
      {mediaUrl && (
        <div className="relative h-44 overflow-hidden border-b border-slate-800 bg-black">
          {video ? (
            <>
              <video src={mediaUrl} muted playsInline preload="metadata" className="h-full w-full object-cover opacity-80" />
              <span className="absolute bottom-3 right-3 rounded-full border border-cyan-400 bg-black/75 px-3 py-2 text-xs font-black uppercase tracking-wide text-cyan-300">
                Video
              </span>
            </>
          ) : (
            <img
              src={previewUrl || mediaUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="h-full w-full object-cover"
            />
          )}
        </div>
      )}

      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${getSeverityClass(finding.severity)}`}>
            {finding.severity || "Recommended Repair"}
          </span>
          <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-300">
            {finding.section || "Report"}
          </span>
        </div>

        <h4 className="text-lg font-black leading-tight text-white">{title}</h4>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-300">{summary}</p>
        <p className="mt-3 text-sm font-black text-cyan-300">{isOpen ? "Selected ↑" : "See More →"}</p>
      </div>
    </button>
  );
}

function ExpandedSummaryPanel({ finding, tone }: { finding: any; tone: SummaryTone }) {
  const mediaList = getFindingMediaList(finding);
  const title = getFindingTitle(finding);

  return (
    <div className={`mt-5 overflow-hidden rounded-2xl border p-5 shadow-2xl ${toneCardClass(tone, true)}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Expanded Finding Details</p>
          <h4 className="mt-2 text-2xl font-black text-white">{title}</h4>
        </div>
        <span className={`rounded-full border px-3 py-2 text-xs font-black uppercase tracking-wide ${getSeverityClass(finding.severity)}`}>
          {finding.severity || "Recommended Repair"}
        </span>
      </div>

      {mediaList.length > 0 && (
        <div className="mb-5 grid gap-4 md:grid-cols-2">
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
                className="max-h-[520px] w-full rounded-xl border border-slate-700 bg-black object-contain"
              />
            ) : (
              <img
                key={item.id || item.file_path || itemUrl || mediaIndex}
                src={itemPreviewUrl || itemUrl}
                alt={`Summary finding media ${mediaIndex + 1}`}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="max-h-[520px] w-full rounded-xl border border-slate-700 object-contain"
              />
            );
          })}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <FindingTextCard title="Observation" value={finding.observation} tone="blue" />
        <FindingTextCard title="Implication" value={finding.implication} tone="yellow" />
        <FindingTextCard title="Recommendation" value={finding.recommendation} tone="teal" />
        <FindingTextCard title="Additional Notes" value={finding.comment} tone="slate" />
      </div>
    </div>
  );
}

export default function ClientSummaryAccordion({ groups }: { groups: SummaryGroup[] }) {
  const [openId, setOpenId] = useState<string | number | null>(null);

  if (!groups?.length) return null;

  return (
    <div className="mt-6 space-y-6">
      {groups.map((group) => (
        <section
          key={group.key}
          id={`client-summary-${group.key}`}
          className="scroll-mt-6 rounded-2xl border border-slate-700 bg-[#0f172a] p-5"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-black text-white">{group.title}</h3>
              {group.description && (
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
                  {group.description}
                </p>
              )}
            </div>

            <span className={`rounded-full border px-4 py-2 text-sm font-black ${toneCountClass(group.tone)}`}>
              {group.findings.length} item{group.findings.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {group.findings.map((finding: any) => {
              const cardId = `${group.key}-${finding.id || finding.title}`;
              const isOpen = openId === cardId;

              return (
                <div key={cardId} className="contents">
                  <CollapsedSummaryCard
                    finding={finding}
                    tone={group.tone}
                    isOpen={isOpen}
                    onClick={() => setOpenId(isOpen ? null : cardId)}
                  />

                  {isOpen && (
                    <div className="col-span-full">
                      <ExpandedSummaryPanel finding={finding} tone={group.tone} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
