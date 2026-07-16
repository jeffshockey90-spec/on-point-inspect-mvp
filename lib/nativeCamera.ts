"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeCapturedMedia = {
  path: string;
  fileName: string;
  mimeType: string;
  mediaType: "photo" | "video";
  width?: number;
  height?: number;
  durationSeconds?: number;
};

type OpenNativeCameraOptions = {
  allowVideo?: boolean;
  autoSaveGallery?: boolean;
  preferredMode?: "photo" | "video";
};

type NativeCameraPlugin = {
  open(options: OpenNativeCameraOptions): Promise<{
    cancelled?: boolean;
    media: NativeCapturedMedia[];
  }>;
};

const NativeCamera = registerPlugin<NativeCameraPlugin>("NativeCamera");

export function nativeCameraAvailable() {
  return Capacitor.isNativePlatform();
}

async function nativePathToFile(item: NativeCapturedMedia): Promise<File> {
  const src = Capacitor.convertFileSrc(item.path);
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Could not read native ${item.mediaType}.`);
  }

  const blob = await response.blob();
  return new File([blob], item.fileName, {
    type: item.mimeType || blob.type || "application/octet-stream",
    lastModified: Date.now(),
  });
}

export async function openNativeFieldCamera(
  options: OpenNativeCameraOptions = {},
): Promise<File[]> {
  if (!nativeCameraAvailable()) return [];

  const result = await NativeCamera.open({
    allowVideo: options.allowVideo !== false,
    autoSaveGallery: options.autoSaveGallery !== false,
    preferredMode: options.preferredMode || "photo",
  });

  if (result?.cancelled || !Array.isArray(result?.media)) return [];

  return await Promise.all(result.media.map(nativePathToFile));
}
