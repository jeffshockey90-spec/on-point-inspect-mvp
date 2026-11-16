import { describe, it, expect, vi, beforeEach } from "vitest";

const session = { user: null as any };
const owned = new Set<string>();
vi.mock("./apiAuth", () => ({
  getSessionUser: async () => session.user,
  getAdminClient: () => ({}),
  authorizeInspection: async (_db: any, _uid: string, id: string) => (owned.has(String(id)) ? { id } : null),
}));
vi.mock("./portalViewer", () => ({
  resolveCardInspection: async (_db: any, lookup: string) =>
    lookup === "good-token" ? { inspection: { id: 77 }, viewerRole: null, viaRawId: false } : { inspection: null },
}));

import { guardAiRequest } from "./aiGuard";

describe("guardAiRequest", () => {
  beforeEach(() => {
    session.user = null;
    owned.clear();
  });

  it("refuses anonymous callers with no share token", async () => {
    const r = await guardAiRequest({ inspectionId: 5 });
    expect(r.ok).toBe(false);
  });

  it("keeps an inspection id only when the user can access it", async () => {
    session.user = { id: "u1" };
    owned.add("5");
    expect(await guardAiRequest({ inspectionId: 5 })).toEqual({ ok: true, userId: "u1", inspectionId: "5" });
    expect(await guardAiRequest({ inspectionId: 9 })).toEqual({ ok: true, userId: "u1", inspectionId: null });
  });

  it("lets a no-login client through with a valid share token", async () => {
    expect(await guardAiRequest({ lookup: "good-token" })).toEqual({ ok: true, userId: null, inspectionId: "77" });
    expect((await guardAiRequest({ lookup: "bad" })).ok).toBe(false);
  });
});
