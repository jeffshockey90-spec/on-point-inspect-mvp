"use client";

import { memo, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { isNativeApp, takeNativePhotoSavedToGallery } from "../lib/nativePhoto";
import ExpandableReportImage from "./ExpandableReportImage";

const PHOTO_BUCKET = "inspection-photos";

type ReferencePhoto = {
  id: string;
  inspection_id: string;
  section: string;
  caption?: string | null;
  file_path?: string | null;
  public_url?: string | null;
  signed_url?: string | null;
  thumbnail_path?: string | null;
  thumbnail_url?: string | null;
  signed_thumbnail_url?: string | null;
  created_at?: string | null;
};

async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read image file."));
    };

    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = dataUrl;
  });
}

async function createImageVariantForUpload(
  file: File,
  maxDimension: number,
  quality: number,
  suffix: string
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const originalDataUrl = await readFileAsDataUrl(file);
    const image = await loadImageFromDataUrl(originalDataUrl);

    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;

    const scale = Math.min(
      1,
      maxDimension / Math.max(originalWidth, originalHeight)
    );
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) return file;

    const originalName = file.name.replace(/\.[^/.]+$/, "");
    return new File([blob], `${originalName}-${suffix}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

async function createFullImageForUpload(file: File): Promise<File> {
  return createImageVariantForUpload(file, 1800, 0.8, "optimized");
}

async function createThumbnailForUpload(file: File): Promise<File> {
  return createImageVariantForUpload(file, 480, 0.7, "thumb");
}

function SmallSpinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

async function createSignedUrlMap(paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const signedMap: Record<string, string> = {};

  if (uniquePaths.length === 0) return signedMap;

  const chunkSize = 50;

  await Promise.all(
    Array.from({ length: Math.ceil(uniquePaths.length / chunkSize) }).map(
      async (_, chunkIndex) => {
        const chunk = uniquePaths.slice(
          chunkIndex * chunkSize,
          chunkIndex * chunkSize + chunkSize,
        );

        const { data, error } = await supabase.storage
          .from(PHOTO_BUCKET)
          .createSignedUrls(chunk, 60 * 60 * 24 * 7);

        if (error) {
          console.error("Reference photo batch signed URL error:", error);
          return;
        }

        (data || []).forEach((item: any, index: number) => {
          const path = item?.path || chunk[index];

          if (path && item?.signedUrl) {
            signedMap[path] = item.signedUrl;
          }
        });
      },
    ),
  );

  return signedMap;
}

function SectionReferencePhotos({
  inspectionId,
  section,
}: {
  inspectionId: string;
  section: string;
}) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<ReferencePhoto[]>([]);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("Uploading...");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [draggingOver, setDraggingOver] = useState(false);

  useEffect(() => {
    loadPhotos();
  }, [inspectionId, section]);

  async function loadPhotos() {
    if (!inspectionId || !section) return;

    setLoadingPhotos(true);

    try {
      const { data, error } = await supabase
        .from("section_reference_photos")
        .select("*")
        .eq("inspection_id", inspectionId)
        .eq("section", section)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load section reference photos:", error);
        return;
      }

      const rows = data || [];
      const fullPaths = rows.map((photo: ReferencePhoto) => photo.file_path || "").filter(Boolean);
      const thumbnailPaths = rows.map((photo: ReferencePhoto) => photo.thumbnail_path || "").filter(Boolean);

      const [signedFullMap, signedThumbnailMap] = await Promise.all([
        createSignedUrlMap(fullPaths),
        createSignedUrlMap(thumbnailPaths),
      ]);

      const withSignedUrls = rows.map((photo: ReferencePhoto) => ({
        ...photo,
        signed_url:
          (photo.file_path && signedFullMap[photo.file_path]) ||
          photo.signed_url ||
          photo.public_url ||
          "",
        signed_thumbnail_url:
          (photo.thumbnail_path && signedThumbnailMap[photo.thumbnail_path]) ||
          photo.thumbnail_url ||
          (photo.file_path && signedFullMap[photo.file_path]) ||
          photo.signed_url ||
          photo.public_url ||
          "",
      }));

      setPhotos(withSignedUrls);
    } finally {
      setLoadingPhotos(false);
    }
  }

  async function uploadPhoto(file: File | undefined, savedToGallery = false) {
    if (!file || !inspectionId || !section) return;

    if (!file.type.startsWith("image/")) {
      alert("Reference photos must be images.");
      return;
    }

    setUploading(true);
    setUploadLabel(savedToGallery ? "Saving Gallery Photo..." : "Preparing Photo...");

    try {
      const uploadFile = await createFullImageForUpload(file);
      setUploadLabel("Creating Thumbnail...");
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

      setUploadLabel("Uploading Photo...");

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

      setUploadLabel("Uploading Thumbnail...");

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

      setUploadLabel("Saving Reference Photo...");

      const { data, error } = await supabase
        .from("section_reference_photos")
        .insert({
          inspection_id: inspectionId,
          section,
          caption: caption.trim() || null,
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
        thumbnailUrl ? createSignedUrlMap([thumbnailPath]) : Promise.resolve({} as Record<string, string>),
      ]);

      setPhotos((prev) => [
        ...prev,
        {
          ...data,
          signed_url: signedFullMap[filePath] || publicData.publicUrl,
          signed_thumbnail_url:
            signedThumbnailMap[thumbnailPath] ||
            thumbnailUrl ||
            signedFullMap[filePath] ||
            publicData.publicUrl,
          thumbnail_path: thumbnailUrl ? thumbnailPath : null,
          thumbnail_url: thumbnailUrl || null,
        },
      ]);

      setCaption("");
      setUploadLabel(savedToGallery ? "Saved to Gallery + Uploaded!" : "Uploaded!");
    } catch (error: any) {
      setUploadLabel("Failed");
      alert(error?.message || "Failed to upload reference photo.");
    } finally {
      window.setTimeout(() => {
        setUploading(false);
        setUploadLabel("Uploading...");
      }, 700);
    }
  }

  async function takeNativeReferencePhoto() {
    if (uploading) return;

    setUploading(true);
    setUploadLabel("Opening Camera...");

    try {
      const file = await takeNativePhotoSavedToGallery();

      if (!file) {
        setUploadLabel("No Photo Selected");
        return;
      }

      setUploading(false);
      await uploadPhoto(file, true);
    } catch (error: any) {
      setUploadLabel("Failed");
      alert(error?.message || "Camera failed.");
    } finally {
      window.setTimeout(() => {
        setUploading(false);
        setUploadLabel("Uploading...");
      }, 700);
    }
  }

  async function updateCaption(photo: ReferencePhoto, nextCaption: string) {
    setPhotos((prev) =>
      prev.map((item) =>
        item.id === photo.id ? { ...item, caption: nextCaption } : item
      )
    );

    const { error } = await supabase
      .from("section_reference_photos")
      .update({
        caption: nextCaption.trim() || null,
      })
      .eq("id", photo.id)
      .eq("inspection_id", inspectionId);

    if (error) {
      alert(error.message || "Failed to update caption.");
      await loadPhotos();
    }
  }

  async function deletePhoto(photo: ReferencePhoto) {
    if (deletingId) return;

    const confirmed = window.confirm("Delete this section reference photo?");

    if (!confirmed) return;

    setDeletingId(photo.id);

    try {
      const { error } = await supabase
        .from("section_reference_photos")
        .delete()
        .eq("id", photo.id)
        .eq("inspection_id", inspectionId);

      if (error) throw error;

      const pathsToRemove = [photo.file_path, photo.thumbnail_path].filter(
        Boolean
      ) as string[];

      if (pathsToRemove.length > 0) {
        await supabase.storage.from(PHOTO_BUCKET).remove(pathsToRemove);
      }

      setPhotos((prev) => prev.filter((item) => item.id !== photo.id));
    } catch (error: any) {
      alert(error?.message || "Failed to delete reference photo.");
    } finally {
      setDeletingId(null);
    }
  }

  async function uploadSelectedPhotos(fileList: FileList | null) {
    const files = Array.from(fileList || []);

    if (files.length === 0 || uploading) return;

    for (const file of files) {
      await uploadPhoto(file);
    }
  }

  async function handleReferenceDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingOver(false);

    if (uploading) return;

    const files = event.dataTransfer?.files || null;
    await uploadSelectedPhotos(files);
    setOpen(true);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!uploading) setDraggingOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDraggingOver(false);
      }}
      onDrop={handleReferenceDrop}
      className={`rounded-2xl border bg-[#071224] transition ${
        draggingOver
          ? "border-cyan-400 ring-2 ring-cyan-400/40"
          : "border-slate-700"
      }`}
    >
      <div className="flex w-full flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="min-w-0 flex-1 text-left transition active:scale-[0.99] [touch-action:manipulation]"
        >
          <h3 className="text-xl font-black text-cyan-300">
            Section Reference Photos
          </h3>

          <p className="mt-1 text-sm text-slate-400">
            {draggingOver
              ? "Drop photos here to add them to this section"
              : loadingPhotos
                ? "Loading reference photos..."
                : photos.length > 0
                  ? `${photos.length} reference photo${
                      photos.length === 1 ? "" : "s"
                    } added`
                  : "Add photos to this section without creating a defect"}
          </p>
        </button>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <label
            className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-500 px-4 py-2 text-sm font-black text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500 hover:text-slate-950 [touch-action:manipulation] ${
              uploading ? "cursor-not-allowed opacity-60" : ""
            }`}
          >
            {uploading && <SmallSpinner />}
            {uploading ? uploadLabel : "➕ Add Photo"}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              onChange={async (event) => {
                await uploadSelectedPhotos(event.target.files);
                event.currentTarget.value = "";
                setOpen(true);
              }}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-200 transition active:scale-[0.98] hover:bg-slate-800 [touch-action:manipulation]"
          >
            {loadingPhotos && <SmallSpinner />}
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {photos.length > 0 && !open && (
        <div className="border-t border-slate-700 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {photos.slice(0, 6).map((photo, index) => (
              <span
                key={photo.id}
                className="rounded-full border border-cyan-500/60 bg-cyan-500/10 px-3 py-1 text-sm font-bold text-cyan-200"
              >
                {photo.caption || `Reference Photo ${index + 1}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-5 border-t border-slate-700 p-5">
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Add Reference Photo
            </p>

            <p className="mt-1 text-sm text-slate-300">
              These photos are for section documentation only. They are not
              findings, defects, repair request items, or severity-counted issues.
              You can also drag and drop photos onto this panel.
            </p>

            <input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              disabled={uploading}
              placeholder="Optional caption, example: Front elevation, Water heater location, Main panel overview..."
              className="mt-4 w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {isNativeApp() && (
                <button
                  type="button"
                  onClick={takeNativeReferencePhoto}
                  disabled={uploading}
                  className="rounded-xl border border-emerald-500 bg-emerald-500/10 p-4 text-center font-black text-emerald-300 transition active:scale-[0.98] hover:bg-emerald-500 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {uploading && <SmallSpinner />}
                    {uploading ? uploadLabel : "📷 Take + Save Gallery"}
                  </span>
                </button>
              )}

              <label
                className={`rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-center font-black text-cyan-300 transition active:scale-[0.98] hover:bg-cyan-500 hover:text-slate-950 [touch-action:manipulation] ${
                  uploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                }`}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {uploading && <SmallSpinner />}
                  {uploading ? uploadLabel : "📷 Take Photo"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  disabled={uploading}
                  onChange={async (event) => {
                    await uploadSelectedPhotos(event.target.files);
                    event.currentTarget.value = "";
                  }}
                  className="hidden"
                />
              </label>

              <label
                className={`rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-black text-teal-300 transition active:scale-[0.98] hover:bg-teal-500 hover:text-slate-950 [touch-action:manipulation] ${
                  uploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                }`}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {uploading && <SmallSpinner />}
                  {uploading ? uploadLabel : "🖼 Choose Photo"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  onChange={async (event) => {
                    await uploadSelectedPhotos(event.target.files);
                    event.currentTarget.value = "";
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {isNativeApp() && (
              <p className="mt-3 text-xs text-slate-400">
                Use “Take + Save Gallery” to save a copy to the device Photos app.
              </p>
            )}
          </div>

          {photos.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-[#020617] p-5 text-slate-400">
              No reference photos added for this section yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((photo, index) => {
                const previewUrl =
                  photo.signed_thumbnail_url ||
                  photo.thumbnail_url ||
                  photo.signed_url ||
                  photo.public_url ||
                  "";
                const fullUrl = photo.signed_url || photo.public_url || previewUrl;
                const isDeleting = deletingId === photo.id;

                return (
                  <div
                    key={photo.id}
                    className="overflow-hidden rounded-xl border border-slate-700 bg-[#020617]"
                  >
                    {previewUrl ? (
                      <ExpandableReportImage
                        src={previewUrl}
                        fullSrc={fullUrl}
                        alt={photo.caption || `Reference photo ${index + 1}`}
                        className="h-48 w-full object-cover transition hover:scale-[1.02]"
                        buttonClassName="block w-full overflow-hidden bg-black text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                        badgeText="Tap to enlarge"
                      />
                    ) : (
                      <div className="flex h-48 items-center justify-center bg-slate-950 text-slate-500">
                        No preview
                      </div>
                    )}

                    <div className="space-y-3 border-t border-slate-800 p-3">
                      <input
                        value={photo.caption || ""}
                        onChange={(event) =>
                          updateCaption(photo, event.target.value)
                        }
                        disabled={isDeleting || uploading}
                        placeholder={`Reference photo ${index + 1}`}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />

                      <div className="flex flex-wrap justify-between gap-2 text-xs font-bold">
                        {previewUrl && (
                          <span className="rounded-lg border border-slate-600 px-3 py-2 text-slate-200">
                            Tap photo to expand
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => deletePhoto(photo)}
                          disabled={isDeleting || uploading}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-600 px-3 py-2 font-black text-red-300 transition active:scale-[0.98] hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
                        >
                          {isDeleting && <SmallSpinner />}
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(SectionReferencePhotos);
