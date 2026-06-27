"use client";

import { useMemo, useState } from "react";

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
  const [images, setImages] = useState<PortfolioImage[]>(initialImages || []);
  const [imageUrl, setImageUrl] = useState("");
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

  async function refreshGallery() {
    const res = await fetch("/api/public-profile-gallery", { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to refresh gallery.");
    setImages(data.images || []);
  }

  async function addImage() {
    if (saving) return;

    const cleanUrl = cleanText(imageUrl);
    if (!cleanUrl) {
      setError("Paste an image URL before adding it to the gallery.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/public-profile-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: cleanUrl,
          title,
          caption,
          category,
          displayOrder: images.length,
          isEnabled: true,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to add portfolio image.");

      setImages(data.images || []);
      setImageUrl("");
      setTitle("");
      setCaption("");
      setCategory("Exterior");
      setMessage("Portfolio image added to your public profile.");
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
    <section className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-[#0b1220] via-[#0b1220] to-emerald-950/10 p-5 shadow-xl sm:p-6 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
            Portfolio Gallery
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            Show off your inspection work
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Add polished portfolio photos that appear on your public inspector profile. Use this for roof shots, exterior details, drone photos, major systems, or impressive homes you are allowed to showcase.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-center">
          <p className="text-2xl font-black text-emerald-200">{enabledImages.length}</p>
          <p className="text-xs font-bold text-slate-400">Visible Photos</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-700 bg-slate-950/80 p-4 sm:p-5">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-300">
            Add Photo
          </p>
          <div className="mt-4 grid gap-3">
            <label className="block">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                Image URL
              </p>
              <input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="Paste a hosted image URL"
                className="w-full rounded-xl border border-slate-700 bg-[#020817] p-3 text-white outline-none focus:border-emerald-400"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Title
                </p>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Example: Drone roof overview"
                  className="w-full rounded-xl border border-slate-700 bg-[#020817] p-3 text-white outline-none focus:border-emerald-400"
                />
              </label>

              <label className="block">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Category
                </p>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-[#020817] p-3 text-white outline-none focus:border-emerald-400"
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                Caption
              </p>
              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                rows={3}
                placeholder="Optional caption shown under the image."
                className="w-full rounded-xl border border-slate-700 bg-[#020817] p-3 text-white outline-none focus:border-emerald-400"
              />
            </label>

            <button
              type="button"
              onClick={addImage}
              disabled={saving || !imageUrl.trim()}
              className="rounded-xl bg-emerald-400 px-5 py-3 font-black text-slate-950 transition active:scale-[0.98] hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 [touch-action:manipulation]"
            >
              {saving ? "Saving..." : "Add to Portfolio Gallery"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-950/80 p-4 sm:p-5">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
            Gallery Tips
          </p>
          <h3 className="mt-2 text-xl font-black text-white">
            Best photos to add
          </h3>
          <div className="mt-4 grid gap-2 text-sm font-bold text-slate-300">
            {["Clean exterior shots", "Drone roof photos", "Historic or luxury homes", "High-quality system photos", "Interesting inspection details"].map((tip) => (
              <div key={tip} className="rounded-xl border border-slate-800 bg-[#020817] p-3">
                ✓ {tip}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Only upload photos you have permission to use publicly. Avoid client names, private documents, license plates, or personal information.
          </p>
        </div>
      </div>

      {message && <p className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm font-bold text-emerald-300">{message}</p>}
      {error && <p className="mt-4 rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm font-bold text-red-300">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {images.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-6 text-center text-sm text-slate-400 sm:col-span-2 xl:col-span-3">
            No portfolio photos yet. Add your first image above.
          </div>
        ) : (
          images.map((image) => (
            <div key={image.id} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-xl">
              <img
                src={image.image_url}
                alt={image.title || image.category || "Portfolio image"}
                className="h-48 w-full object-cover"
                loading="lazy"
              />
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-black text-white">{image.title || "Untitled photo"}</p>
                    <p className="mt-1 text-xs font-bold text-emerald-300">{image.category || "General"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${image.is_enabled === false ? "border-slate-600 text-slate-400" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
                    {image.is_enabled === false ? "Hidden" : "Live"}
                  </span>
                </div>

                {image.caption && <p className="line-clamp-2 text-sm leading-5 text-slate-400">{image.caption}</p>}

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updateImage(image.id, { is_enabled: image.is_enabled === false })}
                    disabled={saving}
                    className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-black text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                  >
                    {image.is_enabled === false ? "Show" : "Hide"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteImage(image.id)}
                    disabled={saving}
                    className="rounded-xl border border-red-500/50 px-3 py-2 text-xs font-black text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-50"
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
