import { describe, expect, it, vi } from "vitest";
import { getInspectionShareToken, getOrCreateShareToken } from "./shareToken";

describe("getInspectionShareToken", () => {
  it("prefers public_share_token over the older/legacy token columns", () => {
    expect(
      getInspectionShareToken({
        public_share_token: "a",
        share_token: "b",
        report_share_token: "c",
      })
    ).toBe("a");
  });

  it("falls back to share_token, then report_share_token, in order", () => {
    expect(getInspectionShareToken({ share_token: "b", report_share_token: "c" })).toBe("b");
    expect(getInspectionShareToken({ report_share_token: "c" })).toBe("c");
  });

  it("returns an empty string when no token column is populated", () => {
    expect(getInspectionShareToken({})).toBe("");
    expect(getInspectionShareToken(null)).toBe("");
    expect(getInspectionShareToken(undefined)).toBe("");
  });

  it("trims whitespace", () => {
    expect(getInspectionShareToken({ public_share_token: "  abc  " })).toBe("abc");
  });
});

function createMockAdmin(updateResult: { error: any } = { error: null }) {
  const eqMock = vi.fn().mockResolvedValue(updateResult);
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ update: updateMock });

  return { admin: { from: fromMock }, fromMock, updateMock, eqMock };
}

describe("getOrCreateShareToken", () => {
  it("returns the existing token without writing to the database if one is already set", async () => {
    const { admin, fromMock } = createMockAdmin();

    const token = await getOrCreateShareToken(admin, {
      id: 64,
      public_share_token: "existing-token",
    });

    expect(token).toBe("existing-token");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("generates and persists a new token when none exists", async () => {
    const { admin, fromMock, updateMock, eqMock } = createMockAdmin();

    const token = await getOrCreateShareToken(admin, { id: 64 });

    // A real random token: non-empty, no dashes (matches the app's URL-safe format).
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(fromMock).toHaveBeenCalledWith("inspections");
    expect(updateMock).toHaveBeenCalledWith({ public_share_token: token });
    expect(eqMock).toHaveBeenCalledWith("id", 64);
  });

  it("falls back to the raw inspection id if the database write fails, instead of throwing", async () => {
    const { admin } = createMockAdmin({ error: { message: "db unavailable" } });

    const token = await getOrCreateShareToken(admin, { id: 64 });

    expect(token).toBe("64");
  });
});
