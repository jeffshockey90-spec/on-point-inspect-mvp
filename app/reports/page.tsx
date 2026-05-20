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
    <main className="min-h-screen bg-black p-10 text-white">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-8 text-5xl font-bold text-teal-400">
          Saved Inspections
        </h1>

        {!inspections || inspections.length === 0 ? (
          <p className="text-zinc-400">No inspections saved yet.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {inspections.map((inspection: any) => (
              <div
                key={inspection.id}
                className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#050816]"
              >
                {inspection.property_image && (
                  <img
                    src={inspection.property_image}
                    alt="Property"
                    className="h-52 w-full object-cover"
                  />
                )}

                <div className="p-6">
                  <h2 className="text-2xl font-bold text-white">
                    {inspection.property_address || "Unnamed Property"}
                  </h2>

                  <p className="mt-2 text-zinc-400">
                    {inspection.city}, {inspection.state} {inspection.zip}
                  </p>

                  <p className="mt-2 text-zinc-400">
                    Built: {inspection.year_built || "N/A"}
                  </p>

                  <p className="text-zinc-400">
                    Style: {inspection.house_style || "N/A"}
                  </p>

                  <p className="mb-5 text-zinc-400">
                    Roof: {inspection.roof_style || "N/A"}
                  </p>

                  <Link
                    href={`/reports/${inspection.id}`}
                    className="inline-block rounded-xl bg-teal-500 px-5 py-3 font-bold text-black hover:bg-teal-400"
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