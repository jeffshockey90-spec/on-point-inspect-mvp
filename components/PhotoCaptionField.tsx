"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Inline caption editor for a single finding photo. Saves to photos.caption via
// the RLS-scoped client (same path the markup save uses), so the owning
// inspector/company-owner can edit it. The caption renders on the client report
// and print/PDF under the photo.
export default function PhotoCaptionField({
  photo,
  inspectionId,
}: {
  photo: any;
  inspectionId: string;
}) {
  const [caption, setCaption] = useState(photo?.caption || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = (caption || "") !== (photo?.caption || "");

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      const { error } = await supabase
        .from("photos")
        .update({ caption: caption.trim() || null })
        .eq("id", photo.id)
        .eq("inspection_id", inspectionId);
      if (error) throw error;
      photo.caption = caption.trim();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch {
      alert("Could not save the caption.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => {
          if (dirty) void save();
        }}
        placeholder="Add a caption (optional)"
        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#020617] px-3 py-1.5 text-xs text-white outline-none focus:border-teal-400"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !dirty}
        className="shrink-0 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-black text-slate-300 transition hover:border-teal-400 hover:text-teal-200 disabled:opacity-40"
      >
        {saving ? "…" : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
