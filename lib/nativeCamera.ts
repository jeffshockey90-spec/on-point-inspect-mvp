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
  muteAudio?: boolean;
};

type NativeCameraPlugin = {
  open(options: OpenNativeCameraOptions): Promise<{
    cancelled?: boolean;
    media: NativeCapturedMedia[];
  }>;
  readFileChunk(options: {
    path: string;
    offset: number;
    length: number;
  }): Promise<{
    base64: string;
    bytesRead: number;
    nextOffset: number;
    totalSize: number;
    eof: boolean;
  }>;
};

const NativeCamera = registerPlugin<NativeCameraPlugin>("NativeCamera");

export function nativeCameraAvailable() {
  return Capacitor.isNativePlatform();
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function nativePathToFile(item: NativeCapturedMedia): Promise<File> {
  const path = String(item.path || "").trim();

  if (!path) {
    throw new Error(`Native ${item.mediaType} did not include a file path.`);
  }

  const chunks: Uint8Array[] = [];
  const chunkSize = 1024 * 1024;
  let offset = 0;
  let expectedSize = 0;

  for (let chunkIndex = 0; chunkIndex < 1024; chunkIndex += 1) {
    const result = await NativeCamera.readFileChunk({
      path,
      offset,
      length: chunkSize,
    });

    expectedSize = Number(result.totalSize || expectedSize || 0);

    if (result.base64) {
      chunks.push(base64ToBytes(result.base64));
    }

    offset = Number(result.nextOffset || offset + Number(result.bytesRead || 0));

    if (result.eof) break;

    if (!result.bytesRead) {
      throw new Error(`Native ${item.mediaType} stopped reading unexpectedly.`);
    }
  }

  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

  if (!totalBytes) {
    throw new Error(`Native ${item.mediaType} was empty.`);
  }

  if (expectedSize > 0 && totalBytes < expectedSize) {
    throw new Error(
      `Native ${item.mediaType} was only partially transferred (${totalBytes} of ${expectedSize} bytes).`,
    );
  }

  const mergedBuffer = new ArrayBuffer(totalBytes);
const mergedBytes = new Uint8Array(mergedBuffer);

let writeOffset = 0;

for (const chunk of chunks) {
  mergedBytes.set(chunk, writeOffset);
  writeOffset += chunk.byteLength;
}

const blob = new Blob([mergedBuffer], {
  type: item.mimeType || "application/octet-stream",
});

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
    muteAudio: options.muteAudio === true,
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
