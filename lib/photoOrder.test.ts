import { describe, it, expect, beforeEach } from "vitest";
import { photosHaveSortOrder, orderPhotos, _resetPhotoOrderCache } from "./photoOrder";

function probeDb(error: any) {
  let calls = 0;
  return {
    get calls() { return calls; },
    from: () => ({ select: () => ({ limit: async () => { calls += 1; return { error }; } }) }),
  };
}

describe("photo ordering", () => {
  beforeEach(() => _resetPhotoOrderCache());

  it("detects the column and remembers a yes", async () => {
    const db = probeDb(null);
    expect(await photosHaveSortOrder(db)).toBe(true);
    expect(await photosHaveSortOrder(db)).toBe(true);
    expect(db.calls).toBe(1);
  });

  it("falls back when the column is missing, and re-probes later", async () => {
    const db = probeDb({ message: "column photos.sort_order does not exist" });
    expect(await photosHaveSortOrder(db)).toBe(false);
    expect(await photosHaveSortOrder(db)).toBe(false);
    expect(db.calls).toBe(2);
  });

  it("orders by sort_order only when available", () => {
    const seen: string[] = [];
    const q: any = { order: (c: string) => { seen.push(c); return q; } };
    orderPhotos(q, true);
    expect(seen).toEqual(["sort_order", "created_at"]);
    seen.length = 0;
    orderPhotos(q, false);
    expect(seen).toEqual(["created_at"]);
  });
});
