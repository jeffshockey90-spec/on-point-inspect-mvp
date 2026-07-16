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
  const rawPath = String(item.path || "").trim();

  if (!rawPath) {
    throw new Error(`Native ${item.mediaType} did not include a file path.`);
  }

  const pathWithoutScheme = rawPath.replace(/^file:\/\//i, "");
  const candidates = Array.from(
    new Set(
      [
        Capacitor.convertFileSrc(rawPath),
        Capacitor.convertFileSrc(pathWithoutScheme),
        rawPath,
      ].filter(Boolean),
    ),
  );

  let lastError = "";

  for (const src of candidates) {
    try {
      const response = await fetch(src);

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }

      const blob = await response.blob();

      if (!blob.size) {
        lastError = "The native file was empty.";
        continue;
      }

      return new File([blob], item.fileName, {
        type: item.mimeType || blob.type || "application/octet-stream",
        lastModified: Date.now(),
      });
    } catch (error: any) {
      lastError = error?.message || "File read failed.";
    }
  }

  throw new Error(
    `Could not read native ${item.mediaType}. ${lastError}`.trim(),
  );
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

  const settled = await Promise.allSettled(
    result.media.map(nativePathToFile),
  );

  const files = settled.flatMap((entry) =>
    entry.status === "fulfilled" ? [entry.value] : [],
  );

  if (files.length > 0) return files;

  const firstFailure = settled.find(
    (entry): entry is PromiseRejectedResult => entry.status === "rejected",
  );

  if (firstFailure) {
    throw firstFailure.reason;
  }

  return [];
}
