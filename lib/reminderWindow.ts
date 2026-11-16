// Date range (YYYY-MM-DD, inclusive) of inspections the schedule-reminder cron
// should load. The cron used to read an arbitrary 500 inspections across ALL
// companies with no date filter, so once the platform passed 500 jobs, upcoming
// jobs randomly never got reminders. Reminders fire 1h back .. 25h ahead of the
// start; ±2 days of date slack covers every time zone, and the cron still applies
// the exact time window afterward.
export function reminderDateWindow(now: Date, slackDays = 2): { fromDate: string; toDate: string } {
  const dayMs = 24 * 60 * 60 * 1000;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    fromDate: iso(new Date(now.getTime() - slackDays * dayMs)),
    toDate: iso(new Date(now.getTime() + slackDays * dayMs)),
  };
}
