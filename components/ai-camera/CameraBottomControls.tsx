"use client";

type Props = {
  starting: boolean;
  recordingVideo: boolean;
  analyzing: boolean;
  online: boolean;
  onQuickPhoto: () => void;
  onToggleVideo: () => void;
  onAnalyze: () => void;
  onOpenActions: () => void;
  onScanDataPlate: () => void;
};

export default function CameraBottomControls({
  starting,
  recordingVideo,
  analyzing,
  online,
  onQuickPhoto,
  onToggleVideo,
  onAnalyze,
  onOpenActions,
  onScanDataPlate,
}: Props) {
  return (
    <>
      <button
        type="button"
        onClick={onQuickPhoto}
        disabled={starting || recordingVideo}
        aria-label="Take quick photo"
        className="absolute bottom-[116px] left-1/2 z-20 h-20 w-20 -translate-x-1/2 rounded-full border-[6px] border-white bg-white shadow-2xl ring-4 ring-teal-400 active:scale-95 disabled:opacity-50"
      />

      <button
        type="button"
        onClick={onOpenActions}
        className="absolute bottom-[124px] right-5 z-20 rounded-3xl border border-white/15 bg-black/78 px-6 py-4 text-sm font-black tracking-wide shadow-2xl backdrop-blur-xl active:scale-95"
      >
        ACTIONS⌃
      </button>

      <div
        className="absolute bottom-[max(0.7rem,env(safe-area-inset-bottom))] left-4 right-4 z-20 rounded-3xl border border-white/15 bg-black/85 px-2 py-2 shadow-2xl backdrop-blur-xl"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          alignItems: "stretch",
          height: "88px",
        }}
      >
        <button
          type="button"
          onClick={onQuickPhoto}
          disabled={starting || recordingVideo}
          className="rounded-2xl text-center active:bg-white/10 disabled:opacity-50"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 0 }}
        >
          <span className="block text-2xl">📷</span>
          <span className="mt-1 block text-[11px] font-bold">Quick Photo</span>
        </button>

        <button
          type="button"
          onClick={onToggleVideo}
          disabled={starting}
          className={`rounded-2xl text-center active:bg-white/10 disabled:opacity-50 ${
            recordingVideo ? "text-red-300" : ""
          }`}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 0 }}
        >
          <span className="block text-2xl">{recordingVideo ? "⏹" : "🎥"}</span>
          <span className="mt-1 block text-[11px] font-bold">
            {recordingVideo ? "Stop Video" : "Record Video"}
          </span>
        </button>

        <button
          type="button"
          onClick={onAnalyze}
          disabled={starting || analyzing || !online}
          className="rounded-2xl text-center active:bg-white/10 disabled:opacity-50"
        >
          <span className="block text-2xl">✨</span>
          <span className="mt-1 block text-[11px] font-bold">
            {analyzing ? "Analyzing" : "Analyze"}
          </span>
        </button>

        <button
          type="button"
          onClick={onScanDataPlate}
          className="rounded-2xl text-center active:bg-white/10"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 0 }}
        >
          <span className="block text-2xl">▣</span>
          <span className="mt-1 block text-[11px] font-bold">Data Plate</span>
        </button>
      </div>
    </>
  );
}
