import { describe, expect, it } from "vitest";
import { captureSourceRect, shouldFillPreview } from "./cameraFrame";

// Portrait 9:16 camera frame, as iOS delivers 1920x1080 in portrait.
const VW = 1080;
const VH = 1920;

describe("shouldFillPreview", () => {
  it("keeps the whole frame on a normal (taller) phone screen", () => {
    expect(shouldFillPreview(VW, VH, 393, 852)).toBe(false);
  });

  it("fills on the folded iPhone Duo, which is wider than the frame", () => {
    expect(shouldFillPreview(VW, VH, 466, 678)).toBe(true);
  });

  it("fills a portrait screen fed a landscape frame (Duo inner screen held upright)", () => {
    expect(shouldFillPreview(1920, 1080, 626, 890)).toBe(true);
  });

  it("keeps the whole frame for a landscape frame on a landscape screen", () => {
    expect(shouldFillPreview(1920, 1080, 890, 626)).toBe(false);
  });

  it("does not flip to fill for a near-identical aspect ratio", () => {
    expect(shouldFillPreview(VW, VH, 1080, 1915)).toBe(false);
  });

  it("is safe before the video has dimensions", () => {
    expect(shouldFillPreview(0, 0, 466, 678)).toBe(false);
    expect(captureSourceRect(0, 0, 466, 678)).toMatchObject({ fill: false });
  });
});

describe("captureSourceRect", () => {
  it("captures the full frame when the whole frame is shown", () => {
    expect(captureSourceRect(VW, VH, 393, 852)).toEqual({ fill: false, sx: 0, sy: 0, sw: VW, sh: VH });
  });

  it("crops top and bottom to exactly the visible band when filling", () => {
    const r = captureSourceRect(VW, VH, 466, 678);
    expect(r.fill).toBe(true);
    expect(r.sw).toBe(VW);
    // Saved photo has the screen's aspect ratio...
    expect(r.sw / r.sh).toBeCloseTo(466 / 678, 6);
    // ...centred vertically, inside the frame.
    expect(r.sy).toBeCloseTo((VH - r.sh) / 2, 6);
    expect(r.sy).toBeGreaterThan(0);
  });

  it("crops the SIDES to the visible band for a landscape frame on a portrait screen", () => {
    const r = captureSourceRect(1920, 1080, 626, 890);
    expect(r.fill).toBe(true);
    expect(r.sh).toBe(1080);
    expect(r.sw / r.sh).toBeCloseTo(626 / 890, 6);
    expect(r.sx).toBeCloseTo((1920 - r.sw) / 2, 6);
    expect(r.sy).toBe(0);
  });

  it("applies software zoom about the centre, on top of the fill crop", () => {
    const base = captureSourceRect(VW, VH, 466, 678);
    const zoomed = captureSourceRect(VW, VH, 466, 678, 2);
    expect(zoomed.sw).toBeCloseTo(base.sw / 2, 6);
    expect(zoomed.sh).toBeCloseTo(base.sh / 2, 6);
    expect(zoomed.sx).toBeCloseTo((VW - zoomed.sw) / 2, 6);
    expect(zoomed.sy).toBeCloseTo((VH - zoomed.sh) / 2, 6);
  });

  it("matches the old zoom behaviour when not filling", () => {
    expect(captureSourceRect(VW, VH, 393, 852, 2)).toEqual({
      fill: false,
      sx: VW / 4,
      sy: VH / 4,
      sw: VW / 2,
      sh: VH / 2,
    });
  });
});
