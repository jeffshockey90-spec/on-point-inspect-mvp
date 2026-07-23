import { supabase } from "./supabaseClient";
import {
  createFullImageForUpload,
  createThumbnailForUpload,
} from "./imageVariants";

const PHOTO_BUCKET = "inspection-photos";

export type SectionReferencePhotoRow = {
  id: string;
  inspection_id: string;
  section: string;
  caption?: string | null;
  file_path?: string | null;
  public_url?: string | null;
  thumbnail_path?: string | null;
  thumbnail_url?: string | null;
  created_at?: string | null;
};

async function createSignedUrlMap(paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const signedMap: Record<string, string> = {};

  if (uniquePaths.length === 0) return signedMap;

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(uniquePaths, 60 * 60 * 24 * 7);

  if (error) {
    console.error("Reference photo signed URL error:", error);
    return signedMap;
  }

  (data || []).forEach((item: any, index: number) => {
    const path = item?.path || uniquePaths[index];
    if (path && item?.signedUrl) signedMap[path] = item.signedUrl;
  });

  return signedMap;
}

export async function uploadSectionReferencePhoto({
  inspectionId,
  section,
  file,
  caption,
}: {
  inspectionId: string;
  section: string;
  file: File;
  caption?: string;
}): Promise<{
  row: SectionReferencePhotoRow;
  signedUrl: string;
  signedThumbnailUrl: string;
}> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Reference photos must be images.");
  }

  const uploadFile = await createFullImageForUpload(file);
  const thumbnailFile = await createThumbnailForUpload(file);

  const fileExt = "jpg";
  const safeSection = section.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 50);
  const safeName = uploadFile.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 40);

  const baseName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const filePath = `${inspectionId}/reference-photos/${safeSection}/${baseName}.${fileExt}`;
  const thumbnailPath = `${inspectionId}/reference-photos/${safeSection}/thumbnails/${baseName}-thumb.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(filePath, uploadFile, {
      cacheControl: "31536000",
      upsert: false,
      contentType: uploadFile.type || "image/jpeg",
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(filePath);

  let thumbnailUrl = "";

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

  const { data, error } = await supabase
    .from("section_reference_photos")
    .insert({
      inspection_id: inspectionId,
      section,
      caption: caption?.trim() || null,
      file_path: filePath,
      public_url: publicData.publicUrl,
      thumbnail_path: thumbnailUrl ? thumbnailPath : null,
      thumbnail_url: thumbnailUrl || null,
    })
    .select("*")
    .single();

  if (error) throw error;

  const [signedFullMap, signedThumbnailMap] = await Promise.all([
    createSignedUrlMap([filePath]),
    thumbnailUrl
      ? createSignedUrlMap([thumbnailPath])
      : Promise.resolve({} as Record<string, string>),
  ]);

  return {
    row: {
      ...data,
      thumbnail_path: thumbnailUrl ? thumbnailPath : null,
      thumbnail_url: thumbnailUrl || null,
    },
    signedUrl: signedFullMap[filePath] || publicData.publicUrl,
    signedThumbnailUrl:
      signedThumbnailMap[thumbnailPath] ||
      thumbnailUrl ||
      signedFullMap[filePath] ||
      publicData.publicUrl,
  };
}
