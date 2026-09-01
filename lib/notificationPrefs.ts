// Resolves the effective per-recipient reminder/notification toggles for an
// inspection: a per-inspector override (profiles.notification_prefs) wins, else
// the company default (companies.*_enabled), else the built-in default below.
// Reads fail SAFE: any error / missing column (e.g. migration not yet run)
// falls back to PREF_DEFAULTS — which keeps today's sends on and the new opt-in
// reminders off, so nothing is suppressed OR surprise-sent. See
// supabase/add-notification-prefs.sql + add-reminder-window-prefs.sql.

export type NotificationPrefKey =
  | "client_confirmation"
  | "client_report_ready"
  | "agent_confirmation"
  | "agent_report_ready"
  | "client_reminder_24h"
  | "client_reminder_2h"
  | "client_reminder_30m"
  | "agent_reminder_24h"
  | "agent_reminder_2h"
  | "agent_reminder_30m";

export const NOTIFICATION_PREF_KEYS: NotificationPrefKey[] = [
  "client_confirmation",
  "client_report_ready",
  "agent_confirmation",
  "agent_report_ready",
  "client_reminder_24h",
  "client_reminder_2h",
  "client_reminder_30m",
  "agent_reminder_24h",
  "agent_reminder_2h",
  "agent_reminder_30m",
];

export const COMPANY_PREF_COLUMN: Record<NotificationPrefKey, string> = {
  client_confirmation: "client_confirmation_enabled",
  client_report_ready: "client_report_ready_enabled",
  agent_confirmation: "agent_confirmation_enabled",
  agent_report_ready: "agent_report_ready_enabled",
  client_reminder_24h: "client_reminder_24h_enabled",
  client_reminder_2h: "client_reminder_2h_enabled",
  client_reminder_30m: "client_reminder_30m_enabled",
  agent_reminder_24h: "agent_reminder_24h_enabled",
  agent_reminder_2h: "agent_reminder_2h_enabled",
  agent_reminder_30m: "agent_reminder_30m_enabled",
};

// Built-in defaults: existing sends stay ON; the newly-added reminder windows
// (client 2h/30m and all agent reminders) are OFF until turned on.
export const PREF_DEFAULTS: Record<NotificationPrefKey, boolean> = {
  client_confirmation: true,
  client_report_ready: true,
  agent_confirmation: true,
  agent_report_ready: true,
  client_reminder_24h: true,
  client_reminder_2h: false,
  client_reminder_30m: false,
  agent_reminder_24h: false,
  agent_reminder_2h: false,
  agent_reminder_30m: false,
};

export type EffectivePrefs = Record<NotificationPrefKey, boolean>;

export async function getNotificationPrefs(
  admin: any,
  opts: { inspectorId?: string | null; companyId?: string | null },
): Promise<EffectivePrefs> {
  const eff: EffectivePrefs = { ...PREF_DEFAULTS };
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
      // else: stays at PREF_DEFAULTS[key]
    }
  } catch {
    return { ...PREF_DEFAULTS };
  }
  return eff;
}
