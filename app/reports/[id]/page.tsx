import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import ReportFindingsSortable from "./ReportFindingsSortable";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: inspection } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .single();

  const { data: findings } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", id)
    .order("created_at", { ascending: true });

  const grouped = [
    {
      section: "All Findings",
      findings: findings || [],
    },
  ];

  return (
    <main className="min-h-screen bg-[#020617] text-white p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-4xl font-black text-teal-400">
            {inspection?.address || "Inspection Report"}
          </h1>

          <Link
            href="/reports"
            className="rounded-xl border border-slate-600 px-4 py-2"
          >
            Back
          </Link>
        </div>

        <ReportFindingsSortable
          inspectionId={String(id)}
          groupedFindings={grouped}
          allFindings={findings || []}
        />
      </div>
    </main>
  );
}
