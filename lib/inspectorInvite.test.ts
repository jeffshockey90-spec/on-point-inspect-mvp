import { describe, expect, it } from "vitest";
import { buildInspectorInviteEmail, inviteStatusFor } from "./inspectorInvite";

describe("inviteStatusFor", () => {
  it("is pending until the inspector has signed in", () => {
    expect(inviteStatusFor({ last_sign_in_at: null })).toBe("pending");
    expect(inviteStatusFor(null)).toBe("pending");
    expect(inviteStatusFor({ last_sign_in_at: "2026-11-01T00:00:00Z" })).toBe("active");
  });
});

describe("buildInspectorInviteEmail", () => {
  it("escapes names and words the reminder differently", () => {
    const email = buildInspectorInviteEmail({
      name: "<Sam>",
      companyName: "Acme & Co",
      actionLink: "https://example.com/x",
      reminder: true,
    });
    expect(email.subject).toContain("Reminder");
    expect(email.html).toContain("&lt;Sam&gt;");
    expect(email.html).toContain("Acme &amp; Co");
  });
});
