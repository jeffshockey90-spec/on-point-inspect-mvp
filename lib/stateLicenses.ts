// Per-state license / certification numbers (e.g. MD license, WV certification,
// PA association membership) so each state's agreement shows ITS number instead
// of one company-wide license line. Stored on companies.state_licenses as
// { "MD": "...", "WV": "...", "PA": "..." }. Pure helpers.

export type StateLicenses = Record<string, string>;

/** Clean a stored/posted value into { STATE: number } (2-letter keys, trimmed). */
export function sanitizeStateLicenses(value: unknown): StateLicenses {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  const out: StateLicenses = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const state = String(key || "").trim().toUpperCase();
    const number = String(val ?? "").trim().slice(0, 200);
    if (/^[A-Z]{2}$/.test(state) && number) out[state] = number;
  }
  return out;
}

/**
 * The license text an agreement should show: the number for the agreement's
 * own state (or the job's state for a General agreement), else the general
 * company license line.
 */
export function licenseForState(
  generalLicense: string | null | undefined,
  stateLicenses: StateLicenses | null | undefined,
  ...states: Array<string | null | undefined>
): string {
  for (const s of states) {
    const key = String(s || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(key) && stateLicenses?.[key]) return stateLicenses[key];
  }
  return String(generalLicense || "").trim();
}
