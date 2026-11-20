// Request parameters that differ by OpenAI model family. Newer models
// (o-series, gpt-5, gpt-6 …) reject a custom `temperature`; sending one makes
// the whole request fail. Pure helpers (no API client import).

export function supportsTemperature(model: string): boolean {
  return !/^(o\d|gpt-[5-9])/i.test(String(model || "").trim());
}

/** `{ temperature }` when the model accepts it, else nothing. */
export function temperatureParam(model: string, temperature: number | undefined): { temperature?: number } {
  return temperature !== undefined && supportsTemperature(model) ? { temperature } : {};
}

/**
 * The model for live-camera FINDINGS (the deliberate capture/analyze drafts):
 * OPENAI_FINDINGS_MODEL when set (e.g. gpt-6.2-sol), else the given default.
 */
export function findingsModel(fallback: string): string {
  return String(process.env.OPENAI_FINDINGS_MODEL || "").trim() || fallback;
}
