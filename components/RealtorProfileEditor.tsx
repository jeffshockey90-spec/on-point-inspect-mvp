"use client";

import { useRef, useState } from "react";

type Profile = { email: string; name: string; brokerage: string; photo_url: string };

export default function RealtorProfileEditor({
  initial,
  canEdit,
}: {
  initial: Profile;
  canEdit: boolean;
}) {
  const [profile, setProfile] = useState<Profile>(initial);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.name || "");
  const [brokerage, setBrokerage] = useState(initial.brokerage || "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : "");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("brokerage", brokerage);
      if (file) fd.set("photo", file);
      const res = await fetch("/api/realtor-profile", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed.");
      setProfile(json.profile);
      setEditing(false);
      setFile(null);
      setPreview("");
    } catch (e: any) {
      setError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const avatar = preview || profile.photo_url;
  const initials = (profile.name || profile.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="w-full">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[#232b38] bg-[#0a0e13]">
          {avatar ? (
            <img src={avatar} alt="Realtor" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-teal-300">
              {initials}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {profile.name ? (
            <p className="truncate text-lg font-semibold text-white">{profile.name}</p>
          ) : null}
          {profile.brokerage ? (
            <p className="truncate text-sm text-[#8a93a3]">{profile.brokerage}</p>
          ) : null}
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-1 text-sm font-bold text-teal-300 transition hover:text-teal-200"
            >
              {profile.photo_url || profile.name ? "Edit profile" : "Add your photo & info"}
            </button>
          )}
        </div>
      </div>

      {canEdit && editing && (
        <div className="mt-4 space-y-3 rounded-2xl border border-[#232b38] bg-[#10151e] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={saving}
              className="rounded-lg border border-teal-500 px-3 py-2 text-sm font-bold text-teal-300 transition hover:bg-teal-500/10 disabled:opacity-60"
            >
              {avatar ? "Change photo" : "Upload photo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={pickFile}
              className="hidden"
            />
            {file && <span className="text-xs text-[#8a93a3]">{file.name}</span>}
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            disabled={saving}
            className="w-full rounded-lg border border-[#232b38] bg-black p-2.5 text-sm text-white outline-none focus:border-teal-400 disabled:opacity-60"
          />
          <input
            value={brokerage}
            onChange={(e) => setBrokerage(e.target.value)}
            placeholder="Brokerage (optional)"
            disabled={saving}
            className="w-full rounded-lg border border-[#232b38] bg-black p-2.5 text-sm text-white outline-none focus:border-teal-400 disabled:opacity-60"
          />

          {error && <p className="text-sm font-semibold text-red-400">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              aria-busy={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-teal-400 disabled:opacity-60"
            >
              {saving && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setFile(null);
                setPreview("");
                setError("");
                setName(profile.name || "");
                setBrokerage(profile.brokerage || "");
              }}
              disabled={saving}
              className="rounded-lg border border-[#232b38] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1a212c] disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
