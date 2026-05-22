"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

const SEVERITIES = [
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
  "Monitor",
];

const bucketName = "inspection-photos";

export default function FindingActions({ finding }: { finding: any }) {
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [section, setSection] = useState(finding.section || "");
  const [severity, setSeverity] = useState(
    finding.severity || "Recommended Repair"
  );
  const [title, setTitle] = useState(finding.title || "");
  const [observation, setObservation] = useState(finding.observation || "");
  const [implication, setImplication] = useState(finding.implication || "");
  const [recommendation, setRecommendation] = useState(
    finding.recommendation || ""
  );

  async function saveEdit() {
    try {
      setSaving(true);

      const { error } = await supabase
        .from("findings")
        .update({
          section,
          severity,
          title,
          observation,
          implication,
          recommendation,
        })
        .eq("id", finding.id);

      if (error) {
        throw new Error(error.message);
      }

      setEditing(false);
      router.refresh();
    } catch (error: any) {
      alert(error.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFinding() {
    const confirmed = confirm(
      "Are you sure you want to delete this finding?"
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("findings")
        .delete()
        .eq("id", finding.id);

      if (error) {
        throw new Error(error.message);
      }

      router.refresh();
    } catch (error: any) {
      alert(error.message || "Failed to delete finding");
    }
  }

  async function uploadAdditionalPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;

    try {
      setUploadingPhotos(true);

      for (const file of Array.from(files)) {
        const safeName = file.name
          .toLowerCase()
          .replace(/[^a-z0-9.]+/g, "-");

        const storagePath = `${finding.inspection_id}/finding-${
          finding.id
        }/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(storagePath, file);

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const { data: publicUrlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(storagePath);

        await supabase.from("photos").insert({
          inspection_id: finding.inspection_id,
          finding_id: finding.id,
          public_url: publicUrlData.publicUrl,
          storage_path: storagePath,
          caption: title,
        });
      }

      router.refresh();
    } catch (error: any) {
      alert(error.message || "Failed to upload photos");
    } finally {
      setUploadingPhotos(false);
    }
  }

  if (!editing) {
    return (
      <div className="mt-5 space-y-4 print:hidden">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white"
          >
            Edit
          </button>

          <button
            onClick={deleteFinding}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white"
          >
            Delete
          </button>

          <label className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">
            {uploadingPhotos ? "Uploading..." : "Add Photos"}

            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) =>
                uploadAdditionalPhotos(e.target.files)
              }
            />
          </label>
        </div>

        {finding.photos?.length > 0 && (
          <div className="grid gap-3 md:grid-cols-3">
            {finding.photos.map((photo: any) => (
              <img
                key={photo.id}
                src={photo.public_url}
                alt="Finding Photo"
                className="h-52 w-full rounded-xl border border-slate-700 object-cover"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4 rounded-xl border border-teal-600 bg-gray-50 p-5 print:hidden">
      <div>
        <label className="mb-2 block text-sm font-bold text-black">
          Section
        </label>

        <input
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="w-full rounded-lg border p-3 text-black"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-black">
          Severity
        </label>

        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="w-full rounded-lg border p-3 text-black"
        >
          {SEVERITIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-black">
          Title
        </label>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border p-3 font-bold text-black"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-black">
          Observation
        </label>

        <textarea
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          className="min-h-28 w-full rounded-lg border p-3 text-black"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-black">
          Implication
        </label>

        <textarea
          value={implication}
          onChange={(e) => setImplication(e.target.value)}
          className="min-h-28 w-full rounded-lg border p-3 text-black"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-black">
          Recommendation
        </label>

        <textarea
          value={recommendation}
          onChange={(e) => setRecommendation(e.target.value)}
          className="min-h-28 w-full rounded-lg border p-3 text-black"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={saveEdit}
          disabled={saving}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>

        <button
          onClick={() => setEditing(false)}
          className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-bold text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}