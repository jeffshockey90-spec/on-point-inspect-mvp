// The reminder_type keys written by app/api/cron/schedule-reminders that are
// anchored to the inspection's APPOINTMENT time (inspector push + client/agent
// SMS, for each of the 24h / 2h / 30m windows).
//
// When an inspection is rescheduled AND the inspector confirms the new time,
// /api/send-schedule-confirmation clears these dedup rows so the cron can re-send
// the corrected reminders against the new time. Without that, the cron's
// alreadySent() dedup blocks the resend and the client is stuck with the
// old-time reminder (the bug this fixes).
//
// Radon deploy/retrieve reminders are intentionally NOT in this list: they are
// anchored to the radon test's own start/end times, not the appointment time,
// so a reschedule of the inspection must not clear them.
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
