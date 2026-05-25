import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import ReportFindingsSortable from "./ReportFindingsSortable";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReportPage({ params }: PageProps) {
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
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .eq("inspector_id", user.id)
    .single();

  if (inspectionError || !inspection) {
    redirect("/reports");
  }

  const { data: findingsRaw, error: findingsError } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("section", { ascending: true })
    .order("created_at", { ascending: true });

  if (findingsError) {
    console.error("Findings load error:", findingsError);
  }

  const findingIds = (findingsRaw || []).map((finding: any) => finding.id);

  const { data: photosRaw, error: photosError } =
    findingIds.length > 0
      ? await supabase
          .from("photos")
          .select("*")
          .in("finding_id", findingIds)
      : { data: [], error: null };

  if (photosError) {
    console.error("Photos load error:", photosError);
  }

  const photosWithUrls = (photosRaw || []).map((photo: any) => ({
    ...photo,
    signed_url:
      photo.public_url ||
      photo.image_url ||
      photo.photo_url ||
      null,
  }));

  const photosByFindingId = photosWithUrls.reduce(
    (acc: Record<string, any[]>, photo: any) => {
      if (!photo.finding_id) return acc;

      if (!acc[photo.finding_id]) {
        acc[photo.finding_id] = [];
      }

      acc[photo.finding_id].push(photo);
      return acc;
    },
    {}
  );

  const findings = (findingsRaw || []).map((finding: any) => ({
    ...finding,
    photos: photosByFindingId[finding.id] || [],
  }));

  const groupedFindings = findings.reduce(
    (acc: Record<string, any[]>, finding: any) => {
      const section = finding.section || "General";

      if (!acc[section]) {
        acc[section] = [];
      }

      acc[section].push(finding);
      return acc;
    },
    {}
  );

  const groupedFindingsArray = Object.entries(groupedFindings).map(
    ([section, findings]) => ({
      section,
      findings,
    })
  );

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-400">Inspection Report</p>

            <h1 className="text-2xl font-bold text-white">
              {inspection.address || "Untitled Inspection"}
            </h1>

            <p className="mt-2 text-sm text-slate-300">
              {inspection.city}
              {inspection.state ? `, ${inspection.state}` : ""}{" "}
              {inspection.zip || ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/reports"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Back to Reports
            </Link>

            <Link
              href={`/ai-capture?inspection_id=${inspection.id}`}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
            >
              AI Capture
            </Link>

            <Link
              href={`/equipment-analyzer?inspection_id=${inspection.id}`}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Equipment Analyzer
            </Link>
          </div>
        </div>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Client
            </p>
            <p className="mt-1 font-semibold text-white">
              {inspection.client_name || "Not entered"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Realtor
            </p>
            <p className="mt-1 font-semibold text-white">
              {inspection.realtor_name || "Not entered"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Inspection Date
            </p>
            <p className="mt-1 font-semibold text-white">
              {inspection.inspection_date || "Not entered"}
            </p>
          </div>
        </section>

        <ReportFindingsSortable
          inspectionId={String(inspection.id)}
          groupedFindings={groupedFindingsArray}
          allFindings={findings}
        />
      </div>
    </main>
  );
}