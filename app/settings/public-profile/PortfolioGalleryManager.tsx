"use client";

import { useMemo, useRef, useState } from "react";

type PortfolioImage = {
  id: string;
  image_url: string;
  title?: string | null;
  caption?: string | null;
  category?: string | null;
  display_order?: number | null;
  is_featured?: boolean | null;
  is_enabled?: boolean | null;
};

const categories = [
  "Exterior",
  "Roof",
  "Electrical",
  "HVAC",
  "Plumbing",
  "Interior",
  "Attic",
  "Crawlspace",
  "Foundation",
  "General",
];

function cleanText(value: any) {
  return String(value || "").trim();
}

export default function PortfolioGalleryManager({
  initialImages = [],
}: {
  initialImages?: PortfolioImage[];
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [images, setImages] = useState<PortfolioImage[]>(initialImages || []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState("Exterior");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const enabledImages = useMemo(
    () => images.filter((image) => image.is_enabled !== false),
    [images],
  );

  function chooseFile(file?: File | null) {
    setError("");
    setMessage("");

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setError("Please choose an image smaller than 12 MB.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));

    if (!title.trim()) {
      const fallbackTitle = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]+/g, " ")
        .trim();
      setTitle(fallbackTitle);
    }
  }

  async function addImage() {
    if (saving) return;

    if (!selectedFile) {
      setError("Choose a photo from your device before adding it to the gallery.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      formData.append("title", title);
      formData.append("caption", caption);
      formData.append("category", category);
      formData.append("displayOrder", String(images.length));
      formData.append("isEnabled", "true");

      const res = await fetch("/api/public-profile-gallery", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to add portfolio image.");

      setImages(data.images || []);
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
      setTitle("");
      setCaption("");
      setCategory("Exterior");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage("Portfolio photo uploaded and added to your public profile.");
    } catch (err: any) {
      setError(err?.message || "Unable to add portfolio image.");
    } finally {
      setSaving(false);
    }
  }

  async function updateImage(id: string, updates: Partial<PortfolioImage>) {
    if (!id || saving) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/public-profile-gallery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to update gallery image.");

      setImages(data.images || []);
      setMessage("Gallery image updated.");
    } catch (err: any) {
      setError(err?.message || "Unable to update gallery image.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteImage(id: string) {
    if (!id || saving) return;
    const confirmed = window.confirm("Remove this image from your public portfolio gallery?");
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch(`/api/public-profile-gallery?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to delete gallery image.");

      setImages(data.images || []);
      setMessage("Portfolio image removed.");
    } catch (err: any) {
      setError(err?.message || "Unable to delete gallery image.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[var(--fl-surface)] via-[var(--fl-surface)] to-emerald-950/10 p-5 shadow-xl sm:p-6 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-good-text)]">
            Portfolio Gallery
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--fl-text)]">
            Show off your inspection work
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
            Add polished portfolio photos that appear on your public inspector profile. Use this for roof shots, exterior details, drone photos, major systems, or impressive homes you are allowed to showcase.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-center">
          <p className="text-2xl font-semibold text-[var(--fl-good-text)]">{enabledImages.length}</p>
          <p className="text-xs font-bold text-[var(--fl-muted)]">Visible Photos</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-good-text)]">
            Add Photo
          </p>

          <div className="mt-4 grid gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                chooseFile(event.dataTransfer.files?.[0]);
              }}
              className={`group overflow-hidden rounded-2xl border border-dashed p-5 text-center transition active:scale-[0.99] [touch-action:manipulation] ${
                dragging
                  ? "border-emerald-300 bg-emerald-400/15"
                  : "border-emerald-500/50 bg-emerald-500/10 hover:border-emerald-300 hover:bg-emerald-500/15"
              }`}
            >
              {previewUrl ? (
                <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:text-left">
                  <img
                    src={previewUrl}
                    alt="Selected portfolio preview"
                    className="mx-auto h-36 w-full max-w-[220px] rounded-2xl border border-[var(--fl-line)] object-cover sm:mx-0"
                  />
                  <div className="flex flex-col justify-center">
                    <p className="text-lg font-semibold text-[var(--fl-text)]">Photo selected</p>
                    <p className="mt-2 break-words text-sm text-[var(--fl-muted)]">
                      {selectedFile?.name}
                    </p>
                    <p className="mt-3 text-xs font-bold text-[var(--fl-good-text)]">
                      Click here to choose a different photo.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-6">
                  <p className="text-4xl">📸</p>
                  <h3 className="mt-3 text-xl font-semibold text-[var(--fl-text)]">
                    Upload Portfolio Photo
                  </h3>
                  <p className="mt-2 text-sm font-bold text-[var(--fl-muted)]">
                    Click to choose a photo or drag and drop one here.
                  </p>
                  <p className="mt-2 text-xs text-[var(--fl-faint)]">
                    On iPhone/iPad this opens Camera or Photo Library.
                  </p>
                </div>
              )}
            </button>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Title
                </p>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Example: Drone roof overview"
                  className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-emerald-400"
                />
              </label>

              <label className="block">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Category
                </p>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-emerald-400"
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                Caption
              </p>
              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                rows={3}
                placeholder="Optional caption shown under the image."
                className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-emerald-400"
              />
            </label>

            <button
              type="button"
              onClick={addImage}
              disabled={saving || !selectedFile}
              className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
            >
              {saving ? "Uploading..." : "Add to Portfolio Gallery"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
            Gallery Tips
          </p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--fl-text)]">
            Best photos to add
          </h3>
          <div className="mt-4 grid gap-2 text-sm font-bold text-[var(--fl-muted)]">
            {["Clean exterior shots", "Drone roof photos", "Historic or luxury homes", "High-quality system photos", "Interesting inspection details"].map((tip) => (
              <div key={tip} className="rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
                ✓ {tip}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--fl-faint)]">
            Only upload photos you have permission to use publicly. Avoid client names, private documents, license plates, or personal information.
          </p>
        </div>
      </div>

      {message && <p className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm font-bold text-[var(--fl-good-text)]">{message}</p>}
      {error && <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-[var(--fl-crit-text)]">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {images.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 text-center text-sm text-[var(--fl-muted)] sm:col-span-2 xl:col-span-3">
            No portfolio photos yet. Add your first image above.
          </div>
        ) : (
          images.map((image) => (
            <div key={image.id} className="overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] shadow-xl">
              <img
                src={image.image_url}
                alt={image.title || image.category || "Portfolio image"}
                className="h-48 w-full object-cover"
                loading="lazy"
              />
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-semibold text-[var(--fl-text)]">{image.title || "Untitled photo"}</p>
                    <p className="mt-1 text-xs font-bold text-[var(--fl-good-text)]">{image.category || "General"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${image.is_enabled === false ? "border-[var(--fl-line)] text-[var(--fl-muted)]" : "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]"}`}>
                    {image.is_enabled === false ? "Hidden" : "Live"}
                  </span>
                </div>

                {image.caption && <p className="line-clamp-2 text-sm leading-5 text-[var(--fl-muted)]">{image.caption}</p>}

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updateImage(image.id, { is_enabled: image.is_enabled === false })}
                    disabled={saving}
                    className="rounded-xl border border-[var(--fl-line)] px-3 py-2 text-xs font-semibold text-[var(--fl-text)] transition hover:border-emerald-400 hover:text-[var(--fl-good-text)] disabled:opacity-50"
                  >
                    {image.is_enabled === false ? "Show" : "Hide"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteImage(image.id)}
                    disabled={saving}
                    className="rounded-xl border border-red-500/50 px-3 py-2 text-xs font-semibold text-[var(--fl-crit-text)] transition hover:bg-red-500 hover:text-[var(--fl-text)] disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
