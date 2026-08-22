// Few-shot retrieval from the inspector's OWN published findings.
//
// This is the "inspector brain" the whole app already produced but never reused:
// every published report is a gold-standard example of how THIS inspector writes.
// We pull the closest handful and feed them to the writer as examples, so a fresh
// draft sounds like the inspector's real published work — no embeddings/pgvector
// needed, just section + keyword ranking over their own rows.
//
// Server-only (service-role). Never import from client code.

import { createClient } from "@supabase/supabase-js";

function admin(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const STOP_WORDS = new Set([
  "the","and","for","with","that","this","from","have","was","were","are","not",
  "but","you","your","has","had","will","can","should","would","could","been",
  "into","near","onto","off","out","its","it's","a","an","of","to","in","on","is",
  "at","by","or","as","be","we","recommend","recommended","qualified","contractor",
]);

function keywordsFrom(text: string): string[] {
  return Array.from(
    new Set(
      String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOP_WORDS.has(w)),
    ),
  );
}

// Resolve the inspector user id from whatever context a route happens to have.
export async function resolveInspectorId(opts: {
  userId?: string | null;
  inspectionId?: string | number | null;
}): Promise<string | null> {
  if (opts.userId) return opts.userId;
  const db = admin();
  if (!db || opts.inspectionId == null || opts.inspectionId === "") return null;
  try {
    const { data } = await db
      .from("inspections")
      .select("inspector_id")
      .eq("id", opts.inspectionId)
      .maybeSingle();
    return (data as any)?.inspector_id ?? null;
  } catch {
    return null;
  }
}

export type FindingExample = {
  title: string;
  section: string;
  severity: string;
  location: string | null;
  observation: string;
  implication: string;
  recommendation: string;
};

async function queryPublished(
  db: any,
  inspectorId: string,
  section: string | null,
  limit: number,
): Promise<FindingExample[]> {
  let q = db
    .from("findings")
    .select(
      "title,section,severity,location,observation,implication,recommendation,created_at,inspections!inner(published)",
    )
    .eq("inspector_id", inspectorId)
    .eq("inspections.published", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (section) q = q.eq("section", section);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as any[])
    .filter((r) => (r.observation || r.recommendation))
    .map((r) => ({
      title: String(r.title || "").trim(),
      section: String(r.section || "").trim(),
      severity: String(r.severity || "").trim(),
      location: r.location ? String(r.location).trim() : null,
      observation: String(r.observation || "").trim(),
      implication: String(r.implication || "").trim(),
      recommendation: String(r.recommendation || "").trim(),
    }));
}

// Retrieve the inspector's most relevant published findings for the section /
// subject being written. Returns [] on any miss (new inspector, no matches, no
// service role) so callers can compose unconditionally.
export async function getInspectorFindingExamples(opts: {
  inspectorId?: string | null;
  userId?: string | null;
  inspectionId?: string | number | null;
  section?: string | null;
  subject?: string; // draft text (title/observation/note/transcript)
  limit?: number;
}): Promise<FindingExample[]> {
  const db = admin();
  if (!db) return [];
  const inspectorId =
    opts.inspectorId || (await resolveInspectorId(opts));
  if (!inspectorId) return [];

  const want = Math.max(1, Math.min(5, opts.limit ?? 3));
  const section = opts.section?.trim() || null;

  try {
    // Prefer same-section examples; backfill from all sections if too few.
    let pool = await queryPublished(db, inspectorId, section, 40);
    if (pool.length < want && section) {
      const more = await queryPublished(db, inspectorId, null, 40);
      const seen = new Set(pool.map((p) => p.title + p.observation));
      for (const m of more) {
        const k = m.title + m.observation;
        if (!seen.has(k)) {
          pool.push(m);
          seen.add(k);
        }
      }
    }
    if (!pool.length) return [];

    // Rank by keyword overlap with the subject; ties keep recency (query order).
    const kw = keywordsFrom(
      `${opts.subject || ""} ${opts.section || ""}`,
    );
    if (kw.length) {
      pool = pool
        .map((ex, i) => {
          const hay = `${ex.title} ${ex.observation} ${ex.implication} ${ex.recommendation}`.toLowerCase();
          let score = 0;
          for (const w of kw) if (hay.includes(w)) score += 1;
          return { ex, score, i };
        })
        .sort((a, b) => b.score - a.score || a.i - b.i)
        .map((r) => r.ex);
    }

    return pool.slice(0, want);
  } catch {
    return [];
  }
}

// Render examples as a compact prompt block. Empty string when there are none.
export function formatExamplesForPrompt(examples: FindingExample[]): string {
  if (!examples?.length) return "";
  const blocks = examples.map((ex, i) => {
    const lines = [
      `Example ${i + 1} (${ex.section || "?"} · ${ex.severity || "?"}):`,
      ex.title ? `Title: ${ex.title}` : "",
      ex.location ? `Location: ${ex.location}` : "",
      ex.observation ? `Observation: ${ex.observation}` : "",
      ex.implication ? `Implication: ${ex.implication}` : "",
      ex.recommendation ? `Recommendation: ${ex.recommendation}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  });
  return [
    "INSPECTOR'S OWN PUBLISHED EXAMPLES — match this voice, structure, and level of detail (do NOT copy their specifics; write for the current subject):",
    ...blocks,
  ].join("\n\n");
}
