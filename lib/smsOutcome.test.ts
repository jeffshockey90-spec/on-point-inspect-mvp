import { describe, expect, it } from "vitest";
import { describeSmsOutcome } from "./smsOutcome";

describe("describeSmsOutcome", () => {
  it("returns null when texting wasn't involved at all", () => {
    expect(describeSmsOutcome({ sent: 0, skippedNoPhone: 0, failed: 0 })).toBeNull();
  });

  it("reports how many texts went out", () => {
    expect(describeSmsOutcome({ sent: 2, skippedNoPhone: 0, failed: 0 })).toBe("and 2 texts");
  });

  it("uses singular wording for a single text sent", () => {
    expect(describeSmsOutcome({ sent: 1, skippedNoPhone: 0, failed: 0 })).toBe("and 1 text");
  });

  it("explains a skipped text as no phone on file", () => {
    expect(describeSmsOutcome({ sent: 0, skippedNoPhone: 1, failed: 0 })).toBe(
      "no text sent to 1 recipient (no phone on file)"
    );
  });

  it("explains a failed text send", () => {
    expect(describeSmsOutcome({ sent: 0, skippedNoPhone: 0, failed: 1 })).toBe(
      "text failed for 1 recipient"
    );
  });

  it("combines sent, skipped, and failed across multiple recipients", () => {
    expect(describeSmsOutcome({ sent: 1, skippedNoPhone: 2, failed: 1 })).toBe(
      "and 1 text; no text sent to 2 recipients (no phone on file); text failed for 1 recipient"
    );
  });
});
