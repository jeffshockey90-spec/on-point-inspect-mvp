// logError — the one call any server code makes to record a failure so Jarvis
// (the owner ops agent) can see it. Fire-and-forget and utterly defensive: it
// dedupes by (source,message), never throws, and no-ops if the table/env isn't
// there yet. Import and call from catch blocks, failed crons, failed external
// calls — anywhere a failure would otherwise be swallowed.
//
//   import { logError } from "../../lib/jarvis/logError";
//   catch (e) { await logError({ source: "api/ask-flow", message: String(e?.message||e), detail: { stack: e?.stack } }); }

import { createClient } from "@supabase/supabase-js";

export type ErrorSeverity = "info" | "warning" | "error" | "critical";

let admin: any = null;
function getAdmin(): any {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export async function logError(input: {
  source: string;
  message: string;
  route?: string | null;
  severity?: ErrorSeverity;
  detail?: Record<string, any> | null;
}): Promise<void> {
  try {
    const db = getAdmin();
    if (!db) return;
    const source = String(input.source || "unknown").slice(0, 120);
    const message = String(input.message || "Unknown error").slice(0, 1000);
    const severity = input.severity || "error";
    const nowIso = new Date().toISOString();

    // Dedupe: bump an existing unresolved row for the same source+message in the
    // last 24h instead of piling up thousands of identical rows.
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: existing } = await db
      .from("app_errors")
      .select("id, count")
      .eq("source", source)
      .eq("message", message)
      .is("resolved_at", null)
      .gte("last_seen", dayAgo)
      .limit(1);

    if (existing && existing[0]) {
      await db
        .from("app_errors")
        .update({ count: (Number((existing[0] as any).count) || 1) + 1, last_seen: nowIso })
        .eq("id", (existing[0] as any).id);
      return;
    }

    await db.from("app_errors").insert({
      source,
      route: input.route || null,
      severity,
      message,
      detail: input.detail || null,
      first_seen: nowIso,
      last_seen: nowIso,
    });
  } catch {
    // Never let logging a failure cause a failure.
  }
}
