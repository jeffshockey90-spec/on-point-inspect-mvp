"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function DeleteInspectionButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [label, setLabel] = useState("Delete Report");

  async function handleDelete() {
    if (deleting) return;

    const confirmed = window.confirm(
      "Delete this entire inspection report? This will remove the report and its findings. This cannot be undone."
    );

    if (!confirmed) return;

    setDeleting(true);
    setLabel("Deleting Photos...");

    try {
      await supabase.from("photos").delete().eq("inspection_id", inspectionId);

      setLabel("Deleting Findings...");

      await supabase.from("findings").delete().eq("inspection_id", inspectionId);

      setLabel("Deleting Report...");

      const { error } = await supabase
        .from("inspections")
        .delete()
        .eq("id", inspectionId);

      if (error) throw error;

      setLabel("Opening Reports...");

      router.push("/reports");
      router.refresh();
    } catch (error: any) {
      setLabel("Failed");
      alert(error.message || "Failed to delete report.");

      window.setTimeout(() => {
        setDeleting(false);
        setLabel("Delete Report");
      }, 700);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      aria-busy={deleting}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500 px-5 py-3 font-bold text-red-300 transition active:scale-[0.98] hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
    >
      {deleting && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {label}
    </button>
  );
}