import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import DeleteInspectionButton from "../../components/DeleteInspectionButton";

export default async function ReportsPage() {
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
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-[#020617] p-8 text-white">
        <h1 className="text-3xl font-bold text-red-400">
          Error loading reports
        </h1>
        <p className="mt-4 text-slate-300">{error.message}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-5xl font-bold text-teal-400">
              Saved Inspections
            </h1>

            <p className="mt-3 text-slate-300">
              Manage inspection reports, publishing, and client delivery.
            </p>
          </div>

          <Link
            href="/inspections/new"
            className="rounded-xl bg-teal-500 px-6 py-3 font-bold text-black hover:bg-teal-400"
          >
            New Inspection
          </Link>
        </div>

        {(inspections || []).length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
            <p className="text-slate-300">No saved inspections found.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {inspections?.map((inspection: any) => {
              const isInspectorOwner =
                inspection.inspector_id && inspection.inspector_id === user.id;

              const propertyPhoto =
                inspection.street_view_url ||
                inspection.property_image ||
                inspection.property_photo ||
                "";

              return (
                <div
                  key={inspection.id}
                  className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl"
                >
                  <div className="flex h-56 items-center justify-center overflow-hidden bg-slate-950 text-slate-500">
                    {propertyPhoto ? (
                      <img
                        src={propertyPhoto}
                        alt="Property"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span>No Property Photo</span>
                    )}
                  </div>

                  <div className="p-6">
                    <h2 className="text-2xl font-bold text-white">
                      {inspection.property_address || "Untitled Inspection"}
                    </h2>

                    <p className="mt-3 text-slate-300">
                      {inspection.city || ""}
                      {inspection.state ? `, ${inspection.state}` : ""}{" "}
                      {inspection.zip || ""}
                    </p>

                    <div className="mt-5 space-y-2 text-sm text-slate-300">
                      <p>
                        <span className="font-bold text-white">Client:</span>{" "}
                        {inspection.client_name || "N/A"}
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
                      <Link
                        href={`/reports/${inspection.id}`}
                        className="inline-block rounded-xl bg-teal-500 px-5 py-3 text-center font-bold text-black hover:bg-teal-400"
                      >
                        Open Report
                      </Link>

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