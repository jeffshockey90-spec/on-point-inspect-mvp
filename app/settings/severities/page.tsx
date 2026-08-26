import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../utils/supabase/server";
import SeverityEditor from "./SeverityEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SeveritySettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Company-wide severity settings are owner-only, matching AI Writing Studio.
  const { data: ownerMembership } = await supabase
    .from("company_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!ownerMembership) redirect("/settings");

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link href="/settings" className="text-sm font-bold text-slate-400 hover:text-teal-300">
            ← Settings
          </Link>
          <p className="mt-4 text-sm font-black uppercase tracking-[0.3em] text-teal-300">Report</p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">Severity Levels</h1>
          <p className="mt-4 max-w-2xl text-slate-300">
            Rename the severity levels, recolor them, reorder them (top = least serious), and add
            your own. Your names and colors show across every report, the client view, and the PDF.
            Mark a level as a <strong>safety/critical concern</strong> so it still counts toward
            safety findings and publish checks. Applies to your whole company, on every device.
          </p>
        </div>

        <SeverityEditor />
      </div>
    </main>
  );
}
