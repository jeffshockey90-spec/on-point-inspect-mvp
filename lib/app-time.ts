export type TimeFormat = "12h" | "24h";

export const DEFAULT_TIME_ZONE = "America/New_York";
export const DEFAULT_TIME_FORMAT: TimeFormat = "24h";

export type TimePreferences = {
  timeZone: string;
  timeFormat: TimeFormat;
};

export function detectDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function normalizeTimePreferences(
  value?: Partial<TimePreferences> | null,
): TimePreferences {
  return {
    timeZone: value?.timeZone || DEFAULT_TIME_ZONE,
    timeFormat: value?.timeFormat === "12h" ? "12h" : DEFAULT_TIME_FORMAT,
  };
}

function asDate(
  value: string | number | Date | null | undefined,
): Date | null {
  if (value === null || value === undefined || value === "") return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAppTime(
  value: string | number | Date | null | undefined,
  preferences?: Partial<TimePreferences> | null,
): string {
  const date = asDate(value);
  if (!date) return "â€”";

  const prefs = normalizeTimePreferences(preferences);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: prefs.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: prefs.timeFormat === "12h",
  }).format(date);
}

export function formatAppDate(
  value: string | number | Date | null | undefined,
  preferences?: Partial<TimePreferences> | null,
): string {
  const date = asDate(value);
  if (!date) return "â€”";

  const prefs = normalizeTimePreferences(preferences);

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
  if (!date) return "â€”";

  return `${formatAppDate(date, preferences)} at ${formatAppTime(
    date,
    preferences,
  )}`;
}

export function formatDateOnly(
  value: string | null | undefined,
): string {
  if (!value) return "â€”";

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) return formatAppDate(value);

  const [, year, month, day] = match;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(
    new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        12,
      ),
    ),
  );
}

export function inspectionLocalToUtc(
  date: string,
  time: string,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  const safeTime = /^\d{2}:\d{2}/.test(time || "")
    ? time.slice(0, 5)
    : "00:00";

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = safeTime.split(":").map(Number);

  const target = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
  );

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(target))
      .map((part) => [part.type, part.value]),
  );

  const represented = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return new Date(target + (target - represented)).toISOString();
}

export function currentLocalDate(
  timeZone = DEFAULT_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
