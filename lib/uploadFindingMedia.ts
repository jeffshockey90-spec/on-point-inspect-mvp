import { supabase } from "./supabaseClient";
import {
  createFullImageForUpload,
  createThumbnailForUpload,
} from "./imageVariants";
import { createVideoThumbnailForUpload } from "./videoThumbnail";

// Upload one photo/video for a finding (storage + a photos row linked to the
// finding), handling video conversion + thumbnails. Extracted from the report
// builder so the builder's Live Camera launcher can attach/combine media to an
// existing finding the same way. Quality params come from lib/imageVariants
// (1800px/0.8 full, 480px/0.7 thumb) — unchanged from the builder's own path.

const PHOTO_BUCKET = "inspection-photos";

export async function uploadFindingMediaFile(
  inspectionId: string,
  findingId: string,
  file: File,
): Promise<void> {
  let uploadFile = file;
  let thumbnailFile: File | null = null;
  let isVideo = false;

  if (file.type.startsWith("video/")) {
    isVideo = true;
    try {
      const formData = new FormData();
      formData.append("video", file);
      const response = await fetch("/api/video-convert", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error((await response.text().catch(() => "")) || "Video conversion failed");
      }
      const convertedBlob = await response.blob();
      if (!convertedBlob || convertedBlob.size === 0) {
        throw new Error("Video conversion returned an empty MP4.");
      }
      uploadFile = new File([convertedBlob], `video-${Date.now()}.mp4`, {
        type: "video/mp4",
      });
    } catch {
      // Fall back to the original so a video is never silently dropped.
      uploadFile = file;
    }
    thumbnailFile = await createVideoThumbnailForUpload(uploadFile).catch(() => null);
  } else {
    uploadFile = await createFullImageForUpload(file);
    thumbnailFile = await createThumbnailForUpload(file);
  }

  const fileExt = isVideo
    ? (uploadFile.name.split(".").pop() || uploadFile.type.split("/")[1] || "mp4")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 4) || "mp4"
    : "jpg";
  const safeName = uploadFile.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 50);

  const baseName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const filePath = `${inspectionId}/finding-photos/${findingId}/${baseName}.${fileExt}`;
  const thumbnailPath = `${inspectionId}/finding-photos/${findingId}/thumbnails/${baseName}-thumb.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(filePath, uploadFile, {
      cacheControl: "31536000",
      upsert: false,
      contentType: uploadFile.type || (isVideo ? "video/mp4" : "image/jpeg"),
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filePath);

  let thumbnailUrl = "";
  if (thumbnailFile) {
    const { error: thumbnailUploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(thumbnailPath, thumbnailFile, {
        cacheControl: "31536000",
        upsert: false,
        contentType: "image/jpeg",
      });
    if (!thumbnailUploadError) {
      const { data: thumbnailData } = supabase.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(thumbnailPath);
      thumbnailUrl = thumbnailData.publicUrl;
    }
  }

  const { error: insertError } = await supabase.from("photos").insert({
    inspection_id: inspectionId,
    finding_id: findingId,
    file_path: filePath,
    public_url: publicData.publicUrl,
    thumbnail_path: thumbnailUrl ? thumbnailPath : null,
    thumbnail_url: thumbnailUrl || null,
    is_video: isVideo,
    mime_type: uploadFile.type || (isVideo ? "video/mp4" : "image/jpeg"),
  });

  if (insertError) throw insertError;
}
