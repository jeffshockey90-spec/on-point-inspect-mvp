import { NextResponse } from "next/server";
import {
  authorizeInspection,
  getAdminClient,
  getSessionUser,
  notFound,
  unauthorized,
} from "../../../../lib/apiAuth";
import { openai, getFastAIModel, getAIVersion, requireOpenAIKey } from "../../../../lib/openai";
import { logAIEvent } from "../../../../lib/logging";
import { classifyAIServiceError } from "../../../../lib/aiServiceError";
import { CHECKLIST_LIBRARY } from "../../../../lib/checklistLibrary";
import { writeChecklistFills, type ChecklistFill } from "../../../../lib/ai/checklistAutofill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getAdminClient();

function cleanText(value: any) {
  return String(value || "").trim();
}
function normKey(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// The allowed option list for a (section, group), so the camera can offer a
// quick-correct dropdown on each voice-filled box if the recognizer misheard.
// Returns [] for free-text groups (no fixed options).
function getGroupOptions(section: string, groupTitle: string): string[] {
  const groups = (CHECKLIST_LIBRARY as any)[section];
  if (!groups) return [];
  const group = groups.find((g: any) => normKey(g.title) === normKey(groupTitle));
  if (!group || group.type === "text") return [];
  return Array.isArray(group.options) ? group.options.map((o: any) => String(o)) : [];
}

// Common spoken variants → canonical term, so "sheetrock" ticks Drywall, "lvp"
// ticks Vinyl, etc. Keyed by normalized token.
const VALUE_SYNONYMS: Record<string, string> = {
  sheetrock: "drywall",
  gypsum: "drywall",
  gyp: "drywall",
  gypsumboard: "drywall",
  wallboard: "drywall",
  wood: "hardwood",
  hardwoods: "hardwood",
  woodfloor: "hardwood",
  woodfloors: "hardwood",
  lvp: "vinyl",
  lvt: "vinyl",
  luxuryvinyl: "vinyl",
  vinylplank: "vinyl",
  linoleum: "vinyl",
  ceramic: "tile",
  porcelain: "tile",
  ceramictile: "tile",
  tiled: "tile",
  carpeted: "carpet",
  carpeting: "carpet",
  laminated: "laminate",
  quartz: "quartz",
  granitecountertop: "granite",
  pvc: "pvc",
  cpvc: "cpvc",
  pex: "pex",
  galvanized: "galvanized",
  breaker: "breakers",
  breakerpanel: "breakers",
  fusebox: "fuses",
};

function tokenize(s: string): string[] {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// Forgiving map of a spoken value to the best built-in option: exact → synonym →
// containment → token overlap → closest spelling. Returns null if nothing is a
// confident match (caller then promotes it to a custom option).
function fuzzyMatchOption(value: string, options: string[]): string | null {
  if (!Array.isArray(options) || options.length === 0) return null;
  const v = normKey(value);
  if (!v) return null;

  for (const o of options) if (normKey(o) === v) return o; // exact

  const vTokens = tokenize(value).map((t) => VALUE_SYNONYMS[t] || t);
  const vSyn = normKey(vTokens.join(""));
  for (const o of options) if (normKey(o) === vSyn) return o; // synonym-exact

  // Containment either direction (guard tiny fragments).
  let best: string | null = null;
  let bestScore = 0;
  for (const o of options) {
    const no = normKey(o);
    if (no.length >= 3 && v.includes(no) && no.length > bestScore) { best = o; bestScore = no.length; }
    if (v.length >= 3 && no.includes(v) && v.length > bestScore) { best = o; bestScore = v.length; }
    if (no.length >= 3 && vSyn.includes(no) && no.length > bestScore) { best = o; bestScore = no.length; }
  }
  if (best) return best;

  // Shared significant token (e.g. "double hung windows" ↔ "Double-hung").
  const vSet = new Set(vTokens.filter((t) => t.length >= 3));
  for (const o of options) {
    if (tokenize(o).some((t) => t.length >= 3 && vSet.has(t))) return o;
  }

  // Closest spelling for a mishear/typo, scaled to length.
  let lBest: string | null = null;
  let lDist = Infinity;
  for (const o of options) {
    const no = normKey(o);
    const d = levenshtein(v, no);
    const tol = Math.max(1, Math.floor(Math.max(v.length, no.length) * 0.25));
    if (d < lDist && d <= tol) { lDist = d; lBest = o; }
  }
  return lBest;
}

// Compact vocabulary of every section-info field + its allowed options, so the
// model knows exactly which checkboxes exist and what they can be set to.
function buildVocab() {
  const lines: string[] = [];
  for (const [section, groups] of Object.entries(CHECKLIST_LIBRARY)) {
    // Include EVERY section — all checkboxes are voice-fillable, including
    // Inspection Details (Style, Type of Building, weather, attendance).
    for (const g of groups as any[]) {
      if (g.type === "text") {
        lines.push(`${section} > ${g.title}: <number or short text>`);
      } else if (Array.isArray(g.options) && g.options.length) {
        lines.push(`${section} > ${g.title}: [${g.options.join(", ")}]`);
      }
    }
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  let inspectionId: any = null;
  let userId: string | null = null;
  try {
    requireOpenAIKey();

    const user = await getSessionUser();
    if (!user) return unauthorized();
    userId = user.id;

    const body = await req.json().catch(() => ({}));
    inspectionId = body.inspectionId || body.inspection_id;
    const transcript = cleanText(body.transcript).slice(0, 4000);

    if (!inspectionId) {
      return NextResponse.json({ error: "Missing inspection ID." }, { status: 400 });
    }
    if (!transcript) {
      return NextResponse.json({ error: "Nothing was heard — try again." }, { status: 400 });
    }

    const inspection = await authorizeInspection(supabaseAdmin, user.id, inspectionId, "id");
    if (!inspection) return notFound("Inspection not found.");

    const systemPrompt = `You convert a home inspector's SPOKEN notes into section-info checklist selections.

You are given the checklist as "Section > Field: [allowed options]" (or "<number or short text>" for free fields). For each thing the inspector clearly states, output which field it fills and the value, inferring the section from the content.

The inspector speaks NATURALLY and CONVERSATIONALLY, often listing several attributes in ONE sentence — e.g. "the floor covering is vinyl, the walls are drywall, the countertops are granite, and the hood exhaust is vented". Split such a sentence into a SEPARATE fill per attribute and map each to its field. Ignore filler/connective words ("the", "is", "are", "and", "um", "so", "then").

Examples:
- "asphalt shingles" -> Roof > Roof Covering Material -> "Asphalt"
- "water shut off in the basement" -> Plumbing > Main Water Shutoff Location -> "Basement"
- "200 amp panel" / "two hundred amp" -> Electrical > Panel Capacity -> "200 AMP"
- "double hung windows" -> Doors, Windows & Interior > Window Type -> "Double-hung"
- "copper supply lines" -> Plumbing > Water Supply Material -> "Copper"
- "the floor covering is vinyl, the walls are drywall, the countertops are granite, and the hood exhaust is vented" -> FOUR fills: Floor Coverings -> "Vinyl"; Wall Material -> "Drywall"; Countertop Material -> "Granite"; Exhaust Hood Type -> closest option (e.g. "Vented")

Each fill has an "op": "add" (the default — check the box) or "remove" (uncheck/undo it).
- REMOVE when the inspector says to take something back: "remove drywall", "take off drywall", "delete the vinyl", "not drywall", "scratch that, not plaster". Output that field+value with op "remove".
- CORRECTION ("the walls are plaster, NOT drywall" / "change the walls to plaster" / "actually make the countertops quartz") = TWO fills: op "remove" for the old value AND op "add" for the new value, same field. If the old value isn't stated (just "change walls to plaster"), still emit the add; only emit a remove when a specific old value is named.

Rules:
- Choose the single best-matching ALLOWED option for each field. For a <number or short text> field, output the spoken value (e.g. "12" for insulation depth).
- Only include fields the inspector CLEARLY stated. Never invent. If unsure which field or value, omit it.
- One utterance can set MANY fields across different sections; output ALL of them, one per stated attribute.
- Return ONLY valid JSON: { "fills": [ { "section": "", "field": "", "value": "", "op": "add" } ] }. Omit "op" or use "add" for a normal selection; use "remove" to uncheck.`;

    const userPrompt = `Checklist (Section > Field: options):
${buildVocab()}

Inspector said:
"""
${transcript}
"""

Return the JSON fills now.`;

    // Fast model: this is constrained slot-filling (map spoken words to a fixed
    // checklist option list), re-validated server-side against CHECKLIST_LIBRARY
    // below — not prose generation — so the fast model is equivalent here and
    // noticeably quicker. (Writer wording lives in ai-capture, left untouched.)
    const model = getFastAIModel();
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
    } catch (error: any) {
      const svc = classifyAIServiceError(error);
      await logAIEvent({
        userId,
        inspectionId,
        tool: "voice_section_fill",
        status: "failed",
        response: { code: svc.code, error: svc.technicalMessage || svc.message },
      });
      return NextResponse.json(
        { error: svc.message, code: svc.code, retryable: svc.retryable },
        { status: svc.status },
      );
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
    } catch {
      parsed = {};
    }

    // Indexes so matching is forgiving: the model only has to get the FIELD and
    // VALUE right. A normalized section lookup handles spacing/punctuation/case,
    // and a global field index recovers a fill even when the model put it under
    // the wrong/misformatted section — the field title is what the inspector
    // actually said. (Previously an exact-string section lookup silently DROPPED
    // any fill whose section name didn't match verbatim → lots of "didn't catch".)
    const sectionByNorm: Record<string, string> = {};
    const fieldIndex: Record<string, { section: string; group: any }> = {};
    for (const [sec, groups] of Object.entries(CHECKLIST_LIBRARY)) {
      sectionByNorm[normKey(sec)] = sec;
      for (const g of groups as any[]) {
        const k = normKey((g as any).title);
        if (!fieldIndex[k]) fieldIndex[k] = { section: sec, group: g };
      }
    }

    // Resolve each proposed fill against the real checklist.
    type Proposed = ChecklistFill & { op: "add" | "remove" };
    const proposed: Proposed[] = [];
    const unmatched: string[] = []; // heard but couldn't be placed — for feedback
    for (const item of Array.isArray(parsed?.fills) ? parsed.fills : []) {
      const sectionRaw = cleanText(item?.section);
      const field = cleanText(item?.field || item?.group);
      const value = cleanText(item?.value);
      const op: "add" | "remove" = String(item?.op || "add").toLowerCase() === "remove" ? "remove" : "add";
      if (!field || !value) continue;

      // Prefer the stated section (exact or normalized); else fall back to the
      // field's own home section so a mislabeled section still resolves.
      let section = "";
      let group: any = null;
      const canonSection = (CHECKLIST_LIBRARY as any)[sectionRaw]
        ? sectionRaw
        : sectionByNorm[normKey(sectionRaw)] || "";
      if (canonSection) {
        const g = ((CHECKLIST_LIBRARY as any)[canonSection] || []).find(
          (x: any) => normKey(x.title) === normKey(field),
        );
        if (g) {
          section = canonSection;
          group = g;
        }
      }
      if (!group) {
        const hit = fieldIndex[normKey(field)];
        if (hit) {
          section = hit.section;
          group = hit.group;
        }
      }
      if (!group) {
        unmatched.push(value);
        continue;
      }

      if (group.type === "text") {
        const num = value.match(/\d+(?:\.\d+)?/)?.[0] || value;
        proposed.push({ section, groupTitle: group.title, kind: "text", value: num, matched: false, op });
      } else {
        // Forgiving option match: exact → synonym → containment → closest.
        const matchedOpt = fuzzyMatchOption(value, group.options || []);
        proposed.push({
          section,
          groupTitle: group.title,
          kind: "option",
          value: matchedOpt || value,
          matched: Boolean(matchedOpt),
          op,
        });
      }
    }

    // Handle REMOVE ops up front: uncheck the matching selection(s). (Text groups
    // store the value as "__TEXT_VALUE__"; options store the display value.)
    const removedList: Array<{ section: string; group: string; value: string }> = [];
    for (const r of proposed.filter((p) => p.op === "remove")) {
      const delQ = supabaseAdmin
        .from("section_checklist_selections")
        .delete()
        .eq("inspection_id", inspectionId)
        .eq("section", r.section)
        .eq("group_title", r.groupTitle);
      const { error: delErr } =
        r.kind === "text" ? await delQ.eq("value", "__TEXT_VALUE__") : await delQ.eq("value", r.value);
      if (!delErr) removedList.push({ section: r.section, group: r.groupTitle, value: r.value });
    }
    // Only ADD ops flow into the write path below.
    const addProposed = proposed.filter((p) => p.op === "add");

    // Add each spoken value as its own checkbox. Option groups are MULTI-SELECT
    // (e.g. Wall Material = Drywall AND Paneling, Floor Coverings = Tile AND
    // Vinyl), exactly like the manual checklist — so we DON'T skip a group just
    // because it already has a value; we only skip the EXACT value that's already
    // checked (no duplicates). Text fields (a single number like Insulation
    // Depth) stay single-value: skip if the group already has a text value.
    const applied: Array<{ section: string; group: string; value: string; options: string[] }> = [];
    const toWrite: ChecklistFill[] = [];
    let alreadySet = 0;
    const seen = new Set<string>();

    // Pull every existing selection for this inspection ONCE, then test each
    // proposed fill in memory. A long conversational sentence produces many
    // fills; doing a round-trip per fill was the slow tail. Build two lookups:
    //   optionKeys  — section::group::normValue for multi-select option rows
    //   textGroups  — section::group for groups that already hold a text value
    const { data: existingRows } = await supabaseAdmin
      .from("section_checklist_selections")
      .select("section, group_title, value")
      .eq("inspection_id", inspectionId);
    const optionKeys = new Set<string>();
    const textGroups = new Set<string>();
    for (const row of existingRows || []) {
      const section = String((row as any).section || "");
      const group = String((row as any).group_title || "");
      const value = String((row as any).value ?? "");
      if (value === "__TEXT_VALUE__") {
        textGroups.add(`${section}::${group}`);
      } else {
        optionKeys.add(`${section}::${group}::${normKey(value)}`);
      }
    }

    for (const fill of addProposed) {
      // De-dupe WITHIN this one utterance by the exact target, so "drywall and
      // paneling" keeps BOTH (same group, different value) but "drywall drywall"
      // collapses to one.
      const dedupeKey =
        fill.kind === "text"
          ? `${fill.section}::${fill.groupTitle}::__TEXT__`
          : `${fill.section}::${fill.groupTitle}::${normKey(fill.value)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // Options: already-checked only when this SAME value exists (multi-select).
      // Text: already-set when the group already holds any text value.
      const already =
        fill.kind === "text"
          ? textGroups.has(`${fill.section}::${fill.groupTitle}`)
          : optionKeys.has(`${fill.section}::${fill.groupTitle}::${normKey(fill.value)}`);
      if (already) {
        alreadySet += 1; // understood, but that box is already checked — not a miss
        continue;
      }

      toWrite.push(fill);
      applied.push({
        section: fill.section,
        group: fill.groupTitle,
        value: fill.value,
        // Options for the camera's quick-correct dropdown (empty for text fields).
        options: fill.kind === "text" ? [] : getGroupOptions(fill.section, fill.groupTitle),
      });
    }

    // overwrite:true because we've already de-duped above against the exact
    // (group,value); without it writeChecklistFills would re-apply its own
    // group-is-empty guard and block the 2nd option of a multi-select group.
    // Stamp inspector_id = the acting inspector: this is a SERVICE-ROLE client,
    // so otherwise the rows save with inspector_id = null and the RLS'd builder
    // read (keyed on inspector_id) can't see them. user.id matches a manual insert.
    const written = toWrite.length
      ? await writeChecklistFills(supabaseAdmin, inspectionId, toWrite, {
          inspectorId: user.id,
          overwrite: true,
        })
      : 0;

    await logAIEvent({
      userId,
      inspectionId,
      tool: "voice_section_fill",
      prompt: "Voice section fill",
      response: { proposed: proposed.length, applied: applied.length, written, alreadySet, removed: removedList.length, unmatched: unmatched.length },
      tokensUsed: completion.usage?.total_tokens ?? null,
      status: "success",
      model,
      aiVersion: getAIVersion("voice-section-fill"),
    });

    return NextResponse.json({
      success: true,
      written,
      applied,
      alreadySet,
      removed: removedList,
      unmatched: [...new Set(unmatched)].slice(0, 6),
    });
  } catch (error: any) {
    const svc = classifyAIServiceError(error);
    return NextResponse.json(
      { error: svc.message || error?.message || "Voice fill failed." },
      { status: svc.status || 500 },
    );
  }
}
