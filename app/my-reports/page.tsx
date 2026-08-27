import Link from "next/link";
import { createClient } from "../../utils/supabase/server";

export default async function MyReportsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: access } = await supabase
    .from("report_access")
    .select("*")
    .eq("user_id", user?.id)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-[var(--fl-ground)] text-[var(--fl-text)] p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold text-[var(--fl-accent-text)]">
          My Reports
        </h1>

        <p className="mt-2 text-[var(--fl-muted)]">
          Reports shared with your account.
        </p>

        <div className="mt-8 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-5">
          {access && access.length > 0 ? (
            <div className="space-y-3">
              {access.map((item) => (
                <Link
                  key={item.id}
                  href={`/reports/${item.report_id}`}
                  className="block rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4 hover:border-teal-400"
                >
                  <h2 className="font-semibold">
                    Report #{item.report_id}
                  </h2>

                  <p className="text-sm text-[var(--fl-muted)]">
                    Access type: {item.role}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[var(--fl-faint)]">
              No reports have been shared with you yet.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}