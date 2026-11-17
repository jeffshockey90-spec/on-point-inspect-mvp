import { describe, expect, it } from "vitest";
import { lockAudience, lockReason, lockedCopy } from "./deliveryMessage";

describe("locked report screen", () => {
  it("knows agents from the link role", () => {
    expect(lockAudience("realtor")).toBe("agent");
    expect(lockAudience("Buyer's Agent")).toBe("agent");
    expect(lockAudience("client")).toBe("client");
    expect(lockAudience(null)).toBe("client");
  });

  it("picks what's missing", () => {
    expect(lockReason({ published: false, agreementComplete: true, paymentComplete: true })).toBe("unpublished");
    expect(lockReason({ published: true, agreementComplete: false, paymentComplete: false })).toBe("both");
    expect(lockReason({ published: true, agreementComplete: false, paymentComplete: true })).toBe("agreement");
    expect(lockReason({ published: true, agreementComplete: true, paymentComplete: false })).toBe("payment");
  });

  it("tells the agent it's waiting on the client, never to pay or sign", () => {
    const copy = lockedCopy("payment", "agent");
    expect(copy.title).toBe("Report locked");
    expect(copy.body).toContain("the client pays");
    expect(lockedCopy("both", "client").body).toContain("agreement is signed and payment is received");
  });
});
