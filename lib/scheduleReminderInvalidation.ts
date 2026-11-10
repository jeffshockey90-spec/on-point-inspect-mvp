// When an inspection is rescheduled, its already-sent reminder dedup rows must
// be cleared so the corrected reminders can fire against the NEW appointment
// time. Without this, a client who already got the old-time reminder is never
// re-notified (the cron's alreadySent() dedup blocks the corrected send), which
// is exactly the "reminder showed the old time" bug.
//
// These are the reminder_type keys written by app/api/cron/schedule-reminders
// that are anchored to the inspection's appointment time. Radon deploy/retrieve
// reminders are anchored to the radon test's own start/end times (not the
// appointment), so they are intentionally excluded.
export const APPOINTMENT_REMINDER_TYPES = [
  "24h",
  "2h",
  "30m",
  "client_sms_24h",
  "client_sms_2h",
  "client_sms_30m",
  "agent_sms_24h",
  "agent_sms_2h",
  "agent_sms_30m",
] as const;

function normDate(value: unknown): string {
  if (!value) return "";
  const text = String(value).trim();
  return text.includes("T") ? text.split("T")[0] : text;
}

function normTime(value: unknown): string {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{1,2}:\d{2}/.test(text)) return text.slice(0, 5);
  if (text.includes("T")) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date.toTimeString().slice(0, 5);
  }
  return "";
}

// True when the date OR the time actually moved. Tolerant of the different
// shapes the columns come back in ("2026-11-10" vs an ISO timestamp, "09:00"
// vs "09:00:00") so a cosmetic format difference is NOT treated as a change.
export function appointmentChanged(
  prev: { date: unknown; time: unknown },
  next: { date: unknown; time: unknown },
): boolean {
  return (
    normDate(prev.date) !== normDate(next.date) ||
    normTime(prev.time) !== normTime(next.time)
  );
}
