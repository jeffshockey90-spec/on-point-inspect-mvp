// Normalize a phone number to bare digits for STORAGE, e.g.
//   "+1 (240) 818-8226" -> "2408188226"
// Strips every non-digit, and drops a leading US country code "1" from an
// 11-digit number so we keep the clean 10-digit form. Other lengths keep their
// stripped digits as-is. (SMS sending re-normalizes to E.164 at send time.)
export function toPhoneDigits(input: unknown): string {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}
