// Which manufacture year to trust for a scanned unit. A brand-specific serial
// decode with a fixed, documented date code (Goodman/Amana/Daikin YYMM, A.O.
// Smith family YYWW, Rheem/Ruud MMYY) wins over the AI's own reading, which
// tends to take the first four digits of a serial as a year (Goodman serial
// 2005388630 = May 2020, not 2005). Otherwise the AI's year, then any looser
// serial guess.
export function pickManufactureYear(input: {
  strictSerialYear: number | null;
  aiYear: number | null;
  fallbackSerialYear: number | null;
}): number | null {
  return input.strictSerialYear ?? input.aiYear ?? input.fallbackSerialYear ?? null;
}
