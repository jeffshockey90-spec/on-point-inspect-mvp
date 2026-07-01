import { createClient } from "@supabase/supabase-js";
import RepairResponseForm from "./RepairResponseForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ token: string }>;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function cleanText(value: any) {
  return String(value || "").trim();
}

function getPhotoUrl(finding: any) {
  const candidates = [
    finding?.photo_url,
    finding?.image_url,
    finding?.media_url,
    finding?.primary_photo_url,
    Array.isArray(finding?.photos) ? finding.photos[0] : null,
    Array.isArray(finding?.photo_urls) ? finding.photo_urls[0] : null,
    Array.isArray(finding?.images) ? finding.images[0] : null,
  ];

  const found = candidates.find((item) => typeof item === "string" && item.trim());
  return found ? String(found) : "";
}

export default async function RepairResponsePage({ params }: PageProps) {
  const { token } = await params;

  const { data: share } = await supabase
    .from("repair_request_shares")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!share) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-500/40 bg-red-950/30 p-6">
          <h1 className="text-2xl font-bold">Repair request not found</h1>
          <p className="mt-3 text-slate-200">This secure link is invalid or no longer available.</p>
        </div>
      </main>
    );
  }

  const selectedIds = Array.isArray(share.selected_finding_ids)
    ? share.selected_finding_ids.map((id: any) => String(id))
    : [];

  const { data: inspection } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", share.inspection_id)
    .maybeSingle();

  const { data: findingsRaw } = selectedIds.length
    ? await supabase.from("findings").select("*").in("id", selectedIds)
    : { data: [] as any[] };

  const findingsById = new Map((findingsRaw || []).map((finding: any) => [String(finding.id), finding]));
  const findings = selectedIds.map((id: string) => findingsById.get(id)).filter(Boolean);

  const { data: responsesRaw } = await supabase
    .from("repair_request_responses")
    .select("*")
    .eq("share_id", share.id);

  const existingResponses = (responsesRaw || []).reduce((acc: Record<string, any>, response: any) => {
    acc[String(response.finding_id)] = response;
    return acc;
  }, {});

  const property =
    cleanText(inspection?.property_address) || cleanText(inspection?.address) || "Repair Request";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:py-10">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-2xl border border-teal-400/30 bg-slate-900 p-5 shadow-xl sm:p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-teal-300">
            On Point Home Inspections
          </p>
          <h1 className="mt-3 text-2xl font-bold sm:text-4xl">Repair Request Response</h1>
          <p className="mt-2 text-lg text-slate-200">{property}</p>
          {share.summary ? <p className="mt-4 text-sm leading-6 text-slate-300">{share.summary}</p> : null}
          {share.status === "completed" ? (
            <div className="mt-5 rounded-xl border border-green-400/30 bg-green-500/10 p-4 text-sm text-green-100">
              This response has already been submitted. You can update it and submit again if needed.
            </div>
          ) : null}
        </section>

        <RepairResponseForm
          token={token}
          shareId={share.id}
          findings={findings.map((finding: any) => ({
            id: String(finding.id),
            section: cleanText(finding.section),
            title: cleanText(finding.title) || cleanText(finding.name) || "Repair Item",
            comment:
              cleanText(finding.comment) ||
              cleanText(finding.description) ||
              cleanText(finding.recommendation) ||
              cleanText(finding.notes),
            photoUrl: getPhotoUrl(finding),
            existingStatus: existingResponses[String(finding.id)]?.response_status || "pending",
            existingNotes: existingResponses[String(finding.id)]?.notes || "",
          }))}
        />
      </div>
    </main>
  );
}
