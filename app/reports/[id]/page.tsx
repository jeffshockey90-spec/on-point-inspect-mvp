import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@supabase/ssr";

import AiSummaryBanner from "./AiSummaryBanner";
import SendReportEmailButtons from "../../../components/SendReportEmailButtons";
import PrintButton from "../../../components/PrintButton";
import InsertFavoriteFindingButton from "../../../components/InsertFavoriteFindingButton";
import OneTapAIFindingInsert from "../../../components/OneTapAIFindingInsert";
import InspectionContactsManager from "../../../components/InspectionContactsManager";
import SendAgreementButton from "../../../components/SendAgreementButton";
import AgreementSelector from "../../../components/AgreementSelector";
import AgreementStatusPanel from "../../../components/AgreementStatusPanel";
import ReportDeliveryGuard from "../../../components/ReportDeliveryGuard";

type PageProps = {
  params: Promise<{ id: string }>;
};

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
          } catch {}
        },
      },
    }
  );
}

export default async function ReportPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  async function updateInspectionDetails(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const inspectionId = String(formData.get("inspection_id") || "");

    await supabase
      .from("inspections")
      .update({
        address: String(formData.get("address") || ""),
        client_name: String(formData.get("client_name") || ""),
        client_email: String(formData.get("client_email") || ""),
        realtor_name: String(formData.get("realtor_name") || ""),
        inspection_date: String(formData.get("inspection_date") || ""),
        square_feet: String(formData.get("square_feet") || ""),
        year_built: String(formData.get("year_built") || ""),
        city: String(formData.get("city") || ""),
        state: String(formData.get("state") || ""),
        zip: String(formData.get("zip") || ""),
      })
      .eq("id", inspectionId)
      .eq("inspector_id", user.id);

    revalidatePath(`/reports/${inspectionId}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: inspection, error } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", id)
    .eq("inspector_id", user.id)
    .single();

  if (error || !inspection) redirect("/reports");

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <AiSummaryBanner summary={inspection.report_summary} />

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

            <SendAgreementButton inspectionId={String(inspection.id)} />

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

            <InsertFavoriteFindingButton inspectionId={String(inspection.id)} />

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

            <OneTapAIFindingInsert inspectionId={String(inspection.id)} />

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
              inspectionId={String(inspection.id)}
              clientEmail={inspection.client_email}
              realtorEmail={inspection.realtor_email || inspection.agent_email}
            />
          </div>

          <InspectionContactsManager
            inspectionId={String(inspection.id)}
            defaultClientName={inspection.client_name}
            defaultClientEmail={inspection.client_email}
            defaultRealtorName={inspection.realtor_name}
            defaultRealtorEmail={inspection.realtor_email || inspection.agent_email}
          />

          <AgreementSelector
            inspectionId={String(inspection.id)}
            initialAgreementState={inspection.agreement_state}
            propertyState={inspection.state}
          />

          <AgreementStatusPanel inspectionId={String(inspection.id)} />

          <ReportDeliveryGuard inspectionId={String(inspection.id)} />

          <h1 className="mt-8 text-5xl font-extrabold text-teal-400">
            On Point Home Inspections
          </h1>

          <p className="mt-3 text-xl text-slate-200">
            Residential Home Inspection Report
          </p>

          <form
            action={updateInspectionDetails}
            className="mt-8 border-t border-slate-700 pt-8"
          >
            <input type="hidden" name="inspection_id" value={inspection.id} />

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

                <EditItem label="Property Address" name="address" value={inspection.address} />
                <EditItem label="Client" name="client_name" value={inspection.client_name} />
                <EditItem label="Client Email" name="client_email" value={inspection.client_email} />
                <EditItem label="Realtor" name="realtor_name" value={inspection.realtor_name} />
                <EditItem
                  label="Inspection Date"
                  name="inspection_date"
                  value={inspection.inspection_date}
                  type="date"
                />
              </div>

              <div>
                <h3 className="mb-4 text-xl font-bold text-teal-300">
                  Property / Site Information
                </h3>

                <EditItem label="Square Feet" name="square_feet" value={inspection.square_feet} />
                <EditItem label="Year Built" name="year_built" value={inspection.year_built} />

                <div className="grid grid-cols-3 gap-3">
                  <EditItem label="City" name="city" value={inspection.city} />
                  <EditItem label="State" name="state" value={inspection.state} />
                  <EditItem label="Zip" name="zip" value={inspection.zip} />
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-yellow-200">
          Report findings temporarily disabled for stability test.
        </div>
      </div>
    </main>
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