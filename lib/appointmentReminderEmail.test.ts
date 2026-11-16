import { describe, expect, it } from "vitest";
import { buildAppointmentReminderEmail, reminderEmailsFor } from "./appointmentReminderEmail";

describe("reminderEmailsFor", () => {
  const inspection = { client_email: "Buyer@Example.com ", realtor_email: "agent@realty.com" };
  const contacts = [
    { role: "client", email: "buyer@example.com" },
    { role: "co-client", email: "spouse@example.com" },
    { role: "Buyer's Agent", email: "agent2@realty.com" },
    { role: "client", email: "hidden@example.com", portal_access: false },
    { role: "client", email: "not-an-email" },
  ];

  it("collects deduped client emails and never includes agents", () => {
    expect(reminderEmailsFor("client", inspection, contacts)).toEqual([
      "buyer@example.com",
      "spouse@example.com",
    ]);
  });

  it("collects agent emails", () => {
    expect(reminderEmailsFor("agent", inspection, contacts)).toEqual([
      "agent@realty.com",
      "agent2@realty.com",
    ]);
  });
});

describe("buildAppointmentReminderEmail", () => {
  it("escapes HTML and words the agent version for their client", () => {
    const email = buildAppointmentReminderEmail({
      who: "agent",
      company: "Acme <Inspections>",
      address: "1 Main St",
      when: "Tue, Nov 17, 9:00 AM",
    });
    expect(email.subject).toContain("1 Main St");
    expect(email.text).toContain("your client's inspection");
    expect(email.html).toContain("Acme &lt;Inspections&gt;");
    expect(email.html).not.toContain("<Inspections>");
  });
});
