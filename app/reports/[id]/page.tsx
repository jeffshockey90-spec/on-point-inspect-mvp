import { supabase } from "../../../lib/supabaseClient";
import FindingGenerator from "../../../components/FindingGenerator";
import PrintButton from "../../../components/PrintButton";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const inspectionId = resolvedParams.id;

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .single();

  const { data: findings, error: findingsError } = await supabase
    .from("findings")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: false });

  if (inspectionError) {
    return (
      <main className="min-h-screen bg-black p-10 text-white">
        Error loading inspection: {inspectionError.message}
      </main>
    );
  }

  if (findingsError) {
    return (
      <main className="min-h-screen bg-black p-10 text-white">
        Error loading findings: {findingsError.message}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#e5e5e5] p-6 text-black">
      <div className="mx-auto max-w-5xl rounded-xl bg-white p-10 text-black shadow-xl">
        <div className="mb-8 flex justify-between print:hidden">
          <PrintButton />
        </div>

        <header className="border-b-4 border-teal-600 pb-6">
          <h1 className="text-4xl font-bold text-teal-700">
            On Point Home Inspections
          </h1>

          <p className="mt-2 text-lg font-semibold text-black">
            Residential Home Inspection Report
          </p>

          <p className="mt-4 text-sm text-gray-700">
            Protecting Your Investment. One Inspection at a Time.
          </p>
        </header>

        <section className="mt-8 rounded-xl border border-gray-300 p-6 text-black">
          <h2 className="mb-4 text-2xl font-bold text-teal-700">
            Property Information
          </h2>

          <div className="grid gap-3 md:grid-cols-2">
            <Info label="Property" value={inspection.property_address} />

            <Info
              label="Location"
              value={`${inspection.city || ""}, ${inspection.state || ""} ${
                inspection.zip || ""
              }`}
            />

            <Info label="Client" value={inspection.client_name} />
            <Info label="Client Email" value={inspection.client_email} />
            <Info label="Client Phone" value={inspection.client_phone} />
            <Info label="Realtor" value={inspection.realtor_name} />
            <Info label="Inspection Date" value={inspection.inspection_date} />
            <Info label="Inspection Time" value={inspection.inspection_time} />
            <Info label="Square Feet" value={inspection.square_feet} />

            <Info
              label="Price"
              value={inspection.price ? `$${inspection.price}` : ""}
            />
          </div>
        </section>

        <div className="print:hidden">
          <FindingGenerator reportId={inspectionId} />
        </div>

        {inspection.property_image && (
          <section className="mt-8">
            <img
              src={inspection.property_image}
              alt="Property"
              className="max-h-[450px] w-full rounded-xl border object-cover"
            />
          </section>
        )}

        <section className="mt-8 rounded-xl border border-gray-300 p-6 text-black">
          <h2 className="mb-4 text-2xl font-bold text-teal-700">
            Report Notice
          </h2>

          <p className="leading-7 text-gray-800">
            The purpose of this inspection is to identify visible defects and
            potential concerns at the time of the inspection. This report is not
            a pass or fail evaluation of the property and should not be
            interpreted as a determination of whether the property should or
            should not be purchased.
          </p>
        </section>

        <section className="mt-10 text-black">
          <h2 className="mb-6 text-3xl font-bold text-teal-700">
            Inspection Findings
          </h2>

          {!findings || findings.length === 0 ? (
            <p className="text-gray-700">No findings saved yet.</p>
          ) : (
            <div className="space-y-6">
              {findings.map((finding: any) => (
                <div
                  key={finding.id}
                  className="break-inside-avoid rounded-xl border border-gray-300 p-5 text-black"
                >
                  {finding.image_url && (
                    <img
                      src={finding.image_url}
                      alt="Finding"
                      className="mb-4 max-h-[425px] w-full rounded-lg border object-contain"
                    />
                  )}

                  <p className="mb-2 text-sm font-bold uppercase text-gray-600">
                    {finding.section}
                  </p>

                  <h3 className="text-xl font-bold text-teal-700">
                    {finding.title}
                  </h3>

                  {finding.observation && (
                    <ReportBlock title="Observation" text={finding.observation} />
                  )}

                  {finding.implication && (
                    <ReportBlock title="Implication" text={finding.implication} />
                  )}

                  {finding.recommendation && (
                    <ReportBlock
                      title="Recommendation"
                      text={finding.recommendation}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 border-t pt-6 text-sm text-gray-700">
          <p>
            On Point Home Inspections LLC • Licensed Home Inspector •
            InterNACHI® • AHIT • FAA Part 107
          </p>
        </footer>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div>
      <p className="text-sm font-bold text-gray-600">{label}</p>
      <p className="text-base text-black">{value || "N/A"}</p>
    </div>
  );
}

function ReportBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-4">
      <p className="font-bold text-gray-900">{title}</p>
      <p className="mt-1 whitespace-pre-line leading-7 text-gray-800">{text}</p>
    </div>
  );
}