import { describe, it, expect } from "vitest";
import {
  fitStageToViewport,
  exportPixelRatioFor,
  fittedView,
  clampView,
  zoomAround,
  MAX_ZOOM_MULTIPLE,
} from "./markupFit";

describe("fitStageToViewport", () => {
  it("scales a wide stage down to fit a narrow phone (the clipping bug)", () => {
    // 900×585 landscape stage on a ~390px-wide phone photo area.
    const fit = fitStageToViewport(900, 585, 390, 520);
    // The rendered photo must fit inside the viewport — no edge clipped off.
    expect(fit.renderWidth).toBeLessThanOrEqual(390);
    expect(fit.renderHeight).toBeLessThanOrEqual(520);
    expect(fit.fitScale).toBeLessThan(1);
    // Aspect ratio preserved.
    expect(fit.renderWidth / fit.renderHeight).toBeCloseTo(900 / 585, 1);
  });

  it("fits a tall portrait stage within a short viewport", () => {
    const fit = fitStageToViewport(525, 700, 390, 520);
    expect(fit.renderWidth).toBeLessThanOrEqual(390);
    expect(fit.renderHeight).toBeLessThanOrEqual(520);
    // Width is the binding constraint here: (390 - 16) / 525.
    expect(fit.fitScale).toBeCloseTo((390 - 16) / 525, 2);
  });

  it("never scales up on a large desktop (keeps native size)", () => {
    const fit = fitStageToViewport(900, 585, 1400, 800);
    expect(fit.fitScale).toBe(1);
    expect(fit.renderWidth).toBe(900);
    expect(fit.renderHeight).toBe(585);
  });

  it("returns fitScale 1 before the viewport is measured", () => {
    const fit = fitStageToViewport(900, 585, 0, 0);
    expect(fit.fitScale).toBe(1);
    expect(fit.renderWidth).toBe(900);
    expect(fit.renderHeight).toBe(585);
  });

  it("applies the edge padding", () => {
    // Exactly-fitting viewport plus padding on both sides -> fitScale 1.
    const fit = fitStageToViewport(900, 585, 900 + 16, 585 + 16, 8);
    expect(fit.fitScale).toBe(1);
  });
});

describe("exportPixelRatioFor", () => {
  it("is unchanged on desktop (fitScale 1) vs the old fixed formula", () => {
    // 4000px native photo, 900px logical stage, no fit shrink.
    expect(exportPixelRatioFor(4000, 900, 1)).toBeCloseTo(4, 5); // capped at 4
    expect(exportPixelRatioFor(1200, 900, 1)).toBeCloseTo(2, 5); // floored at 2
  });

  it("undoes the fit shrink so output matches a full-size stage", () => {
    const sourceWidth = 3600;
    const stageWidth = 900;
    const fitScale = 0.4;
    const ratio = exportPixelRatioFor(sourceWidth, stageWidth, fitScale);
    const renderWidth = stageWidth * fitScale; // on-screen stage px
    const outputWidth = renderWidth * ratio;
    const desktopOutput = stageWidth * exportPixelRatioFor(sourceWidth, stageWidth, 1);
    expect(outputWidth).toBeCloseTo(desktopOutput, 3);
  });

  it("caps the ratio so a tiny fitScale can't explode canvas memory", () => {
    expect(exportPixelRatioFor(8000, 900, 0.01)).toBeLessThanOrEqual(10);
  });
});

describe("fittedView", () => {
  it("centers the fitted photo in the viewport", () => {
    const fit = fitStageToViewport(900, 585, 390, 520);
    const v = fittedView(900, 585, 390, 520);
    expect(v.scale).toBeCloseTo(fit.fitScale, 5);
    expect(v.x).toBeCloseTo((390 - fit.renderWidth) / 2, 3);
    expect(v.y).toBeCloseTo((520 - fit.renderHeight) / 2, 3);
  });
});

describe("zoomAround + clampView", () => {
  const SW = 900;
  const SH = 585;
  const VW = 390;
  const VH = 520;
  const base = fittedView(SW, SH, VW, VH);
  const minScale = base.scale;
  const maxScale = base.scale * MAX_ZOOM_MULTIPLE;

  it("keeps the focal point fixed while zooming", () => {
    const focusX = 200;
    const focusY = 260;
    // Logical point under the focus before zoom.
    const lx = (focusX - base.x) / base.scale;
    const ly = (focusY - base.y) / base.scale;
    const zoomed = zoomAround(base, focusX, focusY, 2, minScale, maxScale);
    // Same logical point still sits under the focus after zoom.
    expect((focusX - zoomed.x) / zoomed.scale).toBeCloseTo(lx, 3);
    expect((focusY - zoomed.y) / zoomed.scale).toBeCloseTo(ly, 3);
    expect(zoomed.scale).toBeCloseTo(base.scale * 2, 5);
  });

  it("never zooms out past the fit scale or in past the max", () => {
    const out = zoomAround(base, VW / 2, VH / 2, 0.1, minScale, maxScale);
    expect(out.scale).toBeCloseTo(minScale, 5);
    const inToo = zoomAround(base, VW / 2, VH / 2, 100, minScale, maxScale);
    expect(inToo.scale).toBeCloseTo(maxScale, 5);
  });

  it("re-centers when the content is smaller than the viewport", () => {
    const clamped = clampView(base, SW, SH, VW, VH);
    // Fitted content is narrower-or-equal than the viewport on both axes.
    const contentW = SW * clamped.scale;
    expect(clamped.x).toBeCloseTo((VW - contentW) / 2, 3);
  });

  it("stops panning at the photo edges when zoomed in", () => {
    const zoomed = zoomAround(base, VW / 2, VH / 2, 3, minScale, maxScale);
    // Try to shove the photo far off to the right; clamp pulls it back so its
    // right edge can't cross into the viewport (x can't exceed 0).
    const shoved = { ...zoomed, x: 100000, y: 100000 };
    const clamped = clampView(shoved, SW, SH, VW, VH);
    expect(clamped.x).toBeLessThanOrEqual(0.001);
    expect(clamped.y).toBeLessThanOrEqual(0.001);
    // And can't pan the left/top edge inward past the viewport's far side.
    const shovedNeg = { ...zoomed, x: -100000, y: -100000 };
    const clampedNeg = clampView(shovedNeg, SW, SH, VW, VH);
    expect(clampedNeg.x).toBeCloseTo(VW - SW * zoomed.scale, 3);
    expect(clampedNeg.y).toBeCloseTo(VH - SH * zoomed.scale, 3);
  });
});
