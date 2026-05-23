"use client";

import { useState } from "react";
import { createClient } from "../../utils/supabase/client";
import { useRouter } from "next/navigation";

export default function ClientForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    await supabase.from("clients").insert({
      inspector_id: userId,
      name,
      email,
      phone,
      address,
      notes,
    });

    setName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setNotes("");
    setSaving(false);

    router.refresh();
  }

  return (
    <form
      onSubmit={saveClient}
      className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
    >
      <h2 className="text-xl font-semibold text-white">
        Add Client
      </h2>

      <div className="mt-4 space-y-4">
        <input
          required
          placeholder="Client name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        />

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        />

        <input
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        />

        <input
          placeholder="Property address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        />

        <textarea
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-28 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        />

        <button
          disabled={saving}
          className="w-full rounded-lg bg-teal-500 px-4 py-3 font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Client"}
        </button>
      </div>
    </form>
  );
}