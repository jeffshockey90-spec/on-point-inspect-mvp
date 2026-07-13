"use client";

import type { CSSProperties } from "react";

type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  approximate?: boolean;
};

type Suggestion = {
  trackId?: string;
  title: string;
  confidence?: number;
  pinned?: boolean;
  stale?: boolean;
  region?: Region | null;
};

type Size = { width: number; height: number };

type Props = {
  suggestions: Suggestion[];
  videoSize: Size;
  viewportSize: Size;
  zoomLevel: number;
  hardwareZoom: boolean;
  confidenceLabel: (value: unknown) => string;
  mapRegion: (
    region: Region,
    sourceWidth: number,
    sourceHeight: number,
    viewportWidth: number,
    viewportHeight: number,
    zoomLevel?: number,
    hardwareZoom?: boolean,
  ) => CSSProperties;
  createKey: (suggestion: any) => string;
  onSelect: (suggestion: Suggestion) => void;
};

export default function CameraDetectionOverlay({
  suggestions,
  videoSize,
  viewportSize,
  zoomLevel,
  hardwareZoom,
  confidenceLabel,
  mapRegion,
  createKey,
  onSelect,
}: Props) {
  return (
    <>
      {suggestions
        .filter((suggestion) => suggestion.region)
        .slice(0, 4)
        .map((suggestion, index) => {
          const region = suggestion.region!;

          return (
            <button
              key={`camera-region-${suggestion.trackId || createKey(suggestion)}-${index}`}
              type="button"
              onClick={() => onSelect(suggestion)}
              className={`absolute z-10 border-[3px] bg-emerald-400/10 transition-all duration-500 ease-out ${
                suggestion.stale
                  ? "border-emerald-300/55 opacity-60"
                  : "border-emerald-400 opacity-100 shadow-[0_0_24px_rgba(74,222,128,0.8)]"
              } ${region.approximate ? "border-dashed" : ""} ${
                suggestion.pinned ? "ring-2 ring-cyan-300" : ""
              }`}
              style={mapRegion(
                region,
                videoSize.width,
                videoSize.height,
                viewportSize.width,
                viewportSize.height,
                zoomLevel,
                hardwareZoom,
              )}
            >
              <span className="absolute left-1/2 top-0 max-w-[220px] -translate-x-1/2 -translate-y-full rounded-full border border-emerald-400/50 bg-black/88 px-3 py-1.5 text-[11px] font-black text-emerald-300 shadow-xl backdrop-blur">
                {region.label || suggestion.title}
                <span className="ml-2 text-emerald-100">
                  {confidenceLabel(suggestion.confidence)}
                  {suggestion.pinned ? " · pinned" : ""}
                </span>
              </span>
            </button>
          );
        })}
    </>
  );
}
