import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";
import EmailsList from "./EmailsList";
import { resolveInspectionAccessFilter } from "../../lib/inspectionAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmailsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const accessFilter = await resolveInspectionAccessFilter(supabase, user.id);

  const { data: inspectionsRaw } = await supabase
    .from("inspections")
    .select("id, property_address, address, client_name")
    .eq(accessFilter.column, accessFilter.value)
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

  // Also reflect FLOW's OWN open/click tracking (the email-open pixel and the
  // email-click redirect) so status shows even before the Resend webhook is
  // configured. Resend still provides Delivered/Bounced when its webhook is set.
  let viewEvents: any[] = [];
  if (inspectionIds.length > 0) {
    const { data: viewData } = await supabase
      .from("inspection_view_events")
      .select("inspection_id_bigint, viewer_email, view_type, created_at")
      .in("inspection_id_bigint", inspectionIds)
      .in("view_type", ["email_open", "email_click"])
      .order("created_at", { ascending: true });
    viewEvents = viewData || [];
  }
  const inAppEventMap = new Map<string, string>();
  for (const ev of viewEvents) {
    const key = `${ev.inspection_id_bigint}|${String(ev.viewer_email || "").trim().toLowerCase()}|${ev.view_type}`;
    if (!inAppEventMap.has(key) && ev.created_at) inAppEventMap.set(key, ev.created_at);
  }

  const logs = (logsResult.data || []).map((log: any) => {
    const inspId = log.inspection_id_bigint || log.inspection_id || "";
    const rcpt = String(log.recipient_email || log.recipient || "").trim().toLowerCase();
    const inAppOpen = inAppEventMap.get(`${inspId}|${rcpt}|email_open`) || null;
    const inAppClick = inAppEventMap.get(`${inspId}|${rcpt}|email_click`) || null;
    return {
    id: log.id,
    email_type: log.email_type,
    recipient: log.recipient_email || log.recipient || "Unknown recipient",
    inspection_id: log.inspection_id_bigint || log.inspection_id || null,
    property_address:
      inspectionMap.get(String(log.inspection_id_bigint || log.inspection_id || "")) ||
      "Unknown inspection",
    sent_at: log.sent_at || log.created_at,
    delivered_at: log.delivered_at,
    opened_at: log.opened_at || inAppOpen,
    clicked_at: log.clicked_at || inAppClick,
    bounced_at: log.bounced_at,
    failed_at: log.failed_at,
    status: log.status,
    };
  });

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
