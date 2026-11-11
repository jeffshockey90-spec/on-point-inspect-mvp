// Pure geometry for the photo markup editor (components/PhotoMarkupEditor).
//
// The editor draws on a Konva stage whose LOGICAL coordinate space is derived
// only from the photo's aspect ratio (device-independent, so saved markups
// re-open in place on any screen). Separately, that stage has to be scaled to
// FIT the actual on-screen area — otherwise a 900px-wide stage overflows a
// ~390px phone and the photo's edges get clipped off-screen where you can't
// reach them to mark. These helpers compute that fit + the export scaling, kept
// pure so they can be unit-tested without a DOM/canvas.

export type StageFit = {
  /** Scale applied to the logical stage so it fits the viewport (never > 1). */
  fitScale: number;
  /** On-screen stage size in CSS px (logical size × fitScale). */
  renderWidth: number;
  renderHeight: number;
};

/**
 * Fit a logical stage (stageWidth × stageHeight) inside the available viewport,
 * scaling DOWN to fit but never UP (so large desktop screens keep native size).
 * A zero/unmeasured viewport yields fitScale 1 (render at logical size).
 */
export function fitStageToViewport(
  stageWidth: number,
  stageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 8,
): StageFit {
  const safeStageW = Math.max(1, stageWidth);
  const safeStageH = Math.max(1, stageHeight);

  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    return {
      fitScale: 1,
      renderWidth: safeStageW,
      renderHeight: safeStageH,
    };
  }

  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);

  const fitScale = Math.min(
    1,
    availableWidth / safeStageW,
    availableHeight / safeStageH,
  );

  return {
    fitScale,
    renderWidth: Math.max(1, Math.round(safeStageW * fitScale)),
    renderHeight: Math.max(1, Math.round(safeStageH * fitScale)),
  };
}

/**
 * Pixel ratio for exporting the flattened image at the photo's NATIVE
 * resolution, independent of the device size. The stage is rendered small (for
 * editing) and additionally scaled by fitScale, so we divide the logical ratio
 * by fitScale to undo the fit shrink — output dimensions then match a full-size
 * desktop stage. Capped so a pathologically tiny fitScale can't explode memory.
 */
export function exportPixelRatioFor(
  sourceWidth: number,
  stageWidth: number,
  fitScale: number,
): number {
  const safeStageW = Math.max(1, stageWidth);
  const logicalPixelRatio = Math.min(4, Math.max(2, sourceWidth / safeStageW));
  return Math.min(10, logicalPixelRatio / Math.max(0.05, fitScale));
}
