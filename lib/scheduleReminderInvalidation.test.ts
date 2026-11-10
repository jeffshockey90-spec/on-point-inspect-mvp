import { describe, expect, it } from "vitest";
import {
  appointmentChanged,
  APPOINTMENT_REMINDER_TYPES,
} from "./scheduleReminderInvalidation";

describe("appointmentChanged", () => {
  it("detects a time move on the same day (the bug: old-time reminder)", () => {
    expect(
      appointmentChanged(
        { date: "2026-11-12", time: "09:00" },
        { date: "2026-11-12", time: "14:00" },
      ),
    ).toBe(true);
  });

  it("detects a date move", () => {
    expect(
      appointmentChanged(
        { date: "2026-11-12", time: "09:00" },
        { date: "2026-11-13", time: "09:00" },
      ),
    ).toBe(true);
  });

  it("is false when nothing moved", () => {
    expect(
      appointmentChanged(
        { date: "2026-11-12", time: "09:00" },
        { date: "2026-11-12", time: "09:00" },
      ),
    ).toBe(false);
  });

  it("ignores cosmetic format differences (ISO date, seconds on time)", () => {
    expect(
      appointmentChanged(
        { date: "2026-11-12T00:00:00.000Z", time: "09:00:00" },
        { date: "2026-11-12", time: "09:00" },
      ),
    ).toBe(false);
  });

  it("treats a newly-set time as a change so stale dedup clears", () => {
    expect(
      appointmentChanged(
        { date: "2026-11-12", time: null },
        { date: "2026-11-12", time: "09:00" },
      ),
    ).toBe(true);
  });

  it("covers the appointment-anchored reminder keys, not radon ones", () => {
    expect(APPOINTMENT_REMINDER_TYPES).toContain("24h");
    expect(APPOINTMENT_REMINDER_TYPES).toContain("client_sms_24h");
    expect(APPOINTMENT_REMINDER_TYPES).toContain("agent_sms_30m");
    expect(APPOINTMENT_REMINDER_TYPES).not.toContain("radon_deploy" as any);
    expect(APPOINTMENT_REMINDER_TYPES).not.toContain("radon_retrieve" as any);
  });
});
