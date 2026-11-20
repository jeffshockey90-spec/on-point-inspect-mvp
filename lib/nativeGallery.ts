"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

type SaveMediaOptions =
  | {
      dataUrl: string;
      fileName: string;
      mimeType: string;
    }
  | {
      // Native file path or file:// URL (e.g. NativeCamera's `path`). The plugin
      // hands it straight to Photos, so nothing large crosses the bridge.
      path: string;
      fileName: string;
      mimeType: string;
    };

type NativeGalleryPlugin = {
  saveImage(options: SaveMediaOptions): Promise<{ saved: boolean }>;
  saveVideo(options: SaveMediaOptions): Promise<{ saved: boolean }>;
};

const NativeGallery = registerPlugin<NativeGalleryPlugin>("NativeGallery");

// The base64 path holds the whole file (plus ~33% overhead) in the web view
// and again in native memory, so large videos run the app out of memory.
// Anything bigger must be saved by native path instead.
export const MAX_BASE64_GALLERY_BYTES = 150 * 1024 * 1024;

export class GalleryFileTooLargeError extends Error {
  constructor(size: number) {
    super(
      `This file is too large to save to Photos from here (${Math.round(
        size / (1024 * 1024),
      )} MB; limit ${MAX_BASE64_GALLERY_BYTES / (1024 * 1024)} MB).`,
    );
    this.name = "GalleryFileTooLargeError";
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unable to read media file."));

    reader.onerror = () =>
      reject(reader.error || new Error("Unable to read media file."));

    reader.readAsDataURL(file);
  });
}

function isVideoMime(mimeType: string) {
  return mimeType.startsWith("video/");
}

/**
 * Save a file that already exists on the device (a native path or file:// URL,
 * such as the `path` the native camera returns) without copying it over the
 * bridge.
 */
export async function saveNativePathToDeviceGallery(
  path: string,
  mimeType: string,
  fileName?: string,
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  const options: SaveMediaOptions = {
    path,
    fileName: fileName || path.split("/").pop() || `on-point-${Date.now()}`,
    mimeType: mimeType || "application/octet-stream",
  };

  const result = isVideoMime(options.mimeType)
    ? await NativeGallery.saveVideo(options)
    : await NativeGallery.saveImage(options);

  return Boolean(result?.saved);
}

export async function saveFileToDeviceGallery(
  file: File,
  opts: { nativePath?: string } = {},
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  if (opts.nativePath) {
    return await saveNativePathToDeviceGallery(
      opts.nativePath,
      file.type,
      file.name,
    );
  }

  if (file.size > MAX_BASE64_GALLERY_BYTES) {
    throw new GalleryFileTooLargeError(file.size);
  }

  const dataUrl = await fileToDataUrl(file);
  const options: SaveMediaOptions = {
    dataUrl,
    fileName: file.name || `on-point-${Date.now()}`,
    mimeType: file.type || "application/octet-stream",
  };

  const result = isVideoMime(file.type)
    ? await NativeGallery.saveVideo(options)
    : await NativeGallery.saveImage(options);

  return Boolean(result?.saved);
}
