import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

export default async function ReportsPage() {
  const { data: inspections, error } = await supabase
    .from("inspections")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-black p-10 text-white">
        Error loading inspections: {error.message}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-5xl font-bold text-teal-400">
              Saved Inspections
            </h1>

            <p className="mt-2 text-slate-400">
              Manage inspection reports, publishing,
              and client delivery.
            </p>
          </div>

          <Link
            href="/new"
            className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition hover:bg-teal-400"
          >
            New Inspection
          </Link>
        </div>

        {!inspections || inspections.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
            <p className="text-slate-400">
              No inspections saved yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {inspections.map((inspection: any) => (
              <div
                key={inspection.id}
                className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl"
              >
                {inspection.property_image ? (
                  <img
                    src={inspection.property_image}
                    alt="Property"
                    className="h-56 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center bg-slate-950 text-slate-500">
                    No Property Photo
                  </div>
                )}

                <div className="p-6">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        {inspection.property_address ||
                          "Unnamed Property"}
                      </h2>

                      <p className="mt-2 text-slate-400">
                        {inspection.city},{" "}
                        {inspection.state}{" "}
                        {inspection.zip}
                      </p>
                    </div>

                    <div>
                      {inspection.published ? (
                        <div className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-green-400">
                          Published
                        </div>
                      ) : (
                        <div className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-400">
                          Draft
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-slate-400">
                    <p>
                      <span className="font-semibold text-slate-300">
                        Client:
                      </span>{" "}
                      {inspection.client_name || "N/A"}
                    </p>

                    <p>
                      <span className="font-semibold text-slate-300">
                        Realtor:
                      </span>{" "}
                      {inspection.realtor_name || "N/A"}
                    </p>

                    <p>
                      <span className="font-semibold text-slate-300">
                        Year Built:
                      </span>{" "}
                      {inspection.year_built || "N/A"}
                    </p>

                    <p>
                      <span className="font-semibold text-slate-300">
                        Style:
                      </span>{" "}
                      {inspection.house_style || "N/A"}
                    </p>

                    <p>
                      <span className="font-semibold text-slate-300">
                        Roof:
                      </span>{" "}
                      {inspection.roof_style || "N/A"}
                    </p>

                    <p>
                      <span className="font-semibold text-slate-300">
                        Inspection Date:
                      </span>{" "}
                      {inspection.inspection_date || "N/A"}
                    </p>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      href={`/reports/${inspection.id}`}
                      className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition hover:bg-teal-400"
                    >
                      Open Report
                    </Link>

                    {inspection.published && (
                      <a
                        href={`/reports/${inspection.id}?token=${inspection.share_token}`}
                        target="_blank"
                        className="rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-300 transition hover:border-teal-400 hover:text-teal-400"
                      >
                        Public Link
                      </a>
                    )}
                  </div>

                  {inspection.published_at && (
                    <p className="mt-4 text-xs text-slate-500">
                      Published:{" "}
                      {new Date(
                        inspection.published_at
                      ).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}