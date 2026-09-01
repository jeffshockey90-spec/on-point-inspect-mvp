// Resolves the effective per-recipient reminder/notification toggles for an
// inspection: a per-inspector override (profiles.notification_prefs) wins, else
// the company default (companies.*_enabled), else true. FAIL-OPEN — any error
// or missing column (e.g. migration not yet run) yields all-true, so a send is
// never silently suppressed by this layer. See supabase/add-notification-prefs.sql.

export type NotificationPrefKey =
  | "client_confirmation"
  | "client_reminder_sms"
  | "client_report_ready"
  | "agent_confirmation"
  | "agent_report_ready";

export const NOTIFICATION_PREF_KEYS: NotificationPrefKey[] = [
  "client_confirmation",
  "client_reminder_sms",
  "client_report_ready",
  "agent_confirmation",
  "agent_report_ready",
];

export const COMPANY_PREF_COLUMN: Record<NotificationPrefKey, string> = {
  client_confirmation: "client_confirmation_enabled",
  client_reminder_sms: "client_reminder_sms_enabled",
  client_report_ready: "client_report_ready_enabled",
  agent_confirmation: "agent_confirmation_enabled",
  agent_report_ready: "agent_report_ready_enabled",
};

export type EffectivePrefs = Record<NotificationPrefKey, boolean>;

function allOn(): EffectivePrefs {
  return {
    client_confirmation: true,
    client_reminder_sms: true,
    client_report_ready: true,
    agent_confirmation: true,
    agent_report_ready: true,
  };
}

export async function getNotificationPrefs(
  admin: any,
  opts: { inspectorId?: string | null; companyId?: string | null },
): Promise<EffectivePrefs> {
  const eff = allOn();
  try {
    let company: any = null;
    if (opts.companyId) {
      const cols = NOTIFICATION_PREF_KEYS.map((k) => COMPANY_PREF_COLUMN[k]).join(", ");
      const { data } = await admin.from("companies").select(cols).eq("id", opts.companyId).maybeSingle();
      company = data || null;
    }
    let overrides: Record<string, any> = {};
    if (opts.inspectorId) {
      const { data } = await admin
        .from("profiles")
        .select("notification_prefs")
        .eq("id", opts.inspectorId)
        .maybeSingle();
      if (data?.notification_prefs && typeof data.notification_prefs === "object") {
        overrides = data.notification_prefs;
      }
    }
    for (const key of NOTIFICATION_PREF_KEYS) {
      if (typeof overrides[key] === "boolean") {
        eff[key] = overrides[key];
      } else if (company && typeof company[COMPANY_PREF_COLUMN[key]] === "boolean") {
        eff[key] = company[COMPANY_PREF_COLUMN[key]];
      }
      // else: stays true (inherit default / fail-open)
    }
  } catch {
    return allOn();
  }
  return eff;
}
