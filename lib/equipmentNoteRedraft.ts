// AI redraft of a piece of equipment's report notes (condition, inspector
// note, maintenance note), from the report builder's "Redraft with AI". Uses
// the scanned equipment data, any defects already written up for this kind of
// equipment on the report, the inspector's current notes, and an optional
// instruction. Cautious wording: never says a unit WILL fail or gives a
// deadline — typical service life + a maintenance caveat only.


export type EquipmentNotes = { condition: string; inspector_note: string; maintenance_note: string };

const clean = (v: unknown, max = 600) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function buildEquipmentRedraftPrompt(input: {
  item: Record<string, any>;
  related: Array<{ title: string; severity: string }>;
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
    : "None";
  return `Rewrite the report notes for this piece of equipment.

Equipment data:
${facts || "(no data plate details)"}

Defects already written up in this report for this equipment:
${related}

Current notes (the inspector's — keep their facts):
Condition: ${clean(i.condition) || "(none)"}
Inspector note: ${clean(i.inspector_note) || "(none)"}
Maintenance note: ${clean(i.maintenance_note) || "(none)"}

Inspector instruction: ${clean(input.instruction, 400) || "Improve the wording; keep it short, clear and client-friendly."}

Rules:
- If defects are listed above, the condition must say deficiencies were noted and point the reader to the report findings — never "no deficiency noted".
- Never say the equipment WILL fail and never give a deadline or years remaining. Talk about typical service life and that actual life varies with maintenance and use.
- Don't invent defects, measurements or brands. Keep each field to 1-3 sentences.

Return ONLY JSON: {"condition":"","inspector_note":"","maintenance_note":""}`;
}

export function parseEquipmentRedraft(raw: string, fallback: EquipmentNotes): EquipmentNotes {
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
  };
}

export async function redraftEquipmentNotes(input: {
  item: Record<string, any>;
  related: Array<{ title: string; severity: string }>;
  instruction?: string;
}): Promise<EquipmentNotes> {
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
