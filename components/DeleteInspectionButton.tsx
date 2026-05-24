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

  async function handleDelete() {
    const confirmed = window.confirm(
      "Delete this entire inspection report? This will remove the report and its findings. This cannot be undone."
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      await supabase.from("photos").delete().eq("inspection_id", inspectionId);
      await supabase.from("findings").delete().eq("inspection_id", inspectionId);

      const { error } = await supabase
        .from("inspections")
        .delete()
        .eq("id", inspectionId);

      if (error) throw error;

      router.push("/reports");
      router.refresh();
    } catch (error: any) {
      alert(error.message || "Failed to delete report.");
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="rounded-xl border border-red-500 px-5 py-3 font-bold text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-50"
    >
      {deleting ? "Deleting..." : "Delete Report"}
    </button>
  );
}