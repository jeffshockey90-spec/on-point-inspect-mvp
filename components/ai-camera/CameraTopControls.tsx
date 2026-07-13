"use client";

type Props = {
  online: boolean;
  starting: boolean;
  autoWatch: boolean;
  torchOn: boolean;
  onClose: () => void;
  onToggleWatch: () => void;
  onToggleTorch: () => void;
  onToggleFacing: () => void;
};

export default function CameraTopControls({
  online,
  starting,
  autoWatch,
  torchOn,
  onClose,
  onToggleWatch,
  onToggleTorch,
  onToggleFacing,
}: Props) {
  return (
    <div className="absolute left-0 right-0 top-0 z-20 flex items-start justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close camera"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/70 text-4xl font-light text-white shadow-2xl backdrop-blur active:scale-95"
      >
        ×
      </button>

      <button
        type="button"
        onClick={onToggleWatch}
        disabled={!online || starting}
        className="whitespace-nowrap rounded-full border border-white/10 bg-black/75 px-4 py-2 text-center shadow-xl backdrop-blur-xl disabled:opacity-50"
      >
        <span className="text-xs font-black">AI Second Inspector · </span>
        <span className="text-xs font-bold">
          <span
            className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${
              autoWatch ? "bg-emerald-400" : "bg-slate-500"
            }`}
          />
          AI Watching:{" "}
          <span className={autoWatch ? "text-emerald-400" : "text-slate-300"}>
            {autoWatch ? "ON" : "OFF"}
          </span>
        </span>
      </button>

      <div className="grid gap-3">
        <button
          type="button"
          onClick={onToggleTorch}
          className={`flex h-12 w-12 flex-col items-center justify-center rounded-full border border-white/15 bg-black/70 shadow-2xl backdrop-blur active:scale-95 ${
            torchOn ? "ring-2 ring-yellow-300" : ""
          }`}
        >
          <span className="text-xl">⚡</span>
          <span className="text-[9px] font-bold">Flash</span>
        </button>

        <button
          type="button"
          onClick={onToggleFacing}
          className="flex h-12 w-12 flex-col items-center justify-center rounded-full border border-white/15 bg-black/70 shadow-2xl backdrop-blur active:scale-95"
        >
          <span className="text-lg">↻</span>
          <span className="text-[9px] font-bold">Flip</span>
        </button>
      </div>
    </div>
  );
}
