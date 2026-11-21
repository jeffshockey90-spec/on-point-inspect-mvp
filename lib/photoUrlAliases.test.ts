import { describe, expect, it } from "vitest";
import { groupedFindingsWithPhotoAliases, withPhotoUrlAliases } from "./photoUrlAliases";

describe("withPhotoUrlAliases", () => {
  it("rebuilds every alias the report components read from the two sent keys", () => {
    const p = withPhotoUrlAliases({ id: 1, signed_url: "FULL", signed_thumbnail_url: "THUMB" });
    expect(p).toMatchObject({
      signed_url: "FULL",
      signedUrl: "FULL",
      signed_video_url: "FULL",
      signedVideoUrl: "FULL",
      signed_thumbnail_url: "THUMB",
      signedThumbnailUrl: "THUMB",
    });
  });

  it("keeps a different value already on the photo", () => {
    const p = withPhotoUrlAliases({ signed_url: "FULL", signed_video_url: "MP4", signed_thumbnail_url: "T" });
    expect(p.signed_video_url).toBe("MP4");
    expect(p.signedVideoUrl).toBe("FULL");
  });

  it("applies to every finding's photos in grouped findings, leaving others alone", () => {
    const out = groupedFindingsWithPhotoAliases([
      { section: "Roof", findings: [{ id: 1, photos: [{ signed_url: "A", signed_thumbnail_url: "a" }] }, { id: 2 }] },
    ]);
    expect(out[0].findings[0].photos[0].signedUrl).toBe("A");
    expect(out[0].findings[1]).toEqual({ id: 2 });
    expect(groupedFindingsWithPhotoAliases(null)).toEqual([]);
  });
});
