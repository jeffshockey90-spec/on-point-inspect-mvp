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

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";

  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);

  if (index === -1) return "";

  return decodeURIComponent(url.substring(index + marker.length));
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

  const photosWithUrls = await Promise.all(
    (photosRaw || []).map(async (photo: any) => {
      const filePath =
        photo.file_path ||
        getStoragePathFromUrl(photo.public_url) ||
        getStoragePathFromUrl(photo.image_url) ||
        getStoragePathFromUrl(photo.photo_url);

      if (!filePath) {
        return {
          ...photo,
          signed_url:
            photo.public_url ||
            photo.image_url ||
            photo.photo_url ||
            null,
        };
      }

      const { data, error } = await supabase.storage
        .from("inspection-photos")
        .createSignedUrl(filePath, 60 * 60);

      return {
        ...photo,
        signed_url:
          data?.signedUrl ||
          photo.public_url ||
          photo.image_url ||
          photo.photo_url ||
          null,
      };
    })
  );

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

  const findings = await Promise.all(
    (findingsRaw || []).map(async (finding: any) => {
      let signedImageUrl = finding.image_url || "";

      const oldImagePath = getStoragePathFromUrl(finding.image_url);

      if (oldImagePath) {
        const { data, error } = await supabase.storage
          .from("inspection-photos")
          .createSignedUrl(oldImagePath, 60 * 60);

        if (!error && data?.signedUrl) {
          signedImageUrl = data.signedUrl;
        }
      }

      return {
        ...finding,
        signed_image_url: signedImageUrl,
        photos: photosByFindingId[finding.id] || [],
      };
    })
  );

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
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <div className="mb-8 flex flex-wrap gap-3">
            <a
              href="javascript:window.print()"
              className="rounded-xl bg-black px-5 py-3 font-bold text-white hover:bg-slate-800"
            >
              Print / Save PDF
            </a>

            <a
              href="javascript:window.print()"
              className="rounded-xl bg-white px-5 py-3 font-bold text-black hover:bg-slate-200"
            >
              Export PDF
            </a>

            <Link
              href={`/reports/${inspection.id}/summary`}
              className="rounded-xl bg-purple-600 px-5 py-3 font-bold text-white hover:bg-purple-500"
            >
              Generate AI Summary
            </Link>

            <Link
              href={`/share/${inspection.id}`}
              className="rounded-xl bg-green-500 px-5 py-3 font-bold text-slate-950 hover:bg-green-400"
            >
              Publish Report
            </Link>

            <Link
              href={`/share/${inspection.id}`}
              className="rounded-xl border border-blue-500 px-5 py-3 font-bold text-blue-300 hover:bg-blue-500/10"
            >
              Copy Share Link
            </Link>

            <Link
              href={`/client/${inspection.id}`}
              className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 hover:bg-purple-500/10"
            >
              Send Report
            </Link>

            <Link
              href={`/repair-request?inspection_id=${inspection.id}`}
              className="rounded-xl bg-orange-600 px-5 py-3 font-bold text-white hover:bg-orange-500"
            >
              Repair Request Builder
            </Link>

            <Link
              href={`/reports/${inspection.id}/summary`}
              className="rounded-xl border border-cyan-500 px-5 py-3 font-bold text-cyan-300 hover:bg-cyan-500/10"
            >
              Realtor Summary
            </Link>

            <Link
              href={`/ai-capture?inspection_id=${inspection.id}`}
              className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400"
            >
              Open Full AI Capture
            </Link>

            <Link
              href={`/equipment-analyzer?inspection_id=${inspection.id}`}
              className="rounded-xl border border-blue-500 px-5 py-3 font-bold text-blue-300 hover:bg-blue-500/10"
            >
              Equipment Analyzer
            </Link>
          </div>

          <h1 className="text-5xl font-extrabold text-teal-400">
            On Point Home Inspections
          </h1>

          <p className="mt-3 text-xl text-slate-200">
            Residential Home Inspection Report
          </p>

          <div className="mt-8 border-t border-slate-700 pt-8">
            <h2 className="text-2xl font-bold text-teal-400">
              Inspection Details
            </h2>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-4 text-xl font-bold text-teal-300">
                  Inspection Information
                </h3>

                <InfoItem label="Property Address" value={inspection.address} />
                <InfoItem label="Client" value={inspection.client_name} />
                <InfoItem label="Client Email" value={inspection.client_email} />
                <InfoItem label="Realtor" value={inspection.realtor_name} />
                <InfoItem
                  label="Inspection Date"
                  value={inspection.inspection_date}
                />
              </div>

              <div>
                <h3 className="mb-4 text-xl font-bold text-teal-300">
                  Property / Site Information
                </h3>

                <InfoItem label="Square Feet" value={inspection.square_feet} />
                <InfoItem label="House Style" value={inspection.house_style} />
                <InfoItem label="Roof Style" value={inspection.roof_style} />
                <InfoItem label="Garage" value={inspection.garage} />
                <InfoItem
                  label="Location"
                  value={`${inspection.city || ""}, ${inspection.state || ""} ${
                    inspection.zip || ""
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        <ReportFindingsSortable
          inspectionId={String(inspection.id)}
          groupedFindings={groupedFindingsArray}
          allFindings={findings}
        />
      </div>
    </main>
  );
}

function InfoItem({ label, value }: { label: string; value: any }) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-sm font-bold text-slate-400">{label}</p>
      <div className="rounded-lg border border-slate-700 bg-[#020617] px-4 py-3 text-white">
        {value || "Not entered"}
      </div>
    </div>
  );
}