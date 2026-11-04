import { describe, expect, it } from "vitest";
import { buildReplyPushBody } from "./ingestReply";

describe("buildReplyPushBody", () => {
  it("shows what the sender actually said, not the thread subject", () => {
    // The real bug: a reply carries the ORIGINAL thread's subject, so using the
    // subject made every new reply look like the old email it replied to.
    expect(
      buildReplyPushBody({
        subject: "Re: Your inspection report for 123 Main St",
        snippet: "Thanks! One question about the water heater you flagged.",
        address: "123 Main St, Erie, PA",
      }),
    ).toBe("Thanks! One question about the water heater you flagged. · 123 Main St, Erie, PA");
  });

  it("falls back to the cleaned subject when there is no snippet", () => {
    expect(
      buildReplyPushBody({
        subject: "Re: RE: Question about my report",
        snippet: "",
        address: "",
      }),
    ).toBe("Question about my report");
  });

  it("falls back to a generic label when both snippet and subject are empty", () => {
    expect(buildReplyPushBody({ subject: "", snippet: "", address: "" })).toBe("New message");
  });

  it("appends the address when one is known", () => {
    expect(
      buildReplyPushBody({ subject: "", snippet: "Looks good", address: "9 Oak Ave" }),
    ).toBe("Looks good · 9 Oak Ave");
  });

  it("caps the body at 140 characters", () => {
    const long = "x".repeat(300);
    const out = buildReplyPushBody({ subject: "", snippet: long, address: "" });
    expect(out.length).toBe(140);
  });

  it("prefers a whitespace-only snippet's fallback to the subject", () => {
    expect(
      buildReplyPushBody({ subject: "Re: Hello", snippet: "   ", address: "" }),
    ).toBe("Hello");
  });
});
