import { describe, expect, it } from "vitest";
import { APPOINTMENT_REMINDER_TYPES } from "./scheduleReminderInvalidation";

describe("APPOINTMENT_REMINDER_TYPES", () => {
  it("covers every appointment-anchored reminder window for inspector + client + agent", () => {
    for (const win of ["24h", "2h", "30m"]) {
      expect(APPOINTMENT_REMINDER_TYPES).toContain(win); // inspector push
      expect(APPOINTMENT_REMINDER_TYPES).toContain(`client_sms_${win}`);
      expect(APPOINTMENT_REMINDER_TYPES).toContain(`agent_sms_${win}`);
    }
    expect(APPOINTMENT_REMINDER_TYPES).toHaveLength(9);
  });

  it("excludes radon reminders (anchored to the radon test times, not the appointment)", () => {
    expect(APPOINTMENT_REMINDER_TYPES).not.toContain("radon_deploy" as any);
    expect(APPOINTMENT_REMINDER_TYPES).not.toContain("radon_retrieve" as any);
  });
});
