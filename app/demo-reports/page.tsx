import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import DeleteInspectionButton from "../../components/DeleteInspectionButton";
import FastLinkButton from "../../components/FastLinkButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
        setAll() {},
      },
    }
  );
}

export default async function DemoReportsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userEmail = user.email || "";

  const { data: inspections, error } = await supabase
    .from("inspections")
    .select("*")
    .or(
      `inspector_id.eq.${user.id},client_email.eq.${userEmail},realtor_email.eq.${userEmail}`
    )
    .or("is_demo.eq.true,demo_enabled.eq.true")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-[#0a0e13] p-8 text-white">
        <h1 className="text-3xl font-bold text-red-400">
          Error loading demo reports
        </h1>
        <p className="mt-4 text-[#8a93a3]">{error.message}</p>
      </main>
    );
  }

  const rows = inspections || [];

  return (
    <main className="min-h-screen bg-[#0a0e13] px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-5xl font-bold text-cyan-300">
              Demo Reports
            </h1>

            <p className="mt-3 text-[#8a93a3]">
              Sample and demo inspections are kept separate from normal saved inspections.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <FastLinkButton
              href="/reports"
              loadingText="Opening Reports..."
              className="rounded-xl bg-teal-500 px-6 py-3 font-bold text-black hover:bg-teal-400"
            >
              Normal Reports
            </FastLinkButton>

            <FastLinkButton
              href="/import-report"
              loadingText="Opening Importer..."
              className="rounded-xl border border-amber-500 bg-amber-500/10 px-6 py-3 font-bold text-amber-300 hover:bg-amber-500/20"
            >
              Import Report
            </FastLinkButton>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-[#1a212c] bg-[#131923] p-8">
            <p className="text-[#8a93a3]">
              No demo reports found. Use Save As Sample/Demo from a completed report and it will show here.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {rows.map((inspection: any) => {
              const isInspectorOwner =
                inspection.inspector_id && inspection.inspector_id === user.id;

              const propertyPhoto =
                inspection.street_view_url ||
                inspection.streetview_url ||
                inspection.streetview_image ||
                inspection.cover_photo_url ||
                inspection.property_photo_url ||
                inspection.property_image_url ||
                inspection.image_url ||
                inspection.photo_url ||
                inspection.cover_image ||
                inspection.hero_image ||
                inspection.report_image ||
                inspection.property_image ||
                inspection.property_photo ||
                "";

              return (
                <div
                  key={inspection.id}
                  className="overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#131923] shadow-xl"
                >
                  <div className="relative flex h-56 items-center justify-center overflow-hidden bg-[#0a0e13] text-[#59626f]">
                    {propertyPhoto ? (
                      <img
                        src={propertyPhoto}
                        alt="Property"
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span>No Property Photo</span>
                    )}

                    <span className="absolute left-3 top-3 rounded-full border border-cyan-400/70 bg-cyan-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-100 backdrop-blur">
                      Demo
                    </span>
                  </div>

                  <div className="p-6">
                    <h2 className="text-2xl font-bold text-white">
                      {inspection.property_address || "Untitled Demo Report"}
                    </h2>

                    <p className="mt-3 text-[#8a93a3]">
                      {inspection.city || ""}
                      {inspection.state ? `, ${inspection.state}` : ""}{" "}
                      {inspection.zip || ""}
                    </p>

                    <div className="mt-5 space-y-2 text-sm text-[#8a93a3]">
                      <p>
                        <span className="font-bold text-white">Client:</span>{" "}
                        {inspection.client_name || "Demo Client"}
                      </p>

                      <p>
                        <span className="font-bold text-white">Realtor:</span>{" "}
                        {inspection.realtor_name || "N/A"}
                      </p>

                      <p>
                        <span className="font-bold text-white">
                          Inspection Date:
                        </span>{" "}
                        {inspection.inspection_date || "N/A"}
                      </p>
                    </div>

                    <div className="mt-6 flex flex-col gap-3">
                      <FastLinkButton
                        href={`/demo/${inspection.id}`}
                        loadingText="Opening Demo..."
                        className="rounded-xl bg-cyan-400 px-5 py-3 text-center font-bold text-black hover:bg-cyan-300"
                      >
                        Open Demo Report
                      </FastLinkButton>

                      <FastLinkButton
                        href={`/reports/${inspection.id}`}
                        loadingText="Opening Editor..."
                        className="rounded-xl border border-[#232b38] px-5 py-3 text-center font-bold text-[#e8ecf3] hover:bg-[#1a212c]"
                      >
                        Edit Demo
                      </FastLinkButton>

                      {isInspectorOwner && (
                        <DeleteInspectionButton inspectionId={inspection.id} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
