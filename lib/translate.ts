// Report translation for the client/realtor-facing report (#23 multi-language).
// One AI call translates the whole report's client-facing strings, cached in
// report_translations keyed by (inspection_id, lang), so repeat views in a
// language are instant and free. Server-only.

import OpenAI from "openai";
import crypto from "crypto";
import { getAIModel } from "./openai";
import {
  SUPPORTED_LANGUAGES,
  languageName,
  isSupportedLanguage,
} from "./locale";

// Re-exported so existing server import sites (e.g. the share page) keep working.
export { SUPPORTED_LANGUAGES, languageName, isSupportedLanguage };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sha(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 24);
}

// Translate a batch of strings into `languageNameStr`, preserving order/count.
// Chunked so no single request is too large. Returns translations aligned to
// the input; on any failure the original string is kept for that item.
async function translateBatch(
  strings: string[],
  languageNameStr: string,
): Promise<string[]> {
  const CHUNK = 60;
  const out: string[] = [];
  for (let i = 0; i < strings.length; i += CHUNK) {
    const chunk = strings.slice(i, i + CHUNK);
    try {
      const res = await openai.chat.completions.create({
        model: getAIModel(),
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a professional translator for U.S. home-inspection reports.
Translate each string in the input array into ${languageNameStr}.
Rules:
- Return ONLY valid JSON: {"translations": ["...", "..."]} with EXACTLY the same number of items, in the same order.
- Translate naturally and professionally, as a home inspector would write for a client.
- Do NOT translate or alter: measurements, numbers, model/serial numbers, brand names, or the section/severity label words if they are proper nouns.
- Preserve meaning precisely; never add, omit, or editorialize.
- If an item is empty, return it empty.`,
          },
          {
            role: "user",
            content: JSON.stringify({ strings: chunk }),
          },
        ],
      });
      const raw = res.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed.translations) ? parsed.translations : [];
      for (let j = 0; j < chunk.length; j++) {
        const t = arr[j];
        out.push(typeof t === "string" && t.trim() ? t : chunk[j]);
      }
    } catch {
      // Keep originals for this chunk on failure — never break the report.
      out.push(...chunk);
    }
  }
  return out;
}

// Return a source->translated map for the given strings in the target language,
// using the cache and translating only what's missing. `admin` is service-role.
export async function getReportTranslations(
  admin: any,
  inspectionId: number | string,
  langCode: string,
  sourceStrings: string[],
): Promise<Record<string, string>> {
  const langName = languageName(langCode);
  if (!langName) return {};

  // Unique, non-empty sources.
  const uniques = Array.from(
    new Set(sourceStrings.map((s) => String(s || "").trim()).filter(Boolean)),
  );
  if (!uniques.length) return {};

  // Load existing cache row.
  let cached: Record<string, string> = {};
  try {
    const { data } = await admin
      .from("report_translations")
      .select("translations")
      .eq("inspection_id", inspectionId)
      .eq("lang", langCode)
      .maybeSingle();
    if (data?.translations && typeof data.translations === "object") {
      cached = data.translations;
    }
  } catch {
    cached = {};
  }

  // Which sources still need translating (keyed by content hash)?
  const missing = uniques.filter((s) => !(sha(s) in cached));
  if (missing.length) {
    const translated = await translateBatch(missing, langName);
    for (let i = 0; i < missing.length; i++) {
      cached[sha(missing[i])] = translated[i];
    }
    try {
      await admin.from("report_translations").upsert(
        {
          inspection_id: inspectionId,
          lang: langCode,
          translations: cached,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "inspection_id,lang" },
      );
    } catch {
      /* cache write is best-effort */
    }
  }

  // Build source-string -> translation map for the caller.
  const map: Record<string, string> = {};
  for (const s of uniques) {
    const hit = cached[sha(s)];
    if (hit) map[s] = hit;
  }
  return map;
}

// Convenience translator bound to a prepared map. Falls back to the original.
export function makeTranslator(map: Record<string, string>) {
  return (value: any): string => {
    const s = value == null ? "" : String(value);
    const key = s.trim();
    if (!key) return s;
    return map[key] || s;
  };
}
