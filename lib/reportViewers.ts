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
