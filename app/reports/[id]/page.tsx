import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import ReportFindingsSortable from "./ReportFindingsSortable";

const SECTION_ORDER = [
  "Inspection Details",
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

type PageProps = {
  params: Promise<{ id: string }>;
};

function normalizeSection(section?: string | null) {
  if (!section) return "Inspection Details";

  const cleaned = section.trim();

  const aliases: Record<string, string> = {
    "Basement/Foundation/Crawlspace & Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Basement, Foundation, Crawlspace and Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Attic/Insulation & Ventilation": "Attic, Insulation & Ventilation",
    "Attic, Insulation and Ventilation": "Attic, Insulation & Ventilation",
    "Doors/Windows & Interior": "Doors, Windows & Interior",
    "Doors, Windows and Interior": "Doors, Windows & Interior",
    Appliances: "Built-in Appliances",
    "Built In Appliances": "Built-in Appliances",
    "Built-in Appliance": "Built-in Appliances",
  };

  return aliases[cleaned] || cleaned;
}

async function getSignedPhotoUrl(
  supabase: any,
  photo: any
): Promise<string | null> {
  if (photo?.signed_url) return photo.signed_url;
  if (photo?.public_url) return photo.public_url;
  if (photo?.image_url) return photo.image_url;

  const path =
    photo?.storage_path ||
    photo?.photo_path ||
    photo?.file_path ||
    photo?.path;

  if (!path) return null;

  const { data } = await supabase.storage
    .from("inspection-photos")
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  return data?.signedUrl || null;
}

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

  const { data: findingsData } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", id)
    .order("created_at", { ascending: true });

  const { data: photosData } = await supabase
    .from("inspection_photos")
    .select("*")
    .eq("inspection_id", id)
    .order("created_at", { ascending: true });

  const photosWithUrls = await Promise.all(
    (photosData || []).map(async (photo: any) => ({
      ...photo,
      signed_url: await getSignedPhotoUrl(supabase, photo),
    }))
  );

  const photosByFindingId = photosWithUrls.reduce((acc: any, photo: any) => {
    const findingId = photo.finding_id;

    if (!findingId) return acc;

    if (!acc[findingId]) acc[findingId] = [];
    acc[findingId].push(photo);

    return acc;
  }, {});

  const allFindings = (findingsData || []).map((finding: any) => {
    const findingPhotos = photosByFindingId[finding.id] || [];

    return {
      ...finding,
      section: normalizeSection(finding.section),
      photos: findingPhotos,
      image_url:
        finding.image_url ||
        findingPhotos?.[0]?.signed_url ||
        findingPhotos?.[0]?.image_url ||
        null,
    };
  });

  const groupedFindings = SECTION_ORDER.reduce((acc: any, section) => {
    acc[section] = allFindings.filter(
      (finding: any) => normalizeSection(finding.section) === section
    );
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-teal-500/20 bg-slate-900/80 p-5 shadow-lg shadow-teal-950/20">
          <div>
            <p className="text-sm font-medium text-teal-300">Inspection Report</p>
            <h1 className="mt-1 text-2xl font-bold text-white">
              {inspection.address || "Untitled Inspection"}
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              {[inspection.city, inspection.state, inspection.zip]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/reports"
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
            >
              Back to Reports
            </Link>

            <Link
              href={`/ai-capture?inspection_id=${id}&return_to=/reports/${id}`}
              className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400"
            >
              AI Capture
            </Link>

            <Link
              href={`/equipment-analyzer?inspection_id=${id}&return_to=/reports/${id}`}
              className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400"
            >
              Equipment Analyzer
            </Link>

            <Link
              href={`/reports/${id}/repair-request`}
              className="rounded-xl border border-teal-500/40 px-4 py-2 text-sm font-semibold text-teal-200 hover:bg-teal-500/10"
            >
              Repair Request
            </Link>

            <Link
              href={`/reports/${id}/share`}
              className="rounded-xl border border-teal-500/40 px-4 py-2 text-sm font-semibold text-teal-200 hover:bg-teal-500/10"
            >
              Share Portal
            </Link>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg">
          <ReportFindingsSortable
            inspectionId={id}
            groupedFindings={groupedFindings}
            allFindings={allFindings}
          />
        </section>
      </div>
    </main>
  );
}