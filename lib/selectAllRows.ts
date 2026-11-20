// Supabase/PostgREST returns at most 1000 rows per request by default, with no
// error when more exist. Dashboards that counted rows from one select("*") went
// silently wrong once a table passed 1000 (findings and photos already have).
// This pages through with .range() until a short page comes back.

export type PageQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>;

export async function selectAllRows<T = any>(
  pageQuery: PageQuery<T>,
  { pageSize = 1000, maxRows = 200_000 }: { pageSize?: number; maxRows?: number } = {},
): Promise<{ data: T[]; error: any }> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await pageQuery(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: rows, error: null };
}
