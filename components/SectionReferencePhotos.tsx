"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PHOTO_BUCKET = "inspection-photos";

type ReferencePhoto = {
  id: string;
  inspection_id: string;
  section: string;
  caption?: string | null;
  file_path?: string | null;
  public_url?: string | null;
  signed_url?: string | null;
  created_at?: string | null;
};

export default function SectionReferencePhotos({
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadPhotos();
  }, [inspectionId, section]);

  async function loadPhotos() {
    if (!inspectionId || !section) return;

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

    const withSignedUrls = await Promise.all(
      (data || []).map(async (photo: ReferencePhoto) => {
        if (!photo.file_path) {
          return {
            ...photo,
            signed_url: photo.public_url || "",
          };
        }

        const { data: signedData } = await supabase.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(photo.file_path, 60 * 60 * 24 * 7);

        return {
          ...photo,
          signed_url: signedData?.signedUrl || photo.public_url || "",
        };
      })
    );

    setPhotos(withSignedUrls);
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file || !inspectionId || !section) return;

    if (!file.type.startsWith("image/")) {
      alert("Reference photos must be images.");
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop() || "jpg";
      const safeSection = section.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 50);
      const safeName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 40);

      const filePath = `${inspectionId}/reference-photos/${safeSection}/${Date.now()}-${crypto.randomUUID()}-${safeName}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(filePath);

      const { data, error } = await supabase
        .from("section_reference_photos")
        .insert({
          inspection_id: inspectionId,
          section,
          caption: caption.trim() || null,
          file_path: filePath,
          public_url: publicData.publicUrl,
        })
        .select("*")
        .single();

      if (error) throw error;

      const { data: signedData } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(filePath, 60 * 60 * 24 * 7);

      setPhotos((prev) => [
        ...prev,
        {
          ...data,
          signed_url: signedData?.signedUrl || publicData.publicUrl,
        },
      ]);

      setCaption("");
    } catch (error: any) {
      alert(error?.message || "Failed to upload reference photo.");
    } finally {
      setUploading(false);
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

      if (photo.file_path) {
        await supabase.storage.from(PHOTO_BUCKET).remove([photo.file_path]);
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

    if (files.length === 0) return;

    for (const file of files) {
      await uploadPhoto(file);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#071224]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-800/50"
      >
        <div>
          <h3 className="text-xl font-black text-cyan-300">
            Section Reference Photos
          </h3>

          <p className="mt-1 text-sm text-slate-400">
            {photos.length > 0
              ? `${photos.length} reference photo${photos.length === 1 ? "" : "s"} added`
              : "Add photos to this section without creating a defect"}
          </p>
        </div>

        <span className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-200">
          {open ? "Hide" : "Show"}
        </span>
      </button>

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
              These photos are for section documentation only. They are not findings,
              defects, repair request items, or severity-counted issues.
            </p>

            <input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Optional caption, example: Front elevation, Water heater location, Main panel overview..."
              className="mt-4 w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-cyan-400"
            />

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-cyan-500 bg-cyan-500/10 p-4 text-center font-black text-cyan-300 hover:bg-cyan-500 hover:text-slate-950">
                {uploading ? "Uploading..." : "📷 Take Photo"}
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

              <label className="cursor-pointer rounded-xl border border-teal-500 bg-teal-500/10 p-4 text-center font-black text-teal-300 hover:bg-teal-500 hover:text-slate-950">
                {uploading ? "Uploading..." : "🖼 Choose Photo"}
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
          </div>

          {photos.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-[#020617] p-5 text-slate-400">
              No reference photos added for this section yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((photo, index) => {
                const photoUrl = photo.signed_url || photo.public_url || "";
                const isDeleting = deletingId === photo.id;

                return (
                  <div
                    key={photo.id}
                    className="overflow-hidden rounded-xl border border-slate-700 bg-[#020617]"
                  >
                    {photoUrl ? (
                      <a href={photoUrl} target="_blank" rel="noreferrer">
                        <img
                          src={photoUrl}
                          alt={photo.caption || `Reference photo ${index + 1}`}
                          className="h-48 w-full object-cover transition hover:scale-[1.02]"
                        />
                      </a>
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
                        placeholder={`Reference photo ${index + 1}`}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                      />

                      <div className="flex flex-wrap justify-between gap-2 text-xs font-bold">
                        {photoUrl && (
                          <a
                            href={photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-slate-600 px-3 py-2 text-slate-200 hover:bg-slate-800"
                          >
                            Open
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => deletePhoto(photo)}
                          disabled={isDeleting}
                          className="rounded-lg border border-red-600 px-3 py-2 font-black text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
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
