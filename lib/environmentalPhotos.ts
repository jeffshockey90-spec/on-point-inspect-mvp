import { supabase } from "./supabaseClient";
import {
  createFullImageForUpload,
  createThumbnailForUpload,
} from "./imageVariants";

// Environmental report photos (Mold now; Radon later). Mirrors
// lib/sectionReferencePhotos.ts but grouped by `kind` instead of `section`.
// Stored in the shared inspection-photos bucket. See supabase/add-environmental-photos.sql.

const PHOTO_BUCKET = "inspection-photos";
const TABLE = "environmental_photos";

export type EnvironmentalPhotoKind = "mold" | "radon";

export type EnvironmentalPhotoRow = {
  id: string;
  inspection_id: string;
  kind: string;
  caption?: string | null;
  file_path?: string | null;
  public_url?: string | null;
  thumbnail_path?: string | null;
  thumbnail_url?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
  // Derived, not stored:
  signed_url?: string;
  signed_thumbnail_url?: string;
};

async function createSignedUrlMap(paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const signedMap: Record<string, string> = {};
  if (uniquePaths.length === 0) return signedMap;

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(uniquePaths, 60 * 60 * 24 * 7);

  if (error) {
    console.error("Environmental photo signed URL error:", error);
    return signedMap;
  }

  (data || []).forEach((item: any, index: number) => {
    const path = item?.path || uniquePaths[index];
    if (path && item?.signedUrl) signedMap[path] = item.signedUrl;
  });

  return signedMap;
}

// Load this inspection's environmental photos for one kind, newest-ordered,
// with signed display URLs resolved.
export async function loadEnvironmentalPhotos(
  inspectionId: string,
  kind: EnvironmentalPhotoKind = "mold",
): Promise<EnvironmentalPhotoRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("inspection_id", inspectionId)
    .eq("kind", kind)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Load environmental photos error:", error);
    return [];
  }

  const rows = (data || []) as EnvironmentalPhotoRow[];
  const paths: string[] = [];
  rows.forEach((r) => {
    if (r.file_path) paths.push(r.file_path);
    if (r.thumbnail_path) paths.push(r.thumbnail_path);
  });
  const signed = await createSignedUrlMap(paths);

  return rows.map((r) => ({
    ...r,
    signed_url: (r.file_path && signed[r.file_path]) || r.public_url || "",
    signed_thumbnail_url:
      (r.thumbnail_path && signed[r.thumbnail_path]) ||
      r.thumbnail_url ||
      (r.file_path && signed[r.file_path]) ||
      r.public_url ||
      "",
  }));
}

export async function uploadEnvironmentalPhoto({
  inspectionId,
  kind = "mold",
  file,
  caption,
}: {
  inspectionId: string;
  kind?: EnvironmentalPhotoKind;
  file: File;
  caption?: string;
}): Promise<EnvironmentalPhotoRow> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Environmental photos must be images.");
  }

  const uploadFile = await createFullImageForUpload(file);
  const thumbnailFile = await createThumbnailForUpload(file);

  const safeKind = String(kind).replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 20);
  const safeName = uploadFile.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 40);

  const baseName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const filePath = `${inspectionId}/environmental/${safeKind}/${baseName}.jpg`;
  const thumbnailPath = `${inspectionId}/environmental/${safeKind}/thumbnails/${baseName}-thumb.jpg`;

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
  const { error: thumbErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(thumbnailPath, thumbnailFile, {
      cacheControl: "31536000",
      upsert: false,
      contentType: "image/jpeg",
    });
  if (!thumbErr) {
    const { data: thumbData } = supabase.storage
      .from(PHOTO_BUCKET)
      .getPublicUrl(thumbnailPath);
    thumbnailUrl = thumbData.publicUrl;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      inspection_id: inspectionId,
      kind,
      caption: caption?.trim() || null,
      file_path: filePath,
      public_url: publicData.publicUrl,
      thumbnail_path: thumbnailUrl ? thumbnailPath : null,
      thumbnail_url: thumbnailUrl || null,
    })
    .select("*")
    .single();
  if (error) throw error;

  const [signedFull, signedThumb] = await Promise.all([
    createSignedUrlMap([filePath]),
    thumbnailUrl
      ? createSignedUrlMap([thumbnailPath])
      : Promise.resolve({} as Record<string, string>),
  ]);

  return {
    ...(data as EnvironmentalPhotoRow),
    signed_url: signedFull[filePath] || publicData.publicUrl,
    signed_thumbnail_url:
      signedThumb[thumbnailPath] ||
      thumbnailUrl ||
      signedFull[filePath] ||
      publicData.publicUrl,
  };
}

export async function updateEnvironmentalPhotoCaption(
  id: string,
  caption: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ caption: caption.trim() || null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteEnvironmentalPhoto(
  row: EnvironmentalPhotoRow,
): Promise<void> {
  const paths = [row.file_path, row.thumbnail_path].filter(Boolean) as string[];
  if (paths.length) {
    await supabase.storage.from(PHOTO_BUCKET).remove(paths).catch(() => {});
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", row.id);
  if (error) throw error;
}
