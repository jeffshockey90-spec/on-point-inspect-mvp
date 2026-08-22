// Shared locale constants for an inspector's business: country, language, and
// currency. Country drives the default currency (#29) and default report
// language; each can still be set individually. Client-safe — NO server imports
// (this is imported by client components like signup/settings), so the language
// list lives HERE and lib/translate.ts imports it from here.

// Client-report translation languages (English is the source and excluded).
export const SUPPORTED_LANGUAGES: { code: string; name: string; label: string }[] = [
  { code: "es", name: "Spanish", label: "Español" },
  { code: "zh", name: "Simplified Chinese", label: "中文" },
  { code: "vi", name: "Vietnamese", label: "Tiếng Việt" },
  { code: "tl", name: "Tagalog", label: "Tagalog" },
  { code: "ko", name: "Korean", label: "한국어" },
  { code: "fr", name: "French", label: "Français" },
  { code: "pt", name: "Portuguese", label: "Português" },
  { code: "ru", name: "Russian", label: "Русский" },
  { code: "ar", name: "Arabic", label: "العربية" },
  { code: "hi", name: "Hindi", label: "हिन्दी" },
];

export function languageName(code: string): string | null {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name || null;
}
export function isSupportedLanguage(code: string): boolean {
  return SUPPORTED_LANGUAGES.some((l) => l.code === code);
}

export type Country = {
  code: string; // ISO-3166 alpha-2
  name: string;
  currency: string; // ISO-4217
  language: string; // default report language code ("en", "es", ...)
};

// A practical set for where FLOW's inspectors operate. US-first.
export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", currency: "USD", language: "en" },
  { code: "CA", name: "Canada", currency: "CAD", language: "en" },
  { code: "MX", name: "Mexico", currency: "MXN", language: "es" },
  { code: "GB", name: "United Kingdom", currency: "GBP", language: "en" },
  { code: "AU", name: "Australia", currency: "AUD", language: "en" },
  { code: "NZ", name: "New Zealand", currency: "NZD", language: "en" },
  { code: "IE", name: "Ireland", currency: "EUR", language: "en" },
  { code: "PR", name: "Puerto Rico", currency: "USD", language: "es" },
];

export type Currency = { code: string; symbol: string; name: string };

export const CURRENCIES: Currency[] = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "CAD", symbol: "$", name: "Canadian Dollar" },
  { code: "MXN", symbol: "$", name: "Mexican Peso" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "AUD", symbol: "$", name: "Australian Dollar" },
  { code: "NZD", symbol: "$", name: "New Zealand Dollar" },
];

// Languages a business can pick as its default report language — English plus
// the client-report translation languages.
export const BUSINESS_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  ...SUPPORTED_LANGUAGES.map((l) => ({ code: l.code, label: `${l.label} (${l.name})` })),
];

export const DEFAULT_COUNTRY = "US";
export const DEFAULT_CURRENCY = "USD";
export const DEFAULT_LANGUAGE = "en";

export function countryByCode(code: string | null | undefined): Country | null {
  return COUNTRIES.find((c) => c.code === String(code || "").toUpperCase()) || null;
}
export function countryName(code: string | null | undefined): string {
  return countryByCode(code)?.name || "United States";
}
export function currencyForCountry(code: string | null | undefined): string {
  return countryByCode(code)?.currency || DEFAULT_CURRENCY;
}
export function defaultLanguageForCountry(code: string | null | undefined): string {
  return countryByCode(code)?.language || DEFAULT_LANGUAGE;
}

export function isSupportedCurrency(code: string | null | undefined): boolean {
  return CURRENCIES.some((c) => c.code === String(code || "").toUpperCase());
}
export function currencySymbol(code: string | null | undefined): string {
  return CURRENCIES.find((c) => c.code === String(code || "").toUpperCase())?.symbol || "$";
}

// Format a money amount in the given currency. Falls back safely if the code
// isn't a valid ISO-4217 (Intl throws otherwise). Client- and server-safe.
export function formatMoney(
  value: number | null | undefined,
  currency: string | null | undefined = DEFAULT_CURRENCY,
  opts: { maximumFractionDigits?: number } = {},
): string {
  const code = normalizeCurrency(currency);
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: opts.maximumFractionDigits ?? 0,
    }).format(n);
  } catch {
    return `${currencySymbol(code)}${n.toFixed(opts.maximumFractionDigits ?? 0)}`;
  }
}

// Normalize a stored/submitted value to a valid country/currency/language.
export function normalizeCountry(code: any): string {
  return countryByCode(code) ? String(code).toUpperCase() : DEFAULT_COUNTRY;
}
export function normalizeCurrency(code: any): string {
  return isSupportedCurrency(code) ? String(code).toUpperCase() : DEFAULT_CURRENCY;
}
export function normalizeLanguage(code: any): string {
  const c = String(code || "").toLowerCase();
  return BUSINESS_LANGUAGES.some((l) => l.code === c) ? c : DEFAULT_LANGUAGE;
}
