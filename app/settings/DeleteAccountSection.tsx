"use client";

import { useState } from "react";
import { createClient } from "../../utils/supabase/client";

export default function DeleteAccountSection() {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleDeleteAccount() {
    if (confirmText !== "DELETE") {
      setMessage("Type DELETE to confirm account deletion.");
      return;
    }

    const confirmed = window.confirm(
      "This will permanently delete your account and may remove your inspections, reports, contacts, templates, agreements, invoices, and related data. This cannot be undone."
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("You must be logged in to delete your account.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Delete failed.");
      }

      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch (error: any) {
      setMessage(error.message || "Unable to delete account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-red-500/40 bg-red-950/20 p-6">
      <h2 className="text-xl font-bold text-red-300">Delete Account</h2>

      <p className="mt-3 text-sm text-slate-300 leading-6">
        Permanently deleting your account may remove your inspections, reports,
        contacts, templates, agreements, invoices, analytics, photos, and related
        data. This action cannot be undone.
      </p>

      <label className="mt-5 block text-sm font-medium text-slate-200">
        Type DELETE to confirm
      </label>

      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        className="mt-2 w-full rounded-xl border border-red-500/40 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-red-400"
        placeholder="DELETE"
      />

      {message && <p className="mt-3 text-sm text-red-300">{message}</p>}

      <button
        type="button"
        onClick={handleDeleteAccount}
        disabled={loading || confirmText !== "DELETE"}
        className="mt-5 rounded-xl bg-red-600 px-5 py-3 font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Deleting..." : "Permanently Delete Account"}
      </button>
    </section>
  );
}