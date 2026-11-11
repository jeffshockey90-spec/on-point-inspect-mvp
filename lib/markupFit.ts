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
 *
 * Note: this uses the FIT scale, not the user's zoom. Zoom/pan only move the
 * on-screen view; the export always re-reads the whole photo at fit size.
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

// ── Zoom / pan view transform ────────────────────────────────────────────────
// The on-screen view is the stage's { scale, x, y }. "Fit" is the resting view
// (whole photo centered). Pinch / wheel zoom in up to maxZoom× the fit scale,
// and drag pans — always kept inside bounds so the photo can't be lost.

export type StageView = { scale: number; x: number; y: number };

/** Largest the user can zoom in, as a multiple of the fit (whole-photo) scale. */
export const MAX_ZOOM_MULTIPLE = 8;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** The resting view: whole photo scaled to fit and centered in the viewport. */
export function fittedView(
  stageWidth: number,
  stageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): StageView {
  const { fitScale, renderWidth, renderHeight } = fitStageToViewport(
    stageWidth,
    stageHeight,
    viewportWidth,
    viewportHeight,
  );
  const vw = viewportWidth > 0 ? viewportWidth : renderWidth;
  const vh = viewportHeight > 0 ? viewportHeight : renderHeight;
  return {
    scale: fitScale,
    x: (vw - renderWidth) / 2,
    y: (vh - renderHeight) / 2,
  };
}

/**
 * Keep the view inside bounds: when the photo is smaller than the viewport on an
 * axis it stays centered; when it's larger (zoomed in) it can pan but not past
 * its own edges, so the photo can never be dragged completely off-screen.
 */
export function clampView(
  view: StageView,
  stageWidth: number,
  stageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): StageView {
  const contentW = stageWidth * view.scale;
  const contentH = stageHeight * view.scale;

  let x = view.x;
  let y = view.y;

  if (contentW <= viewportWidth) {
    x = (viewportWidth - contentW) / 2;
  } else {
    x = clamp(x, viewportWidth - contentW, 0);
  }

  if (contentH <= viewportHeight) {
    y = (viewportHeight - contentH) / 2;
  } else {
    y = clamp(y, viewportHeight - contentH, 0);
  }

  return { scale: view.scale, x, y };
}

/**
 * Zoom around a focal point (in viewport px) by `factor`, keeping the logical
 * point under the focus fixed. Scale is clamped to [minScale, maxScale]. The
 * caller should clampView() the result to re-bound the pan.
 */
export function zoomAround(
  view: StageView,
  focusX: number,
  focusY: number,
  factor: number,
  minScale: number,
  maxScale: number,
): StageView {
  const nextScale = clamp(view.scale * factor, minScale, maxScale);
  // Logical point currently under the focus.
  const logicalX = (focusX - view.x) / view.scale;
  const logicalY = (focusY - view.y) / view.scale;
  return {
    scale: nextScale,
    x: focusX - logicalX * nextScale,
    y: focusY - logicalY * nextScale,
  };
}
