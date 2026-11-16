import { describe, expect, it } from "vitest";
import {
  agreementReminderDue,
  balanceReminderStage,
  daysBetween,
  localDateKey,
} from "./autoReminders";

const now = new Date("2026-11-16T15:00:00Z");

describe("daysBetween / localDateKey", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween("2026-11-16", "2026-11-19")).toBe(3);
    expect(daysBetween("2026-11-16", "2026-11-10")).toBe(-6);
    expect(daysBetween("2026-11-16", "2026-11-16T09:00:00")).toBe(0);
    expect(daysBetween("2026-11-16", "")).toBeNull();
  });

  it("uses the local date, not UTC", () => {
    // 02:00 UTC on the 17th is still the 16th in New York.
    expect(localDateKey(new Date("2026-11-17T02:00:00Z"), "America/New_York")).toBe("2026-11-16");
  });
});

describe("agreementReminderDue", () => {
  const base = { autoSentCount: 0, alreadyToday: false, lastAgreementEmailAt: null, now };

  it("fires from 3 days out through inspection day", () => {
    expect(agreementReminderDue({ ...base, daysUntil: 3 })).toBe(true);
    expect(agreementReminderDue({ ...base, daysUntil: 0 })).toBe(true);
    expect(agreementReminderDue({ ...base, daysUntil: 4 })).toBe(false);
    expect(agreementReminderDue({ ...base, daysUntil: -1 })).toBe(false);
    expect(agreementReminderDue({ ...base, daysUntil: null })).toBe(false);
  });

  it("sends at most once a day and three times total", () => {
    expect(agreementReminderDue({ ...base, daysUntil: 1, alreadyToday: true })).toBe(false);
    expect(agreementReminderDue({ ...base, daysUntil: 1, autoSentCount: 3 })).toBe(false);
  });

  it("waits after any recent agreement email", () => {
    expect(
      agreementReminderDue({ ...base, daysUntil: 2, lastAgreementEmailAt: "2026-11-16T05:00:00Z" }),
    ).toBe(false);
    expect(
      agreementReminderDue({ ...base, daysUntil: 2, lastAgreementEmailAt: "2026-11-15T10:00:00Z" }),
    ).toBe(true);
  });
});

describe("balanceReminderStage", () => {
  const base = { sentStages: [] as number[], lastInvoiceReminderAt: null, now };

  it("fires on day 3, 7 and 14 within a short window", () => {
    expect(balanceReminderStage({ ...base, daysSince: 2 })).toBeNull();
    expect(balanceReminderStage({ ...base, daysSince: 3 })).toBe(3);
    expect(balanceReminderStage({ ...base, daysSince: 5 })).toBe(3);
    expect(balanceReminderStage({ ...base, daysSince: 6 })).toBeNull();
    expect(balanceReminderStage({ ...base, daysSince: 7 })).toBe(7);
    expect(balanceReminderStage({ ...base, daysSince: 14 })).toBe(14);
  });

  it("never mails about old balances when first turned on", () => {
    expect(balanceReminderStage({ ...base, daysSince: 17 })).toBeNull();
    expect(balanceReminderStage({ ...base, daysSince: 90 })).toBeNull();
  });

  it("skips stages already sent and recent manual reminders", () => {
    expect(balanceReminderStage({ ...base, daysSince: 4, sentStages: [3] })).toBeNull();
    expect(
      balanceReminderStage({ ...base, daysSince: 7, lastInvoiceReminderAt: "2026-11-15T12:00:00Z" }),
    ).toBeNull();
  });
});
