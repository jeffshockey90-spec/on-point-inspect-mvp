import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@supabase/ssr";

import ReportFindingsSortable from "./ReportFindingsSortable";
import AiSummaryBanner from "./AiSummaryBanner";
import SendReportEmailButtons from "../../../components/SendReportEmailButtons";
import PrintButton from "../../../components/PrintButton";
import InsertFavoriteFindingButton from "../../../components/InsertFavoriteFindingButton";
import OneTapAIFindingInsert from "../../../components/OneTapAIFindingInsert";
import InspectionContactsManager from "../../../components/InspectionContactsManager";
import SendAgreementButton from "../../../components/SendAgreementButton";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

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
  "Disclaimers",
  "Garage",
];

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot always set cookies.
          }
        },
      },
    }
  );
}

function normalizeSection(section: string | null | undefined) {
  if (!section) return "Inspection Details";

  const clean = section.trim();

  const aliases: Record<string, string> = {
    General: "Inspection Details",
    Safety: "Inspection Details",
    "Basement/Foundation/Crawlspace & Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Basement, Foundation, Crawlspace and Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Attic/Insulation & Ventilation": "Attic, Insulation & Ventilation",
    "Attic, Insulation and Ventilation":
      "Attic, Insulation & Ventilation",
    "Doors/Windows & Interior": "Doors, Windows & Interior",
    "Doors, Windows and Interior":
      "Doors, Windows & Interior",
    Appliances: "Built-in Appliances",
    "Built In Appliances": "Built-in Appliances",
  };

  return aliases[clean] || clean;
}

function getStoragePathFromUrl(url: string | null | undefined) {
  if (!url) return "";

  const marker = "/inspection-photos/";
  const index = url.indexOf(marker);

  if (index === -1) return "";

  return decodeURIComponent(
    url.substring(index + marker.length)
  );
}

