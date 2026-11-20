import { describe, expect, it } from "vitest";
import { selectAllRows } from "./selectAllRows";

function fakeTable(total: number) {
  const calls: [number, number][] = [];
  const query = async (from: number, to: number) => {
    calls.push([from, to]);
    const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ id: from + i }));
    return { data, error: null };
  };
  return { query, calls };
}

describe("selectAllRows", () => {
  it("returns every row past the 1000-row page limit", async () => {
    const { query, calls } = fakeTable(2500);
    const { data, error } = await selectAllRows(query);
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("makes one extra request when the total is an exact multiple of the page size", async () => {
    const { query, calls } = fakeTable(2000);
    const { data } = await selectAllRows(query);
    expect(data).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it("stops and reports the error, keeping rows already read", async () => {
    let n = 0;
    const { data, error } = await selectAllRows(async () =>
      ++n === 1 ? { data: Array(1000).fill({}), error: null } : { data: null, error: { message: "boom" } },
    );
    expect(data).toHaveLength(1000);
    expect(error).toEqual({ message: "boom" });
  });
});
