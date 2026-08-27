import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../utils/supabase/server";
import ReportTemplatesEditor from "./ReportTemplatesEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReportTemplatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link href="/settings" className="text-sm font-bold text-[var(--fl-muted)] hover:text-[var(--fl-accent-text)]">
            ← Settings
          </Link>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">Report</p>
          <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Report Templates</h1>
          <p className="mt-4 max-w-2xl text-[var(--fl-muted)]">
            Build named section sets for the kinds of inspections you do. Link a template to a service
            type and it applies automatically when that service is booked — and you can switch a
            report&apos;s template anytime in the builder. Shared with your whole team.
          </p>
        </div>

        <ReportTemplatesEditor />
      </div>
    </main>
  );
}
