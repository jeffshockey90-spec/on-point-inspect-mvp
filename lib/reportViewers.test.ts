import { describe, expect, it } from "vitest";
import { deviceLabel, summarizeViewers } from "./reportViewers";

const at = (minutes: number) =>
  new Date(Date.UTC(2026, 8, 1, 12, 0, 0) + minutes * 60_000).toISOString();

describe("summarizeViewers", () => {
  it("counts a refresh spree as ONE view", () => {
    const rows = summarizeViewers([
      { viewer_email: "jordan@example.com", created_at: at(0) },
      { viewer_email: "jordan@example.com", created_at: at(2) },
      { viewer_email: "jordan@example.com", created_at: at(9) },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].views).toBe(1);
  });

  it("counts a return visit after the gap as a second view", () => {
    const rows = summarizeViewers([
      { viewer_email: "jordan@example.com", created_at: at(0) },
      { viewer_email: "jordan@example.com", created_at: at(5) },
      // Back that evening — past the 30-minute session gap.
      { viewer_email: "jordan@example.com", created_at: at(400) },
    ]);

    expect(rows[0].views).toBe(2);
    expect(rows[0].firstViewed).toBe(at(0));
    expect(rows[0].lastViewed).toBe(at(400));
  });

  it("names a known contact rather than reciting their email", () => {
    const rows = summarizeViewers(
      [{ contact_id: 7, viewer_email: "jordan@example.com", created_at: at(0) }],
      { "7": { name: "Jordan Anderson", role: "buyer" } },
    );

    expect(rows[0].viewer).toBe("Jordan Anderson");
    expect(rows[0].role).toBe("buyer");
    expect(rows[0].identified).toBe(true);
  });

  it("never exposes an IP for an unidentified viewer, but keeps them distinct", () => {
    const rows = summarizeViewers([
      { ip_hash: "hash-aaa", created_at: at(0) },
      { ip_hash: "hash-bbb", created_at: at(1) },
      { ip_hash: "hash-aaa", created_at: at(2) },
    ]);

    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row.viewer).toMatch(/^Unidentified visitor #/);
      expect(row.viewer).not.toContain("hash-");
      expect(row.identified).toBe(false);
    });
  });

  it("separates the client from the agent", () => {
    const rows = summarizeViewers([
      { viewer_email: "jordan@example.com", viewer_role: "client", created_at: at(0) },
      { viewer_email: "agent@realty.com", viewer_role: "realtor", created_at: at(5) },
    ]);

    expect(rows).toHaveLength(2);
    // Most recent opener first.
    expect(rows[0].viewer).toBe("agent@realty.com");
    expect(rows[0].role).toBe("realtor");
  });

  it("returns nothing for no events", () => {
    expect(summarizeViewers([])).toEqual([]);
  });
});

describe("deviceLabel", () => {
  it("names the common field devices", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari")).toBe("iPhone");
    expect(deviceLabel("Mozilla/5.0 (iPad; CPU OS 18_0) Safari")).toBe("iPad");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel) Mobile Safari")).toBe("Android phone");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)")).toBe("Mac");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows PC");
  });

  it("returns null when the user-agent tells us nothing", () => {
    expect(deviceLabel("")).toBeNull();
    expect(deviceLabel(null)).toBeNull();
  });
});
