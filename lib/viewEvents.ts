// Load report view events for a set of inspections, completely and cheaply.
//
// The reports list used to read `select("*") … .limit(500)` across ALL of an
// inspector's reports, so once the newest 500 events belonged to recent
// reports, older reports showed "0 views" / "Not viewed". Analytics read every
// event with select("*") in one huge .in() list. This pages through results,
// chunks the id list (keeps the request URL short), selects only the columns
// the counts need, and caps the total so a pathological history can't hang.
type Db = { from: (t: string) => any };

export const VIEW_EVENT_COLUMNS =
  "inspection_id_bigint, view_type, viewer_role, viewer_email, created_at";

export async function fetchViewEvents(
  db: Db,
  inspectionIds: Array<number | string>,
  opts: { columns?: string; idChunk?: number; pageSize?: number; maxRows?: number } = {},
): Promise<{ data: any[]; error: any }> {
  const ids = Array.from(new Set(inspectionIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)));
  const columns = opts.columns || VIEW_EVENT_COLUMNS;
  const idChunk = opts.idChunk || 200;
  const pageSize = opts.pageSize || 1000;
  const maxRows = opts.maxRows || 20000;
  const out: any[] = [];
  let firstError: any = null;

  for (let i = 0; i < ids.length && out.length < maxRows; i += idChunk) {
    const chunk = ids.slice(i, i + idChunk);
    for (let from = 0; out.length < maxRows; from += pageSize) {
      const { data, error } = await db
        .from("inspection_view_events")
        .select(columns)
        .in("inspection_id_bigint", chunk)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) {
        firstError = firstError || error;
        break;
      }
      out.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
  }

  // Newest first overall (callers treat the first event per report as latest).
  out.sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")));
  return { data: out, error: firstError };
}
