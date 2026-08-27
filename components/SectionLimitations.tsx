"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PHOTO_BUCKET = "inspection-photos";

const DEFAULT_LIMITATIONS = [
  "Personal Property Present",
  "Stored Items Obstructing View",
  "Limited Access",
  "Not Operated",
  "Utilities Off",
  "Not Fully Visible",
  "Unable to Inspect Fully",
  "Other",
];

const SECTION_LIMITATIONS: Record<string, string[]> = {
  "Inspection Details": [
    "Client Not Present",
    "Property Occupied",
    "Utilities Off",
    "Limited Access",
    "Weather Limitations",
    "Other",
  ],
  Exterior: [
    "Personal Property Present",
    "Vegetation Obstructing View",
    "Limited Access",
    "Snow Covered",
    "Not Fully Visible",
    "Other",
  ],
  Roof: [
    "Viewed From Ground",
    "Viewed From Ladder",
    "Not Walked",
    "Steep Roof",
    "Wet Surface",
    "Snow Covered",
    "Limited Access",
    "Other",
  ],
  "Basement, Foundation, Crawlspace & Structure": [
    "Personal Property Present",
    "Stored Items Obstructing View",
    "Limited Access",
    "Crawlspace Not Entered",
    "Insulation Obstructing View",
    "Other",
  ],
  Heating: [
    "Not Operated",
    "Utilities Off",
    "Panel Not Removed",
    "Limited Access",
    "System Obstructed",
    "Other",
  ],
  Cooling: [
    "Not Operated",
    "Low Outdoor Temperature",
    "Utilities Off",
    "Panel Not Removed",
    "Limited Access",
    "Other",
  ],
  Plumbing: [
    "Utilities Off",
    "Personal Property Present",
    "Limited Access",
    "Fixtures Not Operated",
    "Water Off",
    "Other",
  ],
  Electrical: [
    "Panel Obstructed",
    "Cover Not Removed",
    "Utilities Off",
    "Limited Access",
    "Personal Property Present",
    "Other",
  ],
  "Attic, Insulation & Ventilation": [
    "Limited Access",
    "Attic Not Entered",
    "Viewed From Opening",
    "Insulation Obstructing View",
    "Stored Items Present",
    "Other",
  ],
  "Doors, Windows & Interior": [
    "Personal Property Present",
    "Furniture Obstructing View",
    "Limited Access",
    "Not Operated",
    "Stored Items Obstructing View",
    "Other",
  ],
  "Built-in Appliances": [
    "Appliances Not Moved",
    "Personal Property Present",
    "Not Operated",
    "Utilities Off",
    "Limited Access",
    "Other",
  ],
  Garage: [
    "Personal Property Present",
    "Stored Items Obstructing View",
    "Limited Access",
    "Vehicle Present",
    "Not Operated",
    "Other",
  ],
};

type LimitationRow = {
  id: string;
  inspection_id: string;
  section: string;
  label: string;
  custom_text?: string | null;
  ai_notes?: string | null;
  limitation_comment?: string | null;
};

type LimitationPhoto = {
  id: string;
  limitation_id: string;
  inspection_id?: string | null;
  section?: string | null;
  file_path?: string | null;
  public_url?: string | null;
  signed_url?: string | null;
  photo_url?: string | null;
  thumbnail_path?: string | null;
  thumbnail_url?: string | null;
  inspector_id?: string | null;
};

type LimitationTemplate = {
  id: string;
  inspector_id: string;
  title: string;
  limitation_text: string;
  created_at?: string;
};

let limitationTemplatesCache: LimitationTemplate[] | null = null;
let limitationTemplatesPromise: Promise<LimitationTemplate[]> | null = null;

async function getSharedLimitationTemplates() {
  if (limitationTemplatesCache) return limitationTemplatesCache;
  if (limitationTemplatesPromise) return limitationTemplatesPromise;

  limitationTemplatesPromise = fetch("/api/get-limitation-templates", {
    method: "GET",
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) return [];
      const data = await response.json();
      const templates = Array.isArray(data) ? data : [];
      limitationTemplatesCache = templates;
      return templates;
    })
    .catch((error) => {
      console.error("Failed to load limitation templates:", error);
      return [];
    })
    .finally(() => {
      limitationTemplatesPromise = null;
    });

  return limitationTemplatesPromise;
}


