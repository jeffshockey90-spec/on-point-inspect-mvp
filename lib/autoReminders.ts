// Pure scheduling rules for the automatic (opt-in) client reminders sent by
// /api/cron/auto-reminders, which runs once a day. Kept separate so the
// "when do we nudge, and how often" rules are unit-tested and never spam.

// Agreement: nudge unsigned signers in the days leading up to the inspection.
export const AGREEMENT_DAYS_BEFORE = 3; // start 3 days out, through inspection day
export const AGREEMENT_MAX_AUTO = 3; // never more than 3 automatic nudges per job
// Skip if ANY agreement email (first send, manual or automatic reminder) went
// out recently, so a just-booked client isn't nudged an hour after the invite.
export const AGREEMENT_MIN_HOURS_SINCE_LAST = 20;

// Balance: nudge after the inspection on day 3, 7 and 14. Each stage only fires
// inside a short window, so turning the feature on never mails clients about
// months-old balances, and a missed cron day still catches up.
export const BALANCE_STAGES = [3, 7, 14] as const;
export const BALANCE_STAGE_WINDOW_DAYS = 3;
export const BALANCE_MIN_HOURS_SINCE_LAST = 48;

/** "YYYY-MM-DD" for `now` in `timeZone`. */
export function localDateKey(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Whole days from `fromKey` to `toKey` (both "YYYY-MM-DD"); null if invalid. */
export function daysBetween(fromKey: string, toKey: string): number | null {
  const parse = (key: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ""));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  const a = parse(fromKey);
  const b = parse(toKey);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function hoursSince(lastSentAt: string | null | undefined, now: Date): number | null {
  if (!lastSentAt) return null;
  const t = new Date(lastSentAt).getTime();
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 3600000;
}

/**
 * Should an automatic agreement reminder go out today?
 * `daysUntil` = inspection date minus today (local). `alreadyToday` = an
 * automatic agreement reminder was already logged for today's date.
 */
export function agreementReminderDue(input: {
  daysUntil: number | null;
  autoSentCount: number;
  alreadyToday: boolean;
  lastAgreementEmailAt?: string | null;
  now: Date;
}): boolean {
  const { daysUntil } = input;
  if (daysUntil === null || daysUntil < 0 || daysUntil > AGREEMENT_DAYS_BEFORE) return false;
  if (input.alreadyToday) return false;
  if (input.autoSentCount >= AGREEMENT_MAX_AUTO) return false;
  const since = hoursSince(input.lastAgreementEmailAt, input.now);
  if (since !== null && since < AGREEMENT_MIN_HOURS_SINCE_LAST) return false;
  return true;
}

/**
 * Which balance-reminder stage (3 / 7 / 14 days after the inspection) is due
 * today, or null. `sentStages` are stages already sent for this inspection.
 */
export function balanceReminderStage(input: {
  daysSince: number | null;
  sentStages: number[];
  lastInvoiceReminderAt?: string | null;
  now: Date;
}): number | null {
  const { daysSince } = input;
  if (daysSince === null || daysSince < 0) return null;
  const since = hoursSince(input.lastInvoiceReminderAt, input.now);
  if (since !== null && since < BALANCE_MIN_HOURS_SINCE_LAST) return null;
  for (const stage of [...BALANCE_STAGES].reverse()) {
    if (daysSince >= stage && daysSince < stage + BALANCE_STAGE_WINDOW_DAYS) {
      return input.sentStages.includes(stage) ? null : stage;
    }
  }
  return null;
}
