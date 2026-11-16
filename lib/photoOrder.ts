// Photo ordering that can't blank out reports. Manual photo order lives in
// photos.sort_order (supabase/add-photos-sort-order.sql). If that migration
// isn't applied in an environment, ordering by the column 400s and EVERY photo
// silently disappears from the report / PDF (the CLAUDE.md gotcha). So: probe
// once whether the column exists, and only order by it when it does; otherwise
// fall back to created_at order.

type Db = { from: (t: string) => any };

let knownAvailable = false;

export async function photosHaveSortOrder(db: Db): Promise<boolean> {
  if (knownAvailable) return true;
  try {
    const { error } = await db.from("photos").select("sort_order").limit(1);
    // Only remember a positive answer; re-probe after a miss so applying the
    // migration takes effect without a restart.
    if (!error) knownAvailable = true;
    return !error;
  } catch {
    return false;
  }
}

/** Manual order first (nulls last) when available, then created_at. */
export function orderPhotos<Q extends { order: (column: string, opts: any) => Q }>(
  query: Q,
  hasSortOrder: boolean,
): Q {
  const sorted = hasSortOrder ? query.order("sort_order", { ascending: true, nullsFirst: false }) : query;
  return sorted.order("created_at", { ascending: true });
}

/** Test hook. */
export function _resetPhotoOrderCache() {
  knownAvailable = false;
}
