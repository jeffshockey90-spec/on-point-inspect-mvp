import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reports which recipients bounced/failed for one or more inspections, so the UI
// can flag a bad client email. An address is only reported when it failed AND
// never later delivered (a corrected re-send to the SAME address clears it).
// Uses the caller's session, so RLS limits results to their own inspections.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const ids = (new URL(req.url).searchParams.get("inspection") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
  if (!ids.length) return NextResponse.json({ byInspection: {} });

  const { data, error } = await supabase
    .from("email_logs")
    .select(
      "inspection_id_bigint, recipient_email, recipient, subject, email_type, bounced_at, failed_at, delivered_at, status",
    )
    .in("inspection_id_bigint", ids);

  if (error) return NextResponse.json({ byInspection: {} });

  const delivered = new Set<string>();
  const failed: { insp: string; rcpt: string; subject: string | null; when: string | null }[] = [];
  for (const log of data || []) {
    const insp = String(log.inspection_id_bigint);
    const rcpt = String(log.recipient_email || log.recipient || "").trim().toLowerCase();
    if (!rcpt) continue;
    if (log.delivered_at) delivered.add(`${insp}|${rcpt}`);
    if (log.bounced_at || log.failed_at || log.status === "failed") {
      failed.push({ insp, rcpt, subject: log.subject || null, when: log.bounced_at || log.failed_at || null });
    }
  }

  const byInspection: Record<string, { recipient: string; subject: string | null; when: string | null }[]> = {};
  const seen = new Set<string>();
  for (const f of failed) {
    const key = `${f.insp}|${f.rcpt}`;
    if (delivered.has(key) || seen.has(key)) continue;
    seen.add(key);
    (byInspection[f.insp] ||= []).push({ recipient: f.rcpt, subject: f.subject, when: f.when });
  }

  return NextResponse.json({ byInspection });
}
