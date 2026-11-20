import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveImage, saveVideo } = vi.hoisted(() => ({
  saveImage: vi.fn(async (_options: unknown) => ({ saved: true })),
  saveVideo: vi.fn(async (_options: unknown) => ({ saved: true })),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({ saveImage, saveVideo }),
}));

import {
  GalleryFileTooLargeError,
  MAX_BASE64_GALLERY_BYTES,
  saveFileToDeviceGallery,
  saveNativePathToDeviceGallery,
} from "./nativeGallery";

function fakeFile(size: number, type: string, name = "clip.mov") {
  return { size, type, name } as unknown as File;
}

describe("nativeGallery", () => {
  beforeEach(() => {
    saveImage.mockClear();
    saveVideo.mockClear();
  });

  it("sends only the path when a native path is given", async () => {
    const saved = await saveFileToDeviceGallery(
      fakeFile(MAX_BASE64_GALLERY_BYTES * 2, "video/quicktime"),
      { nativePath: "file:///tmp/opi-video.mov" },
    );
    expect(saved).toBe(true);
    expect(saveVideo).toHaveBeenCalledWith({
      path: "file:///tmp/opi-video.mov",
      fileName: "clip.mov",
      mimeType: "video/quicktime",
    });
  });

  it("routes images by path to saveImage", async () => {
    await saveNativePathToDeviceGallery("/tmp/a.jpg", "image/jpeg");
    expect(saveImage).toHaveBeenCalledWith({
      path: "/tmp/a.jpg",
      fileName: "a.jpg",
      mimeType: "image/jpeg",
    });
  });

  it("refuses oversized files on the base64 path instead of reading them", async () => {
    await expect(
      saveFileToDeviceGallery(
        fakeFile(MAX_BASE64_GALLERY_BYTES + 1, "video/mp4"),
      ),
    ).rejects.toBeInstanceOf(GalleryFileTooLargeError);
    expect(saveVideo).not.toHaveBeenCalled();
  });
});
