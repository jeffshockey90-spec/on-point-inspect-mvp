"use client";

import { createClient } from "../../utils/supabase/client";
import { useRouter } from "next/navigation";

export default function DeleteClientButton({
  clientId,
}: {
  clientId: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  async function deleteClient() {
    const confirmed = confirm(
      "Delete this client?"
    );

    if (!confirmed) return;

    await supabase
      .from("clients")
      .delete()
      .eq("id", clientId);

    router.refresh();
  }

  return (
    <button
      onClick={deleteClient}
      className="rounded-lg border border-red-800 px-3 py-2 text-sm text-red-300 hover:bg-red-950"
    >
      Delete
    </button>
  );
}