import { describe, it, expect } from "vitest";
import { fetchViewEvents } from "./viewEvents";

function db(rows: any[]) {
  const calls: any[] = [];
  return {
    calls,
    from() {
      let ids: number[] = [];
      const q: any = {
        select: () => q,
        in: (_c: string, v: number[]) => {
          ids = v;
          return q;
        },
        order: () => q,
        range: async (from: number, to: number) => {
          calls.push({ ids, from, to });
          const matched = rows.filter((r) => ids.includes(r.inspection_id_bigint));
          return { data: matched.slice(from, to + 1), error: null };
        },
      };
      return q;
    },
  };
}

describe("fetchViewEvents", () => {
  it("loads every event (pages past the page size) newest first", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      inspection_id_bigint: i % 2 ? 1 : 2,
      created_at: `2026-01-0${i + 1}`,
    }));
    const d = db(rows);
    const { data } = await fetchViewEvents(d, [1, 2], { pageSize: 2 });
    expect(data).toHaveLength(5);
    expect(data[0].created_at).toBe("2026-01-05");
  });

  it("chunks long id lists", async () => {
    const d = db([]);
    await fetchViewEvents(d, [1, 2, 3, 4, 5], { idChunk: 2 });
    expect(d.calls.map((c) => c.ids)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
