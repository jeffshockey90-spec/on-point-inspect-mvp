import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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
    );

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
  // CREATE SIGNED URLS
  // =========================

  const photosWithSignedUrls =
    await Promise.all(
      (
        photosRaw || []
      ).map(
        async (photo: any) => {
          const filePath =
            photo.file_path ||
            photo.storage_path ||
            photo.path ||
            photo.photo_path;

          if (!filePath) {
            return {
              ...photo,
              signed_url: null,
            };
          }

          const cleanPath =
            String(filePath)
              .replace(
                /^inspection-photos\//,
                ""
              )
              .replace(
                /^\/+/,
                ""
              );

          const {
            data,
            error,
          } =
            await supabase.storage
              .from(
                "inspection-photos"
              )
              .createSignedUrl(
                cleanPath,
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
          !photo.finding_id
        ) {
          return acc;
        }

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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6">

        {/* HEADER */}

        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-400">
              Inspection Report
            </p>

            <h1 className="text-2xl font-bold text-white">
              {inspection.address ||
                "Untitled Inspection"}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/reports"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Back to Reports
            </Link>
          </div>
        </div>

        {/* DEBUG OUTPUT */}

        <div className="rounded-xl bg-red-950 p-6 text-white">
          <pre>
            {JSON.stringify(
              {
                findingsRaw,
                findings,
                groupedFindingsArray,
              },
              null,
              2
            )}
          </pre>
        </div>
      </div>
    </main>
  );
}