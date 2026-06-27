import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export function getAIModel(preferred?: string) {
  return (
    preferred ||
    process.env.OPENAI_SMARTEST_MODEL ||
    process.env.OPENAI_DEFAULT_MODEL ||
    "gpt-4o"
  );
}

export function getFastAIModel(preferred?: string) {
  return (
    preferred ||
    process.env.OPENAI_FAST_MODEL ||
    process.env.OPENAI_DEFAULT_MODEL ||
    "gpt-4o-mini"
  );
}

export function getAIVersion(feature: string) {
  return `${feature}-ai-core-1.0`;
}

export function requireOpenAIKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
}
