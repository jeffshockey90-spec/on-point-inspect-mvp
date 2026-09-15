/**
 * Who has actually opened a report.
 *
 * Report pages re-log a view event on every load, so raw event counts wildly
 * overstate things. This collapses events into viewing SESSIONS using the same
 * 30-minute gap rule as count_report_views_deduped() in
 * supabase/report-views-deduped.sql — one sitting is one view, coming back that
 * evening is a second. Keep the two in step: if the gap rule changes there, it
 * should change here, or the owner dashboard and the AI teammates will quote
 * different numbers for the same report.
 */

export const VIEW_TYPES = [
  "client_portal",
  "report_share",
  "environmental_share",
] as const;

const DEFAULT_GAP_MINUTES = 30;

export type ViewerRow = {
  viewer: string;
  role: string | null;
  views: number;
  firstViewed: string;
  lastViewed: string;
  device: string | null;
  identified: boolean;
};

/** A coarse device label from the user-agent — enough to say "on their phone". */
export function deviceLabel(userAgent?: string | null): string | null {
  const ua = String(userAgent || "");
  if (!ua) return null;
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android phone" : "Android tablet";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}

/**
 * A stable, non-identifying handle for a viewer we have no name or email for,
 * so "the same unknown person came back twice" is still answerable without
 * putting a raw IP address in front of a language model.
 */
function anonHandle(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `Unidentified visitor #${Math.abs(hash) % 97}`;
}

/**
 * Group raw view events into one row per viewer.
 *
 * `contactsById` maps inspection_contacts.id -> { name, role } so the answer can
 * name people ("Jordan Anderson, buyer") instead of reciting email addresses.
 */
export function summarizeViewers(
  events: any[],
  contactsById: Record<string, { name?: string | null; role?: string | null }> = {},
  gapMinutes = DEFAULT_GAP_MINUTES,
): ViewerRow[] {
  const byViewer = new Map<string, any[]>();

  for (const event of events || []) {
    const contact = event?.contact_id ? contactsById[String(event.contact_id)] : null;
    const email = String(event?.viewer_email || "").trim().toLowerCase();
    const name = String(contact?.name || "").trim();

    // Identity, best first: a known contact, then the email they opened with,
    // then a stable anonymous handle derived from the hashed IP.
    const key = name || email || anonHandle(String(event?.ip_hash || event?.ip_address || "anon"));
    const list = byViewer.get(key) || [];
    list.push({ ...event, _role: contact?.role || event?.viewer_role || null, _identified: Boolean(name || email) });
    byViewer.set(key, list);
  }

  const rows: ViewerRow[] = [];

  for (const [viewer, list] of byViewer) {
    list.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    let sessions = 0;
    let previous = 0;
    for (const event of list) {
      const at = new Date(event.created_at).getTime();
      if (!previous || at - previous > gapMinutes * 60 * 1000) sessions += 1;
      previous = at;
    }

    const last = list[list.length - 1];
    rows.push({
      viewer,
      role: list.find((e: any) => e._role)?._role || null,
      views: sessions,
      firstViewed: list[0].created_at,
      lastViewed: last.created_at,
      device: deviceLabel(last.user_agent),
      identified: list.some((e: any) => e._identified),
    });
  }

  // Most recent opener first — the usual question is "has anyone looked yet?"
  return rows.sort(
    (a, b) => new Date(b.lastViewed).getTime() - new Date(a.lastViewed).getTime(),
  );
}

// ---------------------------------------------------------------------------
// Rich per-report viewer report (for the "Who Viewed This Report" panel).
//
// summarizeViewers() above is the terse version the AI teammates quote. This
// adds what a human wants to SEE on the report: exactly HOW each person got in
// (client portal vs a shared/emailed/texted/QR link vs the environmental
// report), the device, per-session log, reading time, and plain-English flags.
// ---------------------------------------------------------------------------

// The view_type values that represent an actual REPORT open (not an email pixel,
// a time-on-page ping, a payment, etc.). Matches the owner-push allowlist.
const OPEN_VIEW_TYPES = new Set([
  "client_portal",
  "report_share",
  "environmental_share",
]);

export type AccessMethod =
  | "client_portal"
  | "shared_link"
  | "email_link"
  | "text_link"
  | "qr_code"
  | "environmental"
  | "direct";

export const ACCESS_METHOD_LABEL: Record<AccessMethod, string> = {
  client_portal: "Client Portal",
  shared_link: "Shared Link",
  email_link: "Email Link",
  text_link: "Text Link",
  qr_code: "QR Code",
  environmental: "Environmental Report",
  direct: "Direct Link",
};

export type ViewerSession = {
  at: string;
  method: AccessMethod;
  device: string | null;
  seconds: number;
};

export type ViewerReportRow = {
  key: string;
  name: string;
  role: string | null;
  identified: boolean;
  email: string | null;
  methods: AccessMethod[];
  device: string | null;
  sessions: number;
  opens: number;
  totalSeconds: number;
  firstViewed: string;
  lastViewed: string;
  sessionLog: ViewerSession[];
  flags: string[];
};

export type ViewerReport = {
  viewers: ViewerReportRow[];
  summary: {
    totalViewers: number;
    identifiedViewers: number;
    totalSessions: number;
    totalSeconds: number;
    clientOpened: { opened: boolean; at: string | null };
    realtorOpened: { opened: boolean; at: string | null };
    realtorBeforeClient: boolean;
  };
};

function normalizeRoleLabel(role?: string | null): string | null {
  const r = String(role || "").trim().toLowerCase();
  if (!r) return null;
  if (r.includes("co-client") || r.includes("co client") || r.includes("co-buyer")) return "Co-Buyer";
  if (r.includes("client") || r.includes("buyer")) return "Client";
  if (r.includes("realtor") || r.includes("agent") || r.includes("transaction")) return "Realtor";
  if (r.includes("inspector")) return "Inspector";
  return r.replace(/\b\w/g, (l) => l.toUpperCase());
}

function accessMethodForEvent(event: any): AccessMethod {
  const src = String(event?.metadata?.access_source || event?.access_source || "")
    .trim()
    .toLowerCase();
  if (src === "email") return "email_link";
  if (src === "sms" || src === "text") return "text_link";
  if (src === "qr") return "qr_code";

  const vt = String(event?.view_type || "").toLowerCase();
  if (vt.includes("portal")) return "client_portal";
  if (vt.includes("environmental")) return "environmental";
  if (vt.includes("report_share") || vt.includes("share")) return "shared_link";
  return "direct";
}

function getSeconds(event: any): number {
  const raw =
    event?.duration_seconds ??
    event?.seconds ??
    event?.metadata?.duration_seconds ??
    event?.metadata?.seconds ??
    0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Build the full viewer report for one inspection's raw view events.
 *
 * @param events        rows from inspection_view_events (any view_type)
 * @param contactsById  inspection_contacts.id -> { name, role } for identity
 * @param clientEmail   the primary client email (to answer "has the client opened it?")
 * @param realtorEmails realtor/agent emails (to answer "has the realtor opened it?")
 */
export function buildViewerReport(
  events: any[],
  {
    contactsById = {},
    clientEmail = "",
    realtorEmails = [],
    gapMinutes = DEFAULT_GAP_MINUTES,
  }: {
    contactsById?: Record<string, { name?: string | null; role?: string | null }>;
    clientEmail?: string | null;
    realtorEmails?: string[];
    gapMinutes?: number;
  } = {},
): ViewerReport {
  const all = events || [];
  const client = String(clientEmail || "").trim().toLowerCase();
  const realtors = new Set((realtorEmails || []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean));

  // A viewer key groups every event from the same person. Email-click events
  // (which have the viewer's email) let us tag a later open as "from email".
  function viewerKey(event: any): string {
    const contact = event?.contact_id ? contactsById[String(event.contact_id)] : null;
    const name = String(contact?.name || "").trim();
    const email = String(event?.viewer_email || "").trim().toLowerCase();
    return name || email || anonHandle(String(event?.ip_hash || event?.ip_address || "anon"));
  }

  // First pass: which viewers arrived via an email link at least once (from an
  // email_click event), so an open with no explicit src is still attributed.
  const emailClickers = new Set<string>();
  const totalSecondsByViewer = new Map<string, number>();
  for (const event of all) {
    const vt = String(event?.view_type || "").toLowerCase();
    if (vt === "email_click") emailClickers.add(viewerKey(event));
    if (vt === "report_time_final" || vt === "report_time_checkpoint") {
      const k = viewerKey(event);
      totalSecondsByViewer.set(k, (totalSecondsByViewer.get(k) || 0) + getSeconds(event));
    }
  }

  // Second pass: group actual report opens per viewer.
  const opensByViewer = new Map<string, any[]>();
  for (const event of all) {
    const vt = String(event?.view_type || "").toLowerCase();
    if (!OPEN_VIEW_TYPES.has(vt)) continue;
    const k = viewerKey(event);
    const list = opensByViewer.get(k) || [];
    list.push(event);
    opensByViewer.set(k, list);
  }

  const rows: ViewerReportRow[] = [];
  let clientOpenedAt: string | null = null;
  let realtorOpenedAt: string | null = null;

  for (const [key, list] of opensByViewer) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const firstEvent = list[0];
    const lastEvent = list[list.length - 1];
    const contact = firstEvent?.contact_id ? contactsById[String(firstEvent.contact_id)] : null;
    const email =
      String(list.find((e) => e.viewer_email)?.viewer_email || "").trim().toLowerCase() ||
      null;
    const name = String(contact?.name || "").trim();
    const identified = Boolean(name || email);

    const role =
      normalizeRoleLabel(contact?.role) ||
      normalizeRoleLabel(list.find((e) => e.viewer_role)?.viewer_role) ||
      (email && realtors.has(email) ? "Realtor" : null) ||
      (email && client && email === client ? "Client" : null);

    // Sessions + per-session log (one row per session, tagged by its method).
    const sessionLog: ViewerSession[] = [];
    let previous = 0;
    for (const event of list) {
      const at = new Date(event.created_at).getTime();
      let method = accessMethodForEvent(event);
      if (method === "shared_link" && emailClickers.has(key)) method = "email_link";
      if (!previous || at - previous > gapMinutes * 60 * 1000) {
        sessionLog.push({
          at: event.created_at,
          method,
          device: deviceLabel(event.user_agent),
          seconds: 0,
        });
      }
      previous = at;
    }

    const methods = Array.from(new Set(sessionLog.map((s) => s.method)));
    const totalSeconds = Math.round(totalSecondsByViewer.get(key) || 0);

    const flags: string[] = [];
    const opens = list.length;
    const sessions = sessionLog.length;
    if (sessions >= 5 || totalSeconds >= 300) flags.push("Highly engaged");
    if (totalSeconds > 0 && totalSeconds < 30) flags.push("Skimmed (under 30s)");

    const roleLc = String(role || "").toLowerCase();
    if (roleLc === "client" || roleLc === "co-buyer") {
      if (!clientOpenedAt || new Date(firstEvent.created_at) < new Date(clientOpenedAt)) {
        clientOpenedAt = firstEvent.created_at;
      }
    }
    if (roleLc === "realtor") {
      if (!realtorOpenedAt || new Date(firstEvent.created_at) < new Date(realtorOpenedAt)) {
        realtorOpenedAt = firstEvent.created_at;
      }
    }

    rows.push({
      key,
      name: name || (email ? email : key),
      role,
      identified,
      email,
      methods,
      device: deviceLabel(lastEvent.user_agent),
      sessions,
      opens,
      totalSeconds,
      firstViewed: firstEvent.created_at,
      lastViewed: lastEvent.created_at,
      sessionLog: sessionLog.reverse(), // newest session first
      flags,
    });
  }

  rows.sort((a, b) => new Date(b.lastViewed).getTime() - new Date(a.lastViewed).getTime());

  const realtorBeforeClient = Boolean(
    realtorOpenedAt &&
      clientOpenedAt &&
      new Date(realtorOpenedAt).getTime() < new Date(clientOpenedAt).getTime(),
  );

  return {
    viewers: rows,
    summary: {
      totalViewers: rows.length,
      identifiedViewers: rows.filter((r) => r.identified).length,
      totalSessions: rows.reduce((sum, r) => sum + r.sessions, 0),
      totalSeconds: rows.reduce((sum, r) => sum + r.totalSeconds, 0),
      clientOpened: { opened: Boolean(clientOpenedAt), at: clientOpenedAt },
      realtorOpened: { opened: Boolean(realtorOpenedAt), at: realtorOpenedAt },
      realtorBeforeClient,
    },
  };
}
