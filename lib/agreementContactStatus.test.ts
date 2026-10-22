import { describe, expect, it } from "vitest";
import { pickLatestSentAtByContact } from "./agreementContactStatus";

describe("pickLatestSentAtByContact", () => {
  it("picks the most recent sent_at per contact id, regardless of input order", () => {
    const result = pickLatestSentAtByContact([
      { sent_at: "2026-10-01T12:00:00Z", metadata: { contactId: "a" } },
      { sent_at: "2026-10-05T12:00:00Z", metadata: { contactId: "a" } },
      { sent_at: "2026-10-03T12:00:00Z", metadata: { contactId: "b" } },
    ]);

    expect(result).toEqual({
      a: "2026-10-05T12:00:00Z",
      b: "2026-10-03T12:00:00Z",
    });
  });

  it("ignores logs with no contactId or no sent_at", () => {
    const result = pickLatestSentAtByContact([
      { sent_at: "2026-10-01T12:00:00Z", metadata: {} },
      { sent_at: null, metadata: { contactId: "a" } },
      { sent_at: "2026-10-02T12:00:00Z", metadata: { contactId: "b" } },
    ]);

    expect(result).toEqual({ b: "2026-10-02T12:00:00Z" });
  });

  it("returns an empty map for no logs", () => {
    expect(pickLatestSentAtByContact([])).toEqual({});
    expect(pickLatestSentAtByContact(null)).toEqual({});
  });
});
