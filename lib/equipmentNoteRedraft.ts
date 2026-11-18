// AI redraft of a piece of equipment's report notes (condition, inspector
// note, maintenance note), from the report builder's "Redraft with AI". Uses
// the scanned equipment data, any defects already written up for this kind of
// equipment on the report, the inspector's current notes, and an optional
// instruction. Cautious wording: never says a unit WILL fail or gives a
// deadline — typical service life + a maintenance caveat only.


export type EquipmentNotes = { condition: string; inspector_note: string; maintenance_note: string };
export type RedraftResult = EquipmentNotes & {
  relatedTitles: string[];
  limitationRelated: boolean;
  /** Corrected equipment type when the inspector's instruction/notes say what it really is ("" = unchanged). */
  equipmentType: string;
};
type Candidate = { title: string; severity: string; observation?: string; section?: string };

const clean = (v: unknown, max = 600) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function buildEquipmentRedraftPrompt(input: {
  item: Record<string, any>;
  related: Array<{ title: string; severity: string }>;
  candidates?: Candidate[];
  limitations?: Array<{ text: string; section?: string }>;
  instruction?: string;
}): string {
  const i = input.item || {};
  const facts = [
    ["Equipment", i.equipment_type],
    ["Manufacturer", i.manufacturer],
    ["Model", i.model],
    ["Serial", i.serial],
    ["Manufacture year", i.manufacture_year],
    ["Estimated age", i.estimated_age],
    ["Typical service life", i.expected_service_life],
    ["Refrigerant", i.refrigerant],
  ]
    .filter(([, v]) => clean(v) && !/^(unknown|n\/a|na)$/i.test(clean(v)))
    .map(([k, v]) => `${k}: ${clean(v, 120)}`)
    .join("\n");
  const related = input.related.length
    ? input.related.map((r) => `- ${clean(r.title, 160)} (${clean(r.severity, 40)})`).join("\n")
    : "None found by name";
  const candidates = (input.candidates || []).length
    ? (input.candidates || [])
        .map(
          (c) =>
            `- "${clean(c.title, 160)}" (${clean(c.severity, 40)}${c.section ? `, ${clean(c.section, 60)}` : ""})${
              c.observation ? `: ${clean(c.observation, 200)}` : ""
            }`,
        )
        .join("\n")
    : "None";
  const limitations = (input.limitations || []).length
    ? (input.limitations || [])
        .map((l) => `- ${clean(l.text, 220)}${l.section ? ` (${clean(l.section, 60)})` : ""}`)
        .join("\n")
    : "None";
  return `Rewrite the report notes for this piece of equipment.

Equipment data:
${facts || "(no data plate details)"}

Defects already written up in this report that name this equipment:
${related}

Every other defect on this report (decide which, if any, are about THIS equipment — e.g. a missing TPR discharge pipe or a rusted tank belongs to the water heater; a leaking sink trap does not):
${candidates}

Current notes (the inspector's — keep their facts):
Condition: ${clean(i.condition) || "(none)"}
Inspector note: ${clean(i.inspector_note) || "(none)"}
Maintenance note: ${clean(i.maintenance_note) || "(none)"}

Inspector instruction: ${clean(input.instruction, 400) || "Improve the wording; keep it short, clear and client-friendly."}

Limitations on this report (things the inspector could NOT test, operate, access or fully evaluate):
${limitations}

Rules:
- WHAT this equipment is comes from the scan ("${clean(i.equipment_type, 80) || "unknown"}") unless the INSPECTOR INSTRUCTION above explicitly says it is something else (e.g. "this is a heat pump, not an AC"). Only then set "equipment_type" to the corrected short name (e.g. "Heat Pump"); otherwise set "equipment_type" to "". Never change the type because of wording in the findings, limitations or current notes.
- Always refer to the unit by that type in every field. Findings may call the same unit something else ("condensing unit", "outdoor unit", "condenser", "air handler") — those still count as related to this unit, but do not rename the equipment or describe it as a different type.
- Set "not_fully_evaluated" to true if any limitation above is about THIS equipment (e.g. "water heater not tested — gas off"); then the condition and inspector note must say it could not be fully evaluated and why, and point to the report limitations — never imply it was tested or operated normally.
- List in "related_titles" the exact titles (copied from above) of every defect that is about THIS equipment, including all of the ones that name it. Empty if none.
- If any defects are related, the condition must say deficiencies were noted and point the reader to the report findings — never "no deficiency noted". If none are related, don't claim deficiencies.
- Never say the equipment WILL fail and never give a deadline or years remaining. Talk about typical service life and that actual life varies with maintenance and use.
- Don't invent defects, measurements or brands. Keep each field to 1-3 sentences.

Return ONLY JSON: {"equipment_type":"","condition":"","inspector_note":"","maintenance_note":"","related_titles":[],"not_fully_evaluated":false}`;
}

export function parseEquipmentRedraft(raw: string, fallback: EquipmentNotes): RedraftResult {
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    parsed = {};
  }
  return {
    condition: clean(parsed.condition, 400) || fallback.condition,
    inspector_note: clean(parsed.inspector_note, 1200) || fallback.inspector_note,
    maintenance_note: clean(parsed.maintenance_note, 1200) || fallback.maintenance_note,
    relatedTitles: Array.isArray(parsed.related_titles)
      ? parsed.related_titles.map((t: unknown) => clean(t, 200)).filter(Boolean)
      : [],
    limitationRelated: parsed.not_fully_evaluated === true,
    equipmentType: clean(parsed.equipment_type, 80),
  };
}

/**
 * The equipment's related defects after a redraft: the ones that name it, plus
 * the ones the AI matched — but only titles that really exist on the report.
 */
export function resolveRelatedTitles(
  named: Array<{ title: string }>,
  candidates: Array<{ title: string }>,
  aiTitles: string[],
): string[] {
  const exists = new Map(candidates.map((c) => [c.title.trim().toLowerCase(), c.title.trim()]));
  const out = new Set(named.map((n) => n.title.trim()).filter(Boolean));
  for (const t of aiTitles) {
    const hit = exists.get(String(t || "").trim().toLowerCase());
    if (hit) out.add(hit);
  }
  return Array.from(out);
}

export async function redraftEquipmentNotes(input: {
  item: Record<string, any>;
  related: Array<{ title: string; severity: string }>;
  candidates?: Candidate[];
  limitations?: Array<{ text: string; section?: string }>;
  instruction?: string;
}): Promise<RedraftResult> {
  const fallback: EquipmentNotes = {
    condition: clean(input.item?.condition, 400),
    inspector_note: clean(input.item?.inspector_note, 1200),
    maintenance_note: clean(input.item?.maintenance_note, 1200),
  };
  // Loaded lazily so the prompt helpers above stay importable without an API key.
  const [{ default: OpenAI }, { getAIModel }] = await Promise.all([import("openai"), import("./openai")]);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: getAIModel(),
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You write calm, professional, liability-safe home inspection equipment notes for a client report.",
      },
      { role: "user", content: buildEquipmentRedraftPrompt(input) },
    ],
  });
  return parseEquipmentRedraft(response.choices[0]?.message?.content || "{}", fallback);
}
