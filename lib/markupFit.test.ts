import { describe, it, expect } from "vitest";
import { fitStageToViewport, exportPixelRatioFor } from "./markupFit";

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
