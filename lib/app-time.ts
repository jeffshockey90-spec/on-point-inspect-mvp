export type TimeFormat = "12h" | "24h";

export const DEFAULT_TIME_ZONE = "America/New_York";
export const DEFAULT_TIME_FORMAT: TimeFormat = "12h";
export const TIME_PREFERENCES_STORAGE_KEY = "onpoint-time-preferences";
export const TIME_PREFERENCES_EVENT = "onpoint:time-preferences-changed";

export type TimePreferences = {
  timeZone: string;
  timeFormat: TimeFormat;
};

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function detectDeviceTimeZone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(detected) ? detected : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function normalizeTimePreferences(
  value?: Partial<TimePreferences> | null,
): TimePreferences {
  return {
    timeZone: isValidTimeZone(value?.timeZone)
      ? value.timeZone
      : DEFAULT_TIME_ZONE,
    timeFormat: value?.timeFormat === "12h" ? "12h" : DEFAULT_TIME_FORMAT,
  };
}

export function readStoredTimePreferences(): TimePreferences {
  if (typeof window === "undefined") return normalizeTimePreferences();
  try {
    const raw = window.localStorage.getItem(TIME_PREFERENCES_STORAGE_KEY);
    return normalizeTimePreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeTimePreferences();
  }
}

export function writeStoredTimePreferences(
  value: Partial<TimePreferences>,
  broadcast = true,
): TimePreferences {
  const preferences = normalizeTimePreferences(value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      TIME_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
    if (broadcast) {
      window.dispatchEvent(
        new CustomEvent(TIME_PREFERENCES_EVENT, { detail: preferences }),
      );
    }
  }
  return preferences;
}

// The server always formats with the fixed DEFAULT_TIME_ZONE. If the client
// immediately used the device's stored zone, the first (hydration) render would
// produce different text than the server sent and React would report a
// hydration mismatch (#418). So until the client signals it has hydrated
// (markTimePreferencesReady, called from PageShell after mount), the client
// also uses the default zone - matching the server - and only then switches to
// the user's stored zone.
let clientTimePreferencesReady = false;

export function markTimePreferencesReady() {
  clientTimePreferencesReady = true;
}

function resolvePreferences(
  value?: Partial<TimePreferences> | null,
): TimePreferences {
  if (value) return normalizeTimePreferences(value);
  if (typeof window !== "undefined" && clientTimePreferencesReady) {
    return readStoredTimePreferences();
  }
  return normalizeTimePreferences();
}

function asDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAppValue(
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
  preferences?: Partial<TimePreferences> | null,
): string {
  const date = asDate(value);
  if (!date) return "—";
  const prefs = resolvePreferences(preferences);
  const usesClock = Boolean(
    options.hour || options.minute || options.second || options.timeStyle,
  );
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: prefs.timeZone,
    ...(usesClock ? { hour12: prefs.timeFormat === "12h" } : {}),
  }).format(date);
}

export function formatAppTime(
  value: string | number | Date | null | undefined,
  preferences?: Partial<TimePreferences> | null,
): string {
  const date = asDate(value);
  if (!date) return "—";
  const prefs = resolvePreferences(preferences);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: prefs.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: prefs.timeFormat === "12h",
  }).format(date);
}

/**
 * Formats a bare wall-clock string ("HH:MM" or "HH:MM:SS") to a 12-hour label
 * like "2:00 PM". Used for stored inspection_time values, which have no date and
 * therefore shouldn't be run through time-zone conversion.
 */
export function formatClockTime(
  value: string | null | undefined,
): string {
  const match = String(value || "")
    .slice(0, 5)
    .match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return String(value || "").trim();
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${match[2]} ${suffix}`;
}

export function formatAppDate(
  value: string | number | Date | null | undefined,
  preferences?: Partial<TimePreferences> | null,
): string {
  const date = asDate(value);
  if (!date) return "—";
  const prefs = resolvePreferences(preferences);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: prefs.timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatAppDateTime(
  value: string | number | Date | null | undefined,
  preferences?: Partial<TimePreferences> | null,
): string {
  const date = asDate(value);
  if (!date) return "—";
  return `${formatAppDate(date, preferences)} at ${formatAppTime(date, preferences)}`;
}

/** Formats a database DATE value without converting it through a local offset. */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return formatAppDate(value);
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)));
}

/** Returns YYYY-MM-DD for an instant in the requested IANA time zone. */
export function toLocalDateKey(
  value: string | number | Date = new Date(),
  timeZone?: string,
): string {
  const date = asDate(value);
  if (!date) return "";
  const zone = isValidTimeZone(timeZone) ? timeZone : resolvePreferences().timeZone;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Returns YYYY-MM-DD in the requested IANA time zone. */
export function currentLocalDate(timeZone?: string): string {
  return toLocalDateKey(new Date(), timeZone);
}

/** Converts a wall-clock date/time in an IANA zone into a UTC ISO timestamp. */
export function inspectionLocalToUtc(
  date: string,
  time: string,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid local date");
  if (!/^\d{2}:\d{2}/.test(time)) throw new Error("Invalid local time");
  if (!isValidTimeZone(timeZone)) throw new Error("Invalid time zone");

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Iterate twice to account for DST boundaries and unusual offsets.
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utcMillis));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    utcMillis += desired - represented;
  }

  return new Date(utcMillis).toISOString();
}
