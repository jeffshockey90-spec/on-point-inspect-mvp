import { createClient } from "@supabase/supabase-js";
import RepairResponseForm from "./RepairResponseForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function getPropertyLabel(inspection: any) {
  return (
    inspection?.property_address ||
    inspection?.address ||
    inspection?.street_address ||
    "Inspection report"
  );
}

function normalizeIds(value: any) {
  if (!Array.isArray(value)) return [];
  return value.map((id) => String(id)).filter(Boolean);
}

function sortBySelectedIds(findings: any[], selectedIds: string[]) {
  const order = new Map(selectedIds.map((id, index) => [String(id), index]));
  return [...findings].sort((a, b) => {
    return (order.get(String(a.id)) ?? 999999) - (order.get(String(b.id)) ?? 999999);
  });
}

function formatDate(value: any) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-US");
}

export default async function RepairResponsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const cleanToken = String(token || "").trim();

  if (!cleanToken) {
    return (
      <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
        <section className="mx-auto max-w-4xl rounded-2xl border border-red-500/40 bg-red-500/10 p-6">
          <h1 className="text-3xl font-black text-red-200">Invalid Link</h1>
          <p className="mt-3 text-red-100">This repair request link is missing a token.</p>
        </section>
      </main>
    );
  }

  const supabase = createAdminClient();

  const { data: share, error: shareError } = await supabase
    .from("repair_request_shares")
    .select("*")
    .eq("token", cleanToken)
    .maybeSingle();

  if (shareError || !share) {
    return (
      <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
        <section className="mx-auto max-w-4xl rounded-2xl border border-red-500/40 bg-red-500/10 p-6">
          <h1 className="text-3xl font-black text-red-200">Repair Request Not Found</h1>
          <p className="mt-3 text-red-100">
            This secure repair request link is invalid or no longer available.
          </p>
        </section>
      </main>
    );
  }

  const selectedIds = normalizeIds(share.selected_finding_ids);

  const { data: inspection } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", share.inspection_id)
    .maybeSingle();

  let findings: any[] = [];

  if (selectedIds.length) {
    const { data: findingsRaw } = await supabase
      .from("findings")
      .select("*")
      .eq("inspection_id", share.inspection_id)
      .in("id", selectedIds);

    findings = sortBySelectedIds(findingsRaw || [], selectedIds);
  }

  const { data: responsesRaw } = await supabase
    .from("repair_request_responses")
    .select("finding_id, response_status, notes")
    .eq("share_id", share.id);

  const answeredCount = Array.isArray(responsesRaw) ? responsesRaw.length : 0;
  const property = getPropertyLabel(inspection);
  const submitted = Boolean(share.responded_at);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020617] p-4 pb-16 text-white md:p-8">
      <div className="mx-auto max-w-5xl">
        <section className="mb-6 rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-xl md:p-6">
          <p className="break-words text-sm font-black uppercase tracking-[0.22em] text-teal-400 md:tracking-[0.3em]">
            On Point Home Inspections
          </p>

          <h1 className="mt-3 break-words text-3xl font-black text-white md:text-4xl">
            Repair Request Response
          </h1>

          <p className="mt-3 break-words text-slate-300">{property}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <Info label="Selected Items" value={findings.length} />
            <Info label="Answered" value={`${answeredCount} / ${findings.length}`} />
            <Info label="Status" value={submitted ? "Responded" : share.status || "sent"} />
            <Info label="Sent" value={formatDate(share.created_at)} />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <TimelineStep title="Created" value={formatDate(share.created_at)} active />
            <TimelineStep title="Email Sent" value={formatDate(share.created_at)} active />
            <TimelineStep
              title="Response Submitted"
              value={submitted ? formatDate(share.responded_at) : "Waiting"}
              active={submitted}
            />
          </div>

          {share.summary ? (
            <div className="mt-5 rounded-xl border border-slate-700 bg-[#020617] p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Summary
              </p>
              <p className="mt-2 whitespace-pre-line break-words leading-7 text-slate-200">
                {share.summary}
              </p>
            </div>
          ) : null}
        </section>

        <RepairResponseForm
          token={cleanToken}
          findings={findings}
          existingResponses={responsesRaw || []}
          alreadySubmitted={submitted}
        />
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-[#020617] p-4">
      <p className="break-words text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words font-bold text-white">
        {value === 0 ? 0 : value || "N/A"}
      </p>
    </div>
  );
}

function TimelineStep({
  title,
  value,
  active,
}: {
  title: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        active
          ? "border-teal-400/50 bg-teal-500/10"
          : "border-slate-700 bg-[#020617]"
      }`}
    >
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{title}</p>
      <p className={active ? "mt-1 font-black text-teal-200" : "mt-1 font-black text-slate-300"}>
        {value}
      </p>
    </div>
  );
}
