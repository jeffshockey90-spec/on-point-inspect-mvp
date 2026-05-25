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

export default async function ReportPage({
  params,
}: PageProps) {
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
          cookiesToSet.forEach(
            ({ name, value, options }) => {
              cookieStore.set(
                name,
                value,
                options
              );
            }
          );
        },
      },
    }
  );

  // =========================
  // AUTH
  // =========================

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // =========================
  // LOAD INSPECTION
  // =========================

  const {
    data: inspection,
    error: inspectionError,
  } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .eq("inspector_id", user.id)
    .single();

  if (
    inspectionError ||
    !inspection
  ) {
    redirect("/reports");
  }

  // =========================
  // LOAD FINDINGS
  // =========================

  const {
    data: findingsRaw,
    error: findingsError,
  } = await supabase
    .from("findings")
    .select("*")
    .eq(
      "inspection_id",
      inspection.id
    )
    .order("section", {
      ascending: true,
    })
    .order("created_at", {
      ascending: true,
    });

  if (findingsError) {
    console.error(
      "Findings load error:",
      findingsError
    );
  }

  // =========================
  // LOAD PHOTOS
  // =========================

  const findingIds = (
    findingsRaw || []
  ).map(
    (finding: any) =>
      finding.id
  );

  const {
    data: photosRaw,
    error: photosError,
  } =
    findingIds.length > 0
      ? await supabase
          .from("photos")
          .select("*")
          .in(
            "finding_id",
            findingIds
          )
      : {
          data: [],
          error: null,
        };

  if (photosError) {
    console.error(
      "Photos load error:",
      photosError
    );
  }

  // =========================
  // CREATE SIGNED PHOTO URLS
  // =========================

  const photosWithSignedUrls =
    await Promise.all(
      (
        photosRaw || []
      ).map(
        async (photo: any) => {
          const filePath =
            photo.file_path;

          if (!filePath) {
            return {
              ...photo,
              signed_url: null,
            };
          }

          const {
            data,
            error,
          } =
            await supabase.storage
              .from(
                "inspection-photos"
              )
              .createSignedUrl(
                filePath,
                60 * 60
              );

          if (error) {
            console.error(
              "Signed URL error:",
              error
            );
          }

          return {
            ...photo,
            signed_url:
              data?.signedUrl ||
              null,
          };
        }
      )
    );

  // =========================
  // GROUP PHOTOS
  // =========================

  const photosByFindingId =
    photosWithSignedUrls.reduce(
      (
        acc: Record<
          string,
          any[]
        >,
        photo: any
      ) => {
        if (
          !acc[
            photo.finding_id
          ]
        ) {
          acc[
            photo.finding_id
          ] = [];
        }

        acc[
          photo.finding_id
        ].push(photo);

        return acc;
      },
      {}
    );

  // =========================
  // ATTACH PHOTOS
  // =========================

  const findings = (
    findingsRaw || []
  ).map(
    (finding: any) => ({
      ...finding,
      photos:
        photosByFindingId[
          finding.id
        ] || [],
    })
  );

  // =========================
  // GROUP FINDINGS
  // =========================

  const groupedFindings =
    findings.reduce(
      (
        acc: Record<
          string,
          any[]
        >,
        finding: any
      ) => {
        const section =
          finding.section ||
          "General";

        if (!acc[section]) {
          acc[section] = [];
        }

        acc[section].push(
          finding
        );

        return acc;
      },
      {}
    );

  const groupedFindingsArray =
    Object.entries(
      groupedFindings
    ).map(
      ([
        section,
        findings,
      ]) => ({
        section,
        findings,
      })
    );

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* HEADER */}

        <div className="mb-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

            <div>
              <p className="text-sm uppercase tracking-widest text-slate-400">
                Inspection Report
              </p>

              <h1 className="mt-2 text-4xl font-bold text-white">
                {inspection.address ||
                  "Untitled Inspection"}
              </h1>

              <p className="mt-2 text-slate-300">
                {inspection.city},{" "}
                {
                  inspection.state
                }{" "}
                {
                  inspection.zip
                }
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/reports"
                className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 font-semibold text-slate-200 hover:bg-slate-800"
              >
                Back to Reports
              </Link>

              <Link
                href={`/ai-capture?inspection_id=${inspection.id}`}
                className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400"
              >
                AI Capture
              </Link>

              <Link
                href={`/equipment-analyzer?inspection_id=${inspection.id}`}
                className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Equipment Analyzer
              </Link>
            </div>
          </div>
        </div>

        {/* INFO CARDS */}

        <div className="mb-8 grid gap-4 md:grid-cols-3">

          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Client
            </p>

            <p className="mt-2 text-xl font-semibold">
              {inspection.client_name ||
                "Not entered"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Realtor
            </p>

            <p className="mt-2 text-xl font-semibold">
              {inspection.realtor_name ||
                "Not entered"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5">
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Inspection Date
            </p>

            <p className="mt-2 text-xl font-semibold">
              {inspection.inspection_date ||
                "Not entered"}
            </p>
          </div>
        </div>

        {/* FINDINGS */}

        <ReportFindingsSortable
          inspectionId={
            String(
              inspection.id
            )
          }
          groupedFindings={
            groupedFindingsArray
          }
          allFindings={
            findings
          }
        />
      </div>
    </main>
  );
}