"use client";

export const REPORT_IMAGE_MAX_DIMENSION = 1800;
export const REPORT_IMAGE_QUALITY = 0.8;
export const REPORT_THUMBNAIL_MAX_DIMENSION = 480;
export const REPORT_THUMBNAIL_QUALITY = 0.7;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that photo. Try choosing a JPG photo."));
    };

    image.src = objectUrl;
  });
}

/**
 * Resizes an image File on-device (canvas + JPEG re-encode) before upload.
 * Non-image files pass through unchanged.
 */
export async function createImageVariantForUpload(
  file: File,
  maxDimension: number,
  quality: number,
  suffix: string,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const image = await loadImageFromFile(file);
    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;
    const longestSide = Math.max(originalWidth, originalHeight);
    const scale = Math.min(1, maxDimension / Math.max(1, longestSide));
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) return file;

    const originalName = String(file.name || "photo")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .slice(0, 50);

    return new File([blob], `${originalName}-${suffix}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export function createFullImageForUpload(file: File): Promise<File> {
  return createImageVariantForUpload(
    file,
    REPORT_IMAGE_MAX_DIMENSION,
    REPORT_IMAGE_QUALITY,
    "optimized",
  );
}

export function createThumbnailForUpload(file: File): Promise<File> {
  return createImageVariantForUpload(
    file,
    REPORT_THUMBNAIL_MAX_DIMENSION,
    REPORT_THUMBNAIL_QUALITY,
    "thumb",
  );
}
