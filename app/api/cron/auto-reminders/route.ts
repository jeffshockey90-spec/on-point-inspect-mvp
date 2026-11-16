// Daily automatic client reminders (opt-in per company / inspector, see
// Settings → Notifications → "Automatic client reminders"):
//   - Unsigned agreement: from 3 days before the inspection, once a day, max 3.
//   - Unpaid balance: 3, 7 and 14 days after the inspection, with a Pay link.
// The emails themselves are the same ones the manual "Send reminder" buttons
// send (lib/agreementReminder, lib/balanceReminder). Each automatic send is
// logged in schedule_reminder_logs so it can never repeat; the timing rules
// live in lib/autoReminders (unit-tested).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isCronAuthorized } from "../../../../lib/cronAuth";
import { getNotificationPrefs, type EffectivePrefs } from "../../../../lib/notificationPrefs";
import { sendAgreementReminder } from "../../../../lib/agreementReminder";
import { sendBalanceReminder, getBalanceDue } from "../../../../lib/balanceReminder";
import {
  agreementReminderDue,
  balanceReminderStage,
  daysBetween,
  localDateKey,
  AGREEMENT_DAYS_BEFORE,
  BALANCE_STAGES,
  BALANCE_STAGE_WINDOW_DAYS,
} from "../../../../lib/autoReminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_TIME_ZONE = "America/New_York";
const MAX_SENDS_PER_RUN = 200;

function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function appBaseUrl() {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.VERCEL_URL;
  if (envUrl) return envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
  return "https://app.flowinspect.app";
}

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function inspectionDateKey(row: any): string {
  const raw = row?.inspection_date || row?.scheduled_date || "";
  return String(raw).split("T")[0];
}

function isCancelled(row: any) {
  const status = String(row?.status || row?.inspection_status || "").toLowerCase();
  return status.includes("cancel");
}

function shiftDateKey(key: string, days: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function reminderLogs(admin: any, inspectionId: string, prefix: string) {
  const { data, error } = await admin
    .from("schedule_reminder_logs")
    .select("reminder_type")
    .eq("inspection_id", inspectionId)
    .like("reminder_type", `${prefix}%`);
  // Fail closed: if we can't read the log, act as if everything was sent.
  if (error) return null;
  return (data || []).map((row: any) => String(row.reminder_type || ""));
}

async function lastEmailAt(admin: any, inspectionId: string, types: string[]) {
  const { data } = await admin
    .from("email_logs")
    .select("sent_at, created_at")
    .eq("inspection_id_bigint", Number(inspectionId))
    .in("email_type", types)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data || [])[0];
  return row ? row.sent_at || row.created_at || null : null;
}

