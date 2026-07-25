import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import EmailsList from "./EmailsList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmailsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: inspectionsRaw } = await supabase
    .from("inspections")
    .select("id, property_address, address, client_name")
    .eq("inspector_id", user.id)
    .order("created_at", { ascending: false });

  const inspections = inspectionsRaw || [];
  const inspectionIds = inspections.map((inspection: any) => Number(inspection.id)).filter(Boolean);

  let logsResult: any = { data: [], error: null };

  if (inspectionIds.length > 0) {
    logsResult = await supabase
      .from("email_logs")
      .select("*")
      .in("inspection_id_bigint", inspectionIds)
      .order("created_at", { ascending: false })
      .limit(500);

    if (logsResult.error) {
      logsResult = await supabase
        .from("email_logs")
        .select("*")
        .in("inspection_id", inspectionIds)
        .order("created_at", { ascending: false })
        .limit(500);
    }
  }

  const inspectionMap = new Map(
    inspections.map((inspection: any) => [
      String(inspection.id),
      inspection.property_address || inspection.address || "Untitled Inspection",
    ])
  );

  const logs = (logsResult.data || []).map((log: any) => ({
    id: log.id,
    email_type: log.email_type,
    recipient: log.recipient_email || log.recipient || "Unknown recipient",
    inspection_id: log.inspection_id_bigint || log.inspection_id || null,
    property_address:
      inspectionMap.get(String(log.inspection_id_bigint || log.inspection_id || "")) ||
      "Unknown inspection",
    sent_at: log.sent_at || log.created_at,
    delivered_at: log.delivered_at,
    opened_at: log.opened_at,
    clicked_at: log.clicked_at,
    bounced_at: log.bounced_at,
    failed_at: log.failed_at,
    status: log.status,
  }));

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-400">
            Communication
          </p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">Sent Emails</h1>
          <p className="mt-4 text-slate-300">
            Every schedule confirmation, agreement, report, and review request sent from FLOW,
            with delivery and open status.
          </p>
        </div>

        <EmailsList logs={logs} />
      </div>
    </main>
  );
}
