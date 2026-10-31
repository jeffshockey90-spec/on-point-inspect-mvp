import { describe, it, expect } from "vitest";
import { legacyImageMirrorsPhoto } from "./findingLegacyImage";

const PUB =
  "https://x.supabase.co/storage/v1/object/public/inspection-photos/144/finding-photos/2320/abc.jpg";
const PATH = "144/finding-photos/2320/abc.jpg";

describe("legacyImageMirrorsPhoto", () => {
  // Regression: a deleted washer photo kept showing on the client report
  // because findings.image_url still mirrored it after the photos row was gone.
  it("matches when image_url equals the deleted photo's public_url", () => {
    expect(
      legacyImageMirrorsPhoto({ image_url: PUB }, { public_url: PUB }),
    ).toBe(true);
  });

  it("matches when image_url is a signed URL containing the photo's file_path", () => {
    const signed = `${PUB}?token=abc123&expires=999`;
    expect(
      legacyImageMirrorsPhoto({ image_url: signed }, { file_path: PATH }),
    ).toBe(true);
  });

  it("does NOT match a different, genuinely-legacy image on the finding", () => {
    const otherImage =
      "https://x.supabase.co/storage/v1/object/public/inspection-photos/144/legacy/other.jpg";
    expect(
      legacyImageMirrorsPhoto(
        { image_url: otherImage },
        { public_url: PUB, file_path: PATH },
      ),
    ).toBe(false);
  });

  it("returns false when the finding has no legacy image_url", () => {
    expect(legacyImageMirrorsPhoto({ image_url: "" }, { public_url: PUB })).toBe(
      false,
    );
    expect(legacyImageMirrorsPhoto({}, { public_url: PUB })).toBe(false);
  });

  it("returns false when the photo has no usable url or path", () => {
    expect(legacyImageMirrorsPhoto({ image_url: PUB }, {})).toBe(false);
  });
});