async function logSent(admin: any, inspectionId: string, kind: string, sent: number, metadata: any) {
  await admin.from("schedule_reminder_logs").insert({
    inspection_id: inspectionId,
    reminder_type: kind,
    scheduled_for: null,
    sent_at: new Date().toISOString(),
    sent_count: sent,
    failed_count: 0,
    metadata,
  });
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const now = new Date();
    const baseUrl = appBaseUrl();

    // Only jobs dated inside either reminder window (±1 day of slack for time
    // zones): up to AGREEMENT_DAYS_BEFORE ahead, back to the last balance stage.
    const todayUtc = now.toISOString().slice(0, 10);
    const lastStage = BALANCE_STAGES[BALANCE_STAGES.length - 1];
    const fromDate = shiftDateKey(todayUtc, -(lastStage + BALANCE_STAGE_WINDOW_DAYS + 1));
    const toDate = shiftDateKey(todayUtc, AGREEMENT_DAYS_BEFORE + 1);

    const rows: any[] = [];
    const PAGE = 1000;
    for (let offset = 0; offset < 20000; offset += PAGE) {
      const { data: page, error } = await admin
        .from("inspections")
        .select("*")
        .gte("inspection_date", fromDate)
        .lte("inspection_date", toDate)
        .or("is_demo.is.null,is_demo.eq.false")
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      rows.push(...(page || []));
      if (!page || page.length < PAGE) break;
    }

    // Each inspector's own time zone decides what "today" is for their jobs.
    const inspectorIds = Array.from(new Set(rows.map((r) => r.inspector_id).filter(Boolean)));
    const tzById = new Map<string, string>();
    if (inspectorIds.length) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, time_zone, device_time_zone")
        .in("id", inspectorIds);
      for (const p of profiles || []) {
        const tz = p?.time_zone || p?.device_time_zone;
        if (isValidTimeZone(tz)) tzById.set(String(p.id), tz);
      }
    }

    const prefsCache = new Map<string, EffectivePrefs>();
    const prefsFor = async (row: any) => {
      const key = `${row.inspector_id || ""}|${row.company_id || ""}`;
      let prefs = prefsCache.get(key);
      if (!prefs) {
        prefs = await getNotificationPrefs(admin, {
          inspectorId: row.inspector_id,
          companyId: row.company_id,
        });
        prefsCache.set(key, prefs);
      }
      return prefs;
    };

    const results: any[] = [];
    let sends = 0;

    for (const row of rows) {
      if (sends >= MAX_SENDS_PER_RUN) break;
      if (!row?.id || isCancelled(row)) continue;

      const dateKey = inspectionDateKey(row);
      const timeZone = tzById.get(String(row.inspector_id || "")) || FALLBACK_TIME_ZONE;
      const todayKey = localDateKey(now, timeZone);
      const daysUntil = daysBetween(todayKey, dateKey);
      if (daysUntil === null) continue;

      const inspectionId = String(row.id);

      // ---- Unsigned agreement (before the inspection) ----
      if (daysUntil >= 0 && row.agreement_waived !== true) {
        const prefs = await prefsFor(row);
        if (prefs.auto_agreement_reminder) {
          const logs = await reminderLogs(admin, inspectionId, "auto_agreement_");
          if (logs) {
            const todayKind = `auto_agreement_${todayKey}`;
            const due = agreementReminderDue({
              daysUntil,
              autoSentCount: logs.length,
              alreadyToday: logs.includes(todayKind),
              lastAgreementEmailAt: await lastEmailAt(admin, inspectionId, [
                "agreement_email",
                "agreement_reminder",
              ]),
              now,
            });
            if (due) {
              const result = await sendAgreementReminder(admin, row, { baseUrl, automatic: true });
              if (result.ok) {
                sends += 1;
                await logSent(admin, inspectionId, todayKind, result.sent.length, { daysUntil });
              }
              results.push({
                inspectionId,
                kind: "agreement",
                ok: result.ok,
                ...(result.ok ? {} : { reason: result.error }),
              });
            }
          }
        }
      }

      // ---- Unpaid balance (after the inspection) ----
      const daysSince = -daysUntil;
      if (daysSince > 0 && getBalanceDue(row) > 0) {
        const prefs = await prefsFor(row);
        if (prefs.auto_balance_reminder) {
          const logs = await reminderLogs(admin, inspectionId, "auto_balance_d");
          if (logs) {
            const sentStages = logs
              .map((kind: string) => Number(kind.replace("auto_balance_d", "")))
              .filter((n: number) => Number.isFinite(n));
            const stage = balanceReminderStage({
              daysSince,
              sentStages,
              lastInvoiceReminderAt: await lastEmailAt(admin, inspectionId, ["invoice_reminder"]),
              now,
            });
            if (stage !== null) {
              const result = await sendBalanceReminder(admin, row, { appUrl: baseUrl, automatic: true });
              if (result.ok) {
                sends += 1;
                await logSent(admin, inspectionId, `auto_balance_d${stage}`, result.sent, {
                  daysSince,
                  balanceDue: getBalanceDue(row),
                });
              }
              results.push({
                inspectionId,
                kind: `balance_d${stage}`,
                ok: result.ok,
                ...(result.ok ? {} : { reason: result.error }),
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true, checked: rows.length, sent: sends, results });
  } catch (error: any) {
    console.error("Auto reminders cron error:", error);
    return NextResponse.json({ error: error?.message || "Auto reminders failed." }, { status: 500 });
  }
}