function SectionLimitations({
  inspectionId,
  section,
}: {
  inspectionId: string;
  section: string;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<LimitationRow[]>([]);
  const [templates, setTemplates] = useState<LimitationTemplate[]>([]);
  const [photosByLimitationId, setPhotosByLimitationId] = useState<
    Record<string, LimitationPhoto[]>
  >({});
  const [customText, setCustomText] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [generatedComment, setGeneratedComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadingForId, setUploadingForId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState("");

  function showMessage(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 3500);
  }

  const options = useMemo(
    () => SECTION_LIMITATIONS[section] || DEFAULT_LIMITATIONS,
    [section]
  );

  async function loadLimitations() {
    if (!inspectionId || !section) return;

    const { data, error } = await supabase
      .from("section_limitations")
      .select("*")
      .eq("inspection_id", inspectionId)
      .eq("section", section)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load section limitations:", error);
      return;
    }

    const rows = data || [];
    setSaved(rows);

    const aiRow = rows.find(
      (item: LimitationRow) => item.label === "AI Limitation Note"
    );

    if (aiRow?.ai_notes) setAiNotes(aiRow.ai_notes);
    if (aiRow?.limitation_comment || aiRow?.custom_text) {
      setGeneratedComment(aiRow.limitation_comment || aiRow.custom_text || "");
    }

    const limitationIds = rows.map((row: LimitationRow) => row.id);

    if (limitationIds.length === 0) {
      setPhotosByLimitationId({});
      return;
    }

    await loadLimitationPhotos(limitationIds);
  }

  useEffect(() => {
    loadLimitations();
  }, [inspectionId, section]);

  useEffect(() => {
    function handleExternalLimitationChange(event: Event) {
      const detail = (event as CustomEvent)?.detail || {};
      const eventInspectionId = String(detail.inspectionId || "");
      const eventSection = String(detail.section || "");

      if (
        eventInspectionId === String(inspectionId) &&
        eventSection === String(section)
      ) {
        window.setTimeout(() => {
          loadLimitations();
        }, 500);

        setOpen(true);
        showMessage("success", "AI limitation added to this section.");
      }
    }

    window.addEventListener(
      "opi:section-limitations-changed",
      handleExternalLimitationChange as EventListener
    );

    return () => {
      window.removeEventListener(
        "opi:section-limitations-changed",
        handleExternalLimitationChange as EventListener
      );
    };
  }, [inspectionId, section]);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    const data = await getSharedLimitationTemplates();
    setTemplates(data);
  }

  async function loadLimitationPhotos(limitationIds: string[]) {
    if (!limitationIds.length) {
      setPhotosByLimitationId({});
      return;
    }

    try {
      const response = await fetch("/api/limitation-photos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ limitationIds }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load limitation photos.");
      }

      const grouped: Record<string, LimitationPhoto[]> = {};

      (Array.isArray(data.photos) ? data.photos : []).forEach(
        (photo: LimitationPhoto) => {
          if (!photo?.limitation_id) return;
          if (!grouped[photo.limitation_id]) grouped[photo.limitation_id] = [];
          grouped[photo.limitation_id].push(photo);
        },
      );

      setPhotosByLimitationId(grouped);
    } catch (error) {
      console.error("Failed to load limitation photos:", error);
      setPhotosByLimitationId({});
    }
  }

  const selectedStandard = saved.filter(
    (item) =>
      !item.custom_text &&
      !item.ai_notes &&
      !item.limitation_comment
  );

  const customSaved = saved.filter((item) => item.custom_text);

  const aiSaved = saved.filter(
    (item) => item.ai_notes || item.limitation_comment
  );

  function isSelected(label: string) {
    return saved.some(
      (item) =>
        item.label === label &&
        !item.custom_text &&
        item.label !== "AI Limitation Note"
    );
  }

  function isTemplateSelected(template: LimitationTemplate) {
    return saved.some(
      (item) =>
        item.label === template.title &&
        !item.custom_text &&
        String(item.limitation_comment || "").trim() ===
          String(template.limitation_text || "").trim()
    );
  }

  async function toggleLimitation(label: string) {
    if (!inspectionId || !section || saving) return;
    if (label === "Other") return;

    setSaving(true);

    try {
      const existing = saved.find(
        (item) => item.label === label && !item.custom_text
      );

      if (existing) {
        const { error } = await supabase
          .from("section_limitations")
          .delete()
          .eq("id", existing.id);

        if (error) throw error;

        setSaved((prev) => prev.filter((item) => item.id !== existing.id));
        setPhotosByLimitationId((prev) => {
          const next = { ...prev };
          delete next[existing.id];
          return next;
        });
        return;
      }

      const { data, error } = await supabase
        .from("section_limitations")
        .insert({
          inspection_id: inspectionId,
          section,
          label,
        })
        .select("*")
        .single();

      if (error) throw error;

      if (data) setSaved((prev) => [...prev, data]);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to save limitation.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTemplate(template: LimitationTemplate) {
    if (!inspectionId || !section || saving) return;

    setSaving(true);

    try {
      const existing = saved.find(
        (item) =>
          item.label === template.title &&
          !item.custom_text &&
          String(item.limitation_comment || "").trim() ===
            String(template.limitation_text || "").trim()
      );

      if (existing) {
        const { error } = await supabase
          .from("section_limitations")
          .delete()
          .eq("id", existing.id);

        if (error) throw error;

        setSaved((prev) => prev.filter((item) => item.id !== existing.id));
        setPhotosByLimitationId((prev) => {
          const next = { ...prev };
          delete next[existing.id];
          return next;
        });
        return;
      }

      const { data, error } = await supabase
        .from("section_limitations")
        .insert({
          inspection_id: inspectionId,
          section,
          label: template.title,
          limitation_comment: template.limitation_text,
          custom_text: null,
        })
        .select("*")
        .single();

      if (error) throw error;

      if (data) setSaved((prev) => [...prev, data]);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to use saved limitation template.");
    } finally {
      setSaving(false);
    }
  }

  async function addCustomLimitation() {
    const clean = customText.trim();

    if (!clean || !inspectionId || !section || saving) return;

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("section_limitations")
        .insert({
          inspection_id: inspectionId,
          section,
          label: "Other",
          custom_text: clean,
        })
        .select("*")
        .single();

      if (error) throw error;

      if (data) setSaved((prev) => [...prev, data]);
      setCustomText("");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to save custom limitation.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLimitation(id: string) {
    if (saving) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from("section_limitations")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setSaved((prev) => prev.filter((item) => item.id !== id));
      setPhotosByLimitationId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (aiSaved.some((item) => item.id === id)) {
        setAiNotes("");
        setGeneratedComment("");
      }
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to remove limitation.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLimitationPhoto(
    limitation: LimitationRow,
    file: File | undefined
  ) {
    if (!file || !inspectionId || !limitation.id) return;

    setUploadingForId(limitation.id);

    try {
      const fileExt = file.name.split(".").pop() || "jpg";
      const filePath = `${inspectionId}/limitations/${limitation.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(filePath);

      const { data, error } = await supabase
        .from("limitation_photos")
        .insert({
          limitation_id: limitation.id,
          photo_url: publicData.publicUrl,
          thumbnail_url: publicData.publicUrl,
          thumbnail_path: filePath,
        })
        .select("*")
        .single();

      if (error) throw error;

      const { data: signedData } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(filePath, 60 * 60 * 24 * 7);

      const savedPhoto: LimitationPhoto = {
        ...data,
        signed_url: signedData?.signedUrl || publicData.publicUrl,
      };

      setPhotosByLimitationId((prev) => ({
        ...prev,
        [limitation.id]: [...(prev[limitation.id] || []), savedPhoto],
      }));
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to upload limitation photo.");
    } finally {
      setUploadingForId(null);
    }
  }

  async function deleteLimitationPhoto(photo: LimitationPhoto) {
    if (!photo.id) return;

    const confirmed = window.confirm("Delete this limitation photo?");

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("limitation_photos")
        .delete()
        .eq("id", photo.id);

      if (error) throw error;

      const storagePath = photo.file_path || photo.thumbnail_path || "";
      if (storagePath) {
        await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
      }

      setPhotosByLimitationId((prev) => ({
        ...prev,
        [photo.limitation_id]: (prev[photo.limitation_id] || []).filter(
          (item) => item.id !== photo.id
        ),
      }));
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to delete limitation photo.");
    }
  }

  async function generateAiLimitationComment() {
    const cleanNotes = aiNotes.trim();

    if (!cleanNotes) {
      showMessage("error", "Add a note for the AI first.");
      return;
    }

    setGenerating(true);

    try {
      const res = await fetch("/api/generate-limitation-note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          section,
          notes: cleanNotes,
          selectedLimitations: [
            ...selectedStandard.map((item) => item.label),
            ...customSaved.map((item) => item.custom_text || item.label),
          ],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showMessage("error", data.error || "Failed to generate limitation note.");
        return;
      }

      setGeneratedComment(data.comment || "");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to generate limitation note.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveAiLimitationComment() {
    const cleanNotes = aiNotes.trim();
    const cleanComment = generatedComment.trim();

    if (!cleanComment) {
      showMessage("error", "No AI limitation comment to save.");
      return;
    }

    setSaving(true);

    try {
      if (aiSaved) {
        const { data, error } = await supabase
          .from("section_limitations")
          .update({
            ai_notes: cleanNotes,
            limitation_comment: cleanComment,
            custom_text: null,
          })
          .eq("id", aiSaved[0]?.id)
          .select("*")
          .single();

        if (error) throw error;

        setSaved((prev) =>
          prev.map((item) => (item.id === aiSaved[0]?.id ? data : item))
        );
      } else {
        const { data, error } = await supabase
          .from("section_limitations")
          .insert({
            inspection_id: inspectionId,
            section,
            label: "AI Limitation Note",
            ai_notes: cleanNotes,
            limitation_comment: cleanComment,
            custom_text: null,
          })
          .select("*")
          .single();

        if (error) throw error;

        if (data) setSaved((prev) => [...prev, data]);
      }

      showMessage("success", "Limitation note saved.");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to save AI limitation note.");
    } finally {
      setSaving(false);
    }
  }

  async function saveGeneratedCommentToLibrary() {
    const cleanComment = generatedComment.trim();

    if (!cleanComment) {
      showMessage("error", "Generate or enter a limitation comment first.");
      return;
    }

    const title = window.prompt(
      "Template title to show in the checkbox list:",
      section ? `${section} Limitation` : "Saved Limitation"
    );

    const cleanTitle = String(title || "").trim();

    if (!cleanTitle) return;

    setSaving(true);

    try {
      const res = await fetch("/api/save-limitation-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: cleanTitle,
          limitationText: cleanComment,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save limitation template.");
      }

      if (data.template) {
        setTemplates((prev) => [data.template, ...prev]);
      } else {
        await loadTemplates();
      }

      showMessage("success", "Limitation saved to library.");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to save limitation template.");
    } finally {
      setSaving(false);
    }
  }

  const selectedCount =
    selectedStandard.length + customSaved.length + aiSaved.length;

  const selectedLimitations = [
    ...selectedStandard,
    ...customSaved,
    ...aiSaved,
  ];

  return (
    <>
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[var(--fl-raised)]"
      >
        <div>
          <h3 className="text-xl font-semibold text-[var(--fl-accent-text)]">Limitations</h3>
          <p className="mt-1 text-sm text-[var(--fl-muted)]">
            {selectedCount > 0
              ? `${selectedCount} limitation${selectedCount === 1 ? "" : "s"} selected`
              : "No limitations selected"}
          </p>
        </div>

        <span className="rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)]">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {selectedLimitations.length > 0 && (
        <div className="border-t border-[var(--fl-line)] px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fl-muted)]">
            Saved limitation preview
          </p>

          <div className="space-y-3">
            {selectedLimitations.map((item) => {
              const label = item.custom_text || item.label;
              const comment = String(
                item.limitation_comment ||
                  item.custom_text ||
                  item.ai_notes ||
                  ""
              ).trim();
              const photos = photosByLimitationId[item.id] || [];

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-[var(--fl-warn-text)]">
                        {label}
                      </p>
                      {comment && (
                        <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-[var(--fl-muted)]">
                          {comment}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLimitation(item.id)}
                      className="rounded-full border border-red-500/60 bg-red-500/10 px-3 py-1 text-xs font-semibold text-[var(--fl-crit-text)] hover:bg-red-500/20"
                      title="Remove limitation"
                    >
                      Remove
                    </button>
                  </div>

                  {photos.length > 0 && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {photos.map((photo) => {
                        const photoUrl =
                          photo.signed_url ||
                          photo.photo_url ||
                          photo.thumbnail_url ||
                          photo.public_url ||
                          "";

                        if (!photoUrl) return null;

                        return (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => setExpandedPhotoUrl(photoUrl)}
                            className="group relative block h-36 w-full overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                            title="Tap to enlarge limitation photo"
                          >
                            <img
                              src={photoUrl}
                              alt="Limitation"
                              loading="lazy"
                              className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                            />
                            <span className="absolute bottom-2 right-2 rounded-full border border-white/30 bg-[var(--fl-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-text)]">
                              Tap to enlarge
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {message && (
        <div className="border-t border-[var(--fl-line)] px-5 pt-4">
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-bold ${
              messageType === "success"
                ? "border-emerald-500 bg-emerald-500/10 text-[var(--fl-good-text)]"
                : "border-red-500 bg-red-500/10 text-[var(--fl-crit-text)]"
            }`}
          >
            {message}
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-5 border-t border-[var(--fl-line)] p-5">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--fl-muted)]">
              Select limitation conditions
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {options
                .filter((option) => option !== "Other")
                .map((option) => {
                  const selected = isSelected(option);

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleLimitation(option)}
                      disabled={saving}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-teal-400 bg-teal-500/15 text-teal-100"
                          : "border-[var(--fl-line)] bg-[var(--fl-ground)] text-white hover:border-teal-400 hover:bg-teal-500/10"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                          selected
                            ? "border-teal-300 bg-teal-400 text-slate-950"
                            : "border-white"
                        }`}
                      >
                        {selected ? "✓" : ""}
                      </span>

                      <span className="font-bold">{option}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          {templates.length > 0 && (
            <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4">
              <p className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--fl-info-text)]">
                Saved Limitation Templates
              </p>

              <p className="mb-4 text-sm text-[var(--fl-muted)]">
                Select a title here. The full saved limitation text is inserted into the report.
              </p>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => {
                  const selected = isTemplateSelected(template);

                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => toggleTemplate(template)}
                      disabled={saving}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-cyan-300 bg-cyan-500/20 text-[var(--fl-info-text)]"
                          : "border-[var(--fl-line)] bg-[var(--fl-ground)] text-white hover:border-cyan-400 hover:bg-cyan-500/10"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                      title={template.limitation_text}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                          selected
                            ? "border-cyan-200 bg-cyan-300 text-slate-950"
                            : "border-white"
                        }`}
                      >
                        {selected ? "✓" : ""}
                      </span>

                      <span className="font-bold">{template.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedLimitations.length > 0 && (
            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
              <p className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--fl-muted)]">
                Limitation Photos
              </p>

              <div className="space-y-4">
                {selectedLimitations.map((limitation) => {
                  const label = limitation.custom_text || limitation.label;
                  const photos = photosByLimitationId[limitation.id] || [];

                  return (
                    <div
                      key={limitation.id}
                      className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-[var(--fl-accent-text)]">{label}</p>

                        <label className="cursor-pointer rounded-xl border border-teal-500 px-4 py-2 text-sm font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10">
                          {uploadingForId === limitation.id
                            ? "Uploading..."
                            : "Upload Photo"}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingForId === limitation.id}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              uploadLimitationPhoto(limitation, file);
                              event.currentTarget.value = "";
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {photos.length > 0 && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {photos.map((photo) => {
                            const photoUrl =
                              photo.signed_url ||
                              photo.public_url ||
                              photo.photo_url ||
                              photo.thumbnail_url ||
                              "";

                            if (!photoUrl) return null;

                            return (
                              <div
                                key={photo.id}
                                className="overflow-hidden rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)]"
                              >
                                <button
                                  type="button"
                                  onClick={() => setExpandedPhotoUrl(photoUrl)}
                                  className="group relative block h-40 w-full overflow-hidden bg-[var(--fl-surface-2)] text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                  title="Tap to enlarge limitation photo"
                                >
                                  <img
                                    src={photoUrl}
                                    alt="Limitation"
                                    loading="lazy"
                                    className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                                  />
                                  <span className="absolute bottom-2 right-2 rounded-full border border-white/30 bg-[var(--fl-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-text)]">
                                    Tap to enlarge
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => deleteLimitationPhoto(photo)}
                                  className="w-full border-t border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-xs font-semibold text-[var(--fl-crit-text)] hover:bg-red-500/10"
                                >
                                  Delete Photo
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--fl-muted)]">
              + Other Limitation
            </p>

            <div className="flex flex-col gap-3 md:flex-row">
              <input
                value={customText}
                onChange={(event) => setCustomText(event.target.value)}
                placeholder="Enter custom limitation..."
                className="min-w-0 flex-1 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
              />

              <button
                type="button"
                onClick={addCustomLimitation}
                disabled={saving || !customText.trim()}
                className="rounded-xl border border-teal-500 px-5 py-3 font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add Other
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--fl-purple-text)]">
              AI Limitation Note
            </p>

            <p className="mt-1 text-sm text-[var(--fl-muted)]">
              Add your rough note, then let AI turn it into a professional limitation comment.
            </p>

            <textarea
              value={aiNotes}
              onChange={(event) => setAiNotes(event.target.value)}
              rows={3}
              placeholder="Example: attic only viewed from opening due to limited access and stored items..."
              className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] outline-none focus:border-purple-400"
            />

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={generateAiLimitationComment}
                disabled={generating || saving || !aiNotes.trim()}
                className="rounded-xl bg-purple-500 px-5 py-3 font-semibold text-white hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? "Generating..." : "AI Fill Limitation Comment"}
              </button>

              <button
                type="button"
                onClick={saveAiLimitationComment}
                disabled={saving || !generatedComment.trim()}
                className="rounded-xl border border-teal-500 px-5 py-3 font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save AI Note
              </button>

              <button
                type="button"
                onClick={saveGeneratedCommentToLibrary}
                disabled={saving || !generatedComment.trim()}
                className="rounded-xl border border-cyan-500 px-5 py-3 font-semibold text-[var(--fl-info-text)] hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save To Library
              </button>
            </div>

            <textarea
              value={generatedComment}
              onChange={(event) => setGeneratedComment(event.target.value)}
              rows={4}
              placeholder="AI limitation comment will appear here..."
              className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-[var(--fl-text)] outline-none focus:border-purple-400"
            />
          </div>
        </div>
      )}
    </div>

    {expandedPhotoUrl && (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        onClick={() => setExpandedPhotoUrl("")}
      >
        <button
          type="button"
          aria-label="Close expanded limitation photo"
          className="absolute right-4 top-4 rounded-full border border-white/30 bg-[var(--fl-surface-2)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)] shadow-xl"
          onClick={(event) => {
            event.stopPropagation();
            setExpandedPhotoUrl("");
          }}
        >
          Close ✕
        </button>

        <img
          src={expandedPhotoUrl}
          alt="Expanded limitation"
          className="max-h-[88vh] max-w-[94vw] rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] object-contain shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    )}
    </>
  );
}

export default memo(SectionLimitations);