export default async function ReportPage({
  params,
}: PageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  async function updateInspectionDetails(
    formData: FormData
  ) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const inspectionId = String(
      formData.get("inspection_id") || ""
    );

    const updates = {
      address: String(formData.get("address") || ""),
      client_name: String(
        formData.get("client_name") || ""
      ),
      client_email: String(
        formData.get("client_email") || ""
      ),
      realtor_name: String(
        formData.get("realtor_name") || ""
      ),
      inspection_date: String(
        formData.get("inspection_date") || ""
      ),
      square_feet: String(
        formData.get("square_feet") || ""
      ),
      year_built: String(
        formData.get("year_built") || ""
      ),
      city: String(formData.get("city") || ""),
      state: String(formData.get("state") || ""),
      zip: String(formData.get("zip") || ""),
    };

    await supabase
      .from("inspections")
      .update(updates)
      .eq("id", inspectionId)
      .eq("inspector_id", user.id);

    revalidatePath(`/reports/${inspectionId}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data: inspection,
    error: inspectionError,
  } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .eq("inspector_id", user.id)
    .single();

  if (inspectionError || !inspection) {
    redirect("/reports");
  }

  const {
    data: findingsRaw,
    error: findingsError,
  } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", inspection.id)
    .order("created_at", { ascending: true });

  if (findingsError) {
    console.error(
      "Findings load error:",
      findingsError
    );
  }

  const findingIds = (findingsRaw || []).map(
    (finding: any) => finding.id
  );

  const {
    data: photosRaw,
    error: photosError,
  } =
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
        photo.storage_path ||
        photo.photo_path ||
        getStoragePathFromUrl(photo.public_url) ||
        getStoragePathFromUrl(photo.image_url) ||
        getStoragePathFromUrl(photo.photo_url);

      if (!filePath) {
        return {
          ...photo,
          signed_url:
            photo.signed_url ||
            photo.public_url ||
            photo.image_url ||
            photo.photo_url ||
            null,
        };
      }

      const { data } = await supabase.storage
        .from("inspection-photos")
        .createSignedUrl(
          filePath,
          60 * 60 * 24 * 7
        );

      return {
        ...photo,
        signed_url:
          data?.signedUrl ||
          photo.signed_url ||
          photo.public_url ||
          photo.image_url ||
          photo.photo_url ||
          null,
      };
    })
  );

  const photosByFindingId = photosWithUrls.reduce(
    (
      acc: Record<string, any[]>,
      photo: any
    ) => {
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
      let signedImageUrl =
        finding.image_url || "";

      const oldImagePath = getStoragePathFromUrl(
        finding.image_url
      );

      if (oldImagePath) {
        const { data, error } =
          await supabase.storage
            .from("inspection-photos")
            .createSignedUrl(
              oldImagePath,
              60 * 60 * 24 * 7
            );

        if (!error && data?.signedUrl) {
          signedImageUrl = data.signedUrl;
        }
      }

      const normalizedSection =
        normalizeSection(finding.section);

      return {
        ...finding,
        section: normalizedSection,
        signed_image_url: signedImageUrl,
        image_url:
          signedImageUrl ||
          finding.image_url ||
          null,
        photos:
          photosByFindingId[finding.id] || [],
      };
    })
  );

  const groupedFindingsArray =
    SECTION_ORDER.map((section) => ({
      section,
      findings: findings.filter(
        (finding: any) =>
          finding.section === section
      ),
    }));

  const defectFindings = findings.filter(
    (finding: any) => {
      const section = String(
        finding.section || ""
      ).toLowerCase();

      const title = String(
        finding.title || ""
      ).toLowerCase();

      if (section === "inspection details")
        return false;

      if (section === "disclaimers")
        return false;

      if (title === "in attendance")
        return false;

      if (title === "occupancy")
        return false;

      if (title === "style")
        return false;

      if (title === "temperature")
        return false;

      if (title === "type of building")
        return false;

      if (title === "weather conditions")
        return false;

      return true;
    }
  );

  const defectTotals = defectFindings.reduce(
    (
      acc: Record<string, number>,
      finding: any
    ) => {
      const severity = String(
        finding.severity ||
          "Recommended Repair"
      ).toLowerCase();

      acc.total += 1;

      if (
        severity.includes("safety") ||
        severity.includes("hazard") ||
        severity.includes("major")
      ) {
        acc.safety += 1;
      } else if (
        severity.includes("maintenance") ||
        severity.includes("monitor") ||
        severity.includes("minor")
      ) {
        acc.maintenance += 1;
      } else if (
        severity.includes("information") ||
        severity.includes("info") ||
        severity.includes("client")
      ) {
        acc.information += 1;
      } else {
        acc.repair += 1;
      }

      return acc;
    },
    {
      total: 0,
      safety: 0,
      repair: 0,
      maintenance: 0,
      information: 0,
    }
  );

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <AiSummaryBanner
          summary={inspection.report_summary}
        />

        <div className="mb-8 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <div className="mb-8 flex flex-wrap gap-3">
            <PrintButton
              label="Print / Save PDF"
              className="rounded-xl bg-black px-5 py-3 font-bold text-white hover:bg-slate-800"
            />

            <Link
              href={`/reports/${inspection.id}/print`}
              className="rounded-xl bg-white px-5 py-3 font-bold text-black hover:bg-slate-200"
            >
              Export PDF
            </Link>

            <Link
              href={`/reports/${inspection.id}/summary`}
              className="rounded-xl border border-teal-500 bg-[#071224] px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
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
              href={`/client-portal/${inspection.id}`}
              className="rounded-xl border border-emerald-500 px-5 py-3 font-bold text-emerald-300 hover:bg-emerald-500/10"
            >
              Client Portal
            </Link>

            <Link
              href={`/client/${inspection.id}`}
              className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 hover:bg-purple-500/10"
            >
              Send Report
            </Link>

            <SendAgreementButton
              inspectionId={String(inspection.id)}
            />

            <Link
              href={`/repair-request?inspection_id=${inspection.id}`}
              className="rounded-xl bg-orange-600 px-5 py-3 font-bold text-white hover:bg-orange-500"
            >
              Repair Request Builder
            </Link>

            <Link
              href={`/reports/${inspection.id}/templates`}
              className="rounded-xl border border-yellow-500 px-5 py-3 font-bold text-yellow-300 hover:bg-yellow-500/10"
            >
              Favorite Findings
            </Link>

            <InsertFavoriteFindingButton
              inspectionId={String(inspection.id)}
            />

            <Link
              href={`/reports/${inspection.id}/summary`}
              className="rounded-xl border border-cyan-500 px-5 py-3 font-bold text-cyan-300 hover:bg-cyan-500/10"
            >
              Realtor Summary
            </Link>

            <Link
              href={`/field?inspection_id=${inspection.id}&return_to=/reports/${inspection.id}`}
              className="rounded-xl border border-teal-500 bg-[#071224] px-5 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
            >
              Field Tool
            </Link>

            <Link
              href={`/ai-capture?inspection_id=${inspection.id}&return_to=/reports/${inspection.id}`}
              className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400"
            >
              Open Full AI Capture
            </Link>

            <OneTapAIFindingInsert
              inspectionId={String(inspection.id)}
            />

            <Link
              href={`/equipment-analyzer?inspection_id=${inspection.id}&return_to=/reports/${inspection.id}`}
              className="rounded-xl border border-blue-500 px-5 py-3 font-bold text-blue-300 hover:bg-blue-500/10"
            >
              Equipment Analyzer
            </Link>
          </div>

          <div className="mb-8 rounded-2xl border border-slate-700 bg-[#071224] p-5">
            <h2 className="mb-4 text-2xl font-bold text-teal-300">
              Email Report
            </h2>

            <SendReportEmailButtons
              inspectionId={String(
                inspection.id
              )}
              clientEmail={
                inspection.client_email
              }
              realtorEmail={
                inspection.realtor_email ||
                inspection.agent_email
              }
            />
          </div>

          <InspectionContactsManager
            inspectionId={String(inspection.id)}
            defaultClientName={inspection.client_name}
            defaultClientEmail={inspection.client_email}
            defaultRealtorName={inspection.realtor_name}
            defaultRealtorEmail={
              inspection.realtor_email ||
              inspection.agent_email
            }
          />

          {(inspection.property_image ||
            inspection.street_view_url ||
            inspection.cover_photo_url ||
            inspection.google_photo_url ||
            inspection.property_photo_url ||
            inspection.place_photo_url ||
            inspection.photo_url ||
            inspection.image_url) && (
            <div className="mb-6 overflow-hidden rounded-2xl border border-slate-700 bg-black">
              <img
                src={
                  inspection.property_image ||
                  inspection.street_view_url ||
                  inspection.cover_photo_url ||
                  inspection.google_photo_url ||
                  inspection.property_photo_url ||
                  inspection.place_photo_url ||
                  inspection.photo_url ||
                  inspection.image_url
                }
                alt="Property"
                className="h-56 w-full object-cover"
              />
            </div>
          )}

          <h1 className="text-5xl font-extrabold text-teal-400">
            On Point Home Inspections
          </h1>

          <p className="mt-3 text-xl text-slate-200">
            Residential Home Inspection Report
          </p>

          <section className="mt-6 rounded-2xl border border-slate-700 bg-[#071224] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-extrabold text-teal-300">
                  Defect Totals
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Quick count of report findings
                  by defect type.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <DefectCountCard
                label="Total Defects"
                value={defectTotals.total}
                tone="text-white"
              />

              <DefectCountCard
                label="Safety / Major"
                value={defectTotals.safety}
                tone="text-red-300"
              />

              <DefectCountCard
                label="Recommended Repair"
                value={defectTotals.repair}
                tone="text-teal-300"
              />

              <DefectCountCard
                label="Maintenance / Monitor"
                value={
                  defectTotals.maintenance
                }
                tone="text-yellow-300"
              />

              <DefectCountCard
                label="Informational"
                value={
                  defectTotals.information
                }
                tone="text-blue-300"
              />
            </div>
          </section>

          <form
            action={updateInspectionDetails}
            className="mt-8 border-t border-slate-700 pt-8"
          >
            <input
              type="hidden"
              name="inspection_id"
              value={inspection.id}
            />

            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold text-teal-400">
                Inspection Details
              </h2>

              <button
                type="submit"
                className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400"
              >
                Save Inspection Details
              </button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-4 text-xl font-bold text-teal-300">
                  Inspection Information
                </h3>

                <EditItem
                  label="Property Address"
                  name="address"
                  value={inspection.address}
                />

                <EditItem
                  label="Client"
                  name="client_name"
                  value={
                    inspection.client_name
                  }
                />

                <EditItem
                  label="Client Email"
                  name="client_email"
                  value={
                    inspection.client_email
                  }
                />

                <EditItem
                  label="Realtor"
                  name="realtor_name"
                  value={
                    inspection.realtor_name
                  }
                />

                <EditItem
                  label="Inspection Date"
                  name="inspection_date"
                  value={
                    inspection.inspection_date
                  }
                  type="date"
                />
              </div>

              <div>
                <h3 className="mb-4 text-xl font-bold text-teal-300">
                  Property / Site Information
                </h3>

                <EditItem
                  label="Square Feet"
                  name="square_feet"
                  value={
                    inspection.square_feet
                  }
                />

                <EditItem
                  label="Year Built"
                  name="year_built"
                  value={inspection.year_built}
                />

                <div className="grid grid-cols-3 gap-3">
                  <EditItem
                    label="City"
                    name="city"
                    value={inspection.city}
                  />

                  <EditItem
                    label="State"
                    name="state"
                    value={inspection.state}
                  />

                  <EditItem
                    label="Zip"
                    name="zip"
                    value={inspection.zip}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        <ReportFindingsSortable
          inspectionId={String(inspection.id)}
          groupedFindings={
            groupedFindingsArray
          }
          allFindings={findings}
        />
      </div>
    </main>
  );
}

function DefectCountCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p
        className={`mt-2 text-3xl font-black ${tone}`}
      >
        {value}
      </p>
    </div>
  );
}

function EditItem({
  label,
  name,
  value,
  type = "text",
}: {
  label: string;
  name: string;
  value: any;
  type?: string;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-sm font-bold text-slate-400">
        {label}
      </label>

      <input
        type={type}
        name={name}
        defaultValue={value || ""}
        placeholder="Not entered"
        className="w-full rounded-lg border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-teal-400"
      />
    </div>
  );
}