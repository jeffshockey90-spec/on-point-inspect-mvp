"use client";

type Reminder = {
  title: string;
};

type Suggestion = {
  title: string;
  confidence?: number;
};

type Props = {
  liveNoticeVisible: boolean;
  primaryReminder: Reminder | null;
  primarySuggestion: Suggestion | null;
  pendingCount: number;
  additionalDetectionCount: number;
  confidenceLabel: (value: unknown) => string;
  onOpenDetails: () => void;
};

export default function CameraFocusNotices({
  liveNoticeVisible,
  primaryReminder,
  primarySuggestion,
  pendingCount,
  additionalDetectionCount,
  confidenceLabel,
  onOpenDetails,
}: Props) {
  return (
    <div className="absolute bottom-[218px] left-4 z-20 max-w-[min(78vw,310px)] space-y-2">
      {liveNoticeVisible && primaryReminder && (
        <button
          type="button"
          onClick={onOpenDetails}
          className="w-full rounded-2xl border border-red-400/35 bg-black/82 px-4 py-3 text-left shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-red-300">
              Section Coach
            </span>
            <span className="rounded-full bg-red-400 px-2 py-0.5 text-[10px] font-black text-black">
              Review now
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-black leading-5 text-white">
            {primaryReminder.title}
          </p>
        </button>
      )}

      {liveNoticeVisible && !primaryReminder && primarySuggestion && (
        <button
          type="button"
          onClick={onOpenDetails}
          className="w-full rounded-2xl border border-purple-400/35 bg-black/82 px-4 py-3 text-left shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-purple-300">
              AI Suggestion
            </span>
            <span className="text-[11px] font-black text-purple-100">
              {confidenceLabel(primarySuggestion.confidence)}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-black leading-5 text-white">
            {primarySuggestion.title}
          </p>
        </button>
      )}

      <button
        type="button"
        onClick={onOpenDetails}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-black/72 px-4 py-2 text-xs font-black text-white shadow-xl backdrop-blur"
      >
        <span>🧠</span>
        <span>{pendingCount} in memory</span>
        {additionalDetectionCount > 0 && (
          <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] text-black">
            +{additionalDetectionCount} more
          </span>
        )}
      </button>
    </div>
  );
}
