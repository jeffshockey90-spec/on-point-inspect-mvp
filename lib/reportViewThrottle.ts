// Report pages re-log a view event on every load/refresh/prefetch, which was
// firing a fresh push to the inspector each time. This decides whether a given
// open is really a reload/return by the SAME viewer within a short window, so
// callers can skip the duplicate notification.
//
// Both server push paths insert the view event BEFORE calling this, so the
// current event is already in the table -- >= 2 matching views in the window
// means a prior view existed and this open is a reload we should stay quiet on.

const OPEN_TYPES = ["client_portal", "report_share", "environmental_share"];

export async function isReportViewReload(
  db: { from: (t: string) => any },
  opts: {
    inspectionId: number;
    ipHash?: string | null;
    ipAddress?: string | null;
    viewerEmail?: string | null;
    minutes?: number;
    // Override which view_type(s) count as an "open" for this check. Defaults to
    // the report-open types; the homeowner portal passes its own type so it
    // dedups on ITS opens with the same 30-minute session window.
    viewTypes?: string[];
  },
): Promise<boolean> {
  try {
    const minutes = opts.minutes ?? 30;
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const types = opts.viewTypes && opts.viewTypes.length ? opts.viewTypes : OPEN_TYPES;

    let q = db
      .from("inspection_view_events")
      .select("id", { count: "exact", head: true })
      .eq("inspection_id_bigint", opts.inspectionId)
      .in("view_type", types)
      .gte("created_at", since);

    // Identify the viewer by the strongest signal available.
    if (opts.ipHash) q = q.eq("ip_hash", opts.ipHash);
    else if (opts.ipAddress) q = q.eq("ip_address", opts.ipAddress);
    else if (opts.viewerEmail) q = q.eq("viewer_email", opts.viewerEmail);
    else return false; // can't identify the viewer -> don't suppress the alert

    const { count } = await q;
    return (count || 0) >= 2;
  } catch {
    // Never let a throttle lookup swallow the notification path.
    return false;
  }
}
