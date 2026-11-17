// "Today first" ordering for the Reports page, like a day schedule:
//   1. today's inspections (earliest time first)
//   2. upcoming inspections (soonest first)
//   3. past inspections (most recent first)
//   4. no inspection date last
// Dates are "YYYY-MM-DD" (time-of-day "HH:MM" optional).

type Sortable = { inspectionDate?: string | null; inspectionTime?: string | null; createdAtMs?: number };

function dayKey(value?: string | null): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || "").trim());
  return m ? m[1] : "";
}

function timeKey(value?: string | null): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "99:99";
}

export function compareTodayFirst(a: Sortable, b: Sortable, today: string): number {
  const da = dayKey(a.inspectionDate);
  const db = dayKey(b.inspectionDate);
  const group = (d: string) => (!d ? 3 : d === today ? 0 : d > today ? 1 : 2);
  const ga = group(da);
  const gb = group(db);
  if (ga !== gb) return ga - gb;
  if (ga === 0) return timeKey(a.inspectionTime).localeCompare(timeKey(b.inspectionTime));
  if (ga === 1) return da.localeCompare(db) || timeKey(a.inspectionTime).localeCompare(timeKey(b.inspectionTime));
  if (ga === 2) return db.localeCompare(da) || timeKey(b.inspectionTime).localeCompare(timeKey(a.inspectionTime));
  return (b.createdAtMs || 0) - (a.createdAtMs || 0);
}
