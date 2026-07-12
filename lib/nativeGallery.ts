"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

type SaveMediaOptions = {
  dataUrl: string;
  fileName: string;
  mimeType: string;
};

type NativeGalleryPlugin = {
  saveImage(options: SaveMediaOptions): Promise<{ saved: boolean }>;
  saveVideo(options: SaveMediaOptions): Promise<{ saved: boolean }>;
};

const NativeGallery = registerPlugin<NativeGalleryPlugin>("NativeGallery");

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

export async function saveFileToDeviceGallery(file: File): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  const dataUrl = await fileToDataUrl(file);
  const options: SaveMediaOptions = {
    dataUrl,
    fileName: file.name || `on-point-${Date.now()}`,
    mimeType: file.type || "application/octet-stream",
  };

  const result = file.type.startsWith("video/")
    ? await NativeGallery.saveVideo(options)
    : await NativeGallery.saveImage(options);

  return Boolean(result?.saved);
}
