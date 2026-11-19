import { describe, expect, it } from "vitest";
import { buildJobStatus } from "./jobStatus";

const base = {
  agreementComplete: true,
  unsignedCount: 0,
  paymentComplete: true,
  balanceDue: 0,
  published: true,
  reportSent: true,
  noReport: false,
};

describe("job status strip", () => {
  it("points Next at the first blocker in order", () => {
    expect(buildJobStatus({ ...base, agreementComplete: false, unsignedCount: 2, unsignedNames: ["Aiden", "Sarah"], paymentComplete: false, balanceDue: 100 }).next).toMatchObject({
      title: "Next: get the agreement signed",
      detail: "Aiden & Sarah haven't signed · Tap to see signatures",
      href: "#agreement-status",
    });
    expect(buildJobStatus({ ...base, paymentComplete: false, balanceDue: 100 }).next).toMatchObject({ detail: "$100 still due · Tap to open the invoice", href: "#payment-invoice" });
    expect(buildJobStatus({ ...base, published: false, reportSent: false }).next?.title).toBe("Next: publish the report");
    expect(buildJobStatus({ ...base, reportSent: false }).next?.title).toBe("Next: send the report");
    expect(buildJobStatus(base).next).toBeNull();
  });

  it("shows chip values and tones", () => {
    const { chips } = buildJobStatus({ ...base, agreementComplete: false, unsignedCount: 2, paymentComplete: false, balanceDue: 100, published: false, reportSent: false });
    expect(chips.map((c) => [c.key, c.value, c.tone])).toEqual([
      ["agreement", "2 unsigned", "bad"],
      ["payment", "$100 due", "warn"],
      ["report", "Draft", "warn"],
      ["sent", "Not yet", "warn"],
    ]);
  });

  it("waived agreement counts as done; no-report jobs skip report steps", () => {
    const r = buildJobStatus({ ...base, agreementComplete: false, agreementWaived: true, noReport: true, published: false, reportSent: false });
    expect(r.chips[0].value).toBe("Waived");
    expect(r.chips[2].value).toBe("None");
    expect(r.next).toBeNull();
  });
});
