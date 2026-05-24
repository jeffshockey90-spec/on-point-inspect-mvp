import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

export default async function ReportsPage() {
  const { data: inspections, error } = await supabase
    .from("inspections")
    .select("*")
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
            {inspections?.map((inspection: any) => (
              <div
                key={inspection.id}
                className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl"
              >
                <div className="flex h-56 items-center justify-center overflow-hidden bg-slate-950 text-slate-500">
                  {inspection.street_view_url ? (
                    <img
                      src={inspection.street_view_url}
                      alt="Property"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>No Property Photo</span>
                  )}
                </div>

                <div className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-2xl font-bold text-white">
                      {inspection.property_address || "Untitled Inspection"}
                    </h2>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        inspection.published
                          ? "bg-green-500/20 text-green-300"
                          : "bg-yellow-500/20 text-yellow-300"
                      }`}
                    >
                      {inspection.published ? "PUBLISHED" : "DRAFT"}
                    </span>
                  </div>

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
                      <span className="font-bold text-white">Year Built:</span>{" "}
                      {inspection.year_built || "N/A"}
                    </p>

                    <p>
                      <span className="font-bold text-white">Style:</span>{" "}
                      {inspection.house_style || "N/A"}
                    </p>

                    <p>
                      <span className="font-bold text-white">Roof:</span>{" "}
                      {inspection.roof_style || "N/A"}
                    </p>

                    <p>
                      <span className="font-bold text-white">
                        Inspection Date:
                      </span>{" "}
                      {inspection.inspection_date || "N/A"}
                    </p>
                  </div>

                  <Link
                    href={`/reports/${inspection.id}`}
                    className="mt-6 inline-block rounded-xl bg-teal-500 px-5 py-3 font-bold text-black hover:bg-teal-400"
                  >
                    Open Report
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}