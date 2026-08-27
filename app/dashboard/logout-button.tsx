"use client";

import { createClient } from "../../utils/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();

    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="rounded-lg border border-[var(--fl-line)] px-4 py-2 text-sm text-[var(--fl-muted)] hover:border-red-400 hover:text-[var(--fl-crit-text)]"
    >
      Logout
    </button>
  );
}