import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const VALID_SECTIONS = [
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

const VALID_SEVERITIES = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

const SECTION_HINTS: Record<string, string> = {
  Exterior:
    "siding, trim, grading, drainage, decks, porches, exterior doors, walkways, driveways, exterior walls, soffit, fascia, gutters, downspouts",
  Roof:
    "roof coverings, shingles, flashing, vents, roof penetrations, chimney exterior above roof, skylights, roof drainage",
  "Basement, Foundation, Crawlspace & Structure":
    "foundation, basement, crawlspace, structural framing, joists, beams, columns, settlement, cracks, moisture intrusion below grade",
  Heating:
    "furnace, boiler, heat pump heating side, burner, flue, duct heating, heating equipment, heat exchanger, gas furnace",
  Cooling:
    "air conditioner, AC condenser, evaporator coil, cooling equipment, refrigerant lines, heat pump cooling side, condensate for cooling",
  Plumbing:
    "water heater, water supply pipes, drain pipes, fixtures, faucets, toilets, tubs, showers, leaks, sump pump, hose bibs",
  Electrical:
    "electrical panel, breakers, wiring, outlets, GFCI, AFCI, service equipment, grounding, bonding, junction boxes, switches, lights",
  Fireplace:
    "fireplace, chimney firebox, damper, hearth, gas logs, wood stove, flue serving fireplace",
  "Attic, Insulation & Ventilation":
    "attic, insulation, ventilation, bathroom exhaust termination, roof sheathing viewed from attic, vapor barrier, attic moisture",
  "Doors, Windows & Interior":
    "interior rooms, walls, ceilings, floors, stairs, handrails, guardrails, interior doors, windows, cabinets, interior finishes",
  "Built-in Appliances":
    "dishwasher, range, oven, cooktop, microwave, garbage disposal, built-in refrigerator, exhaust hood",
  Garage:
    "garage door, garage opener, auto reverse, firewall, garage receptacles, vehicle door, garage ceiling, garage walls",
};

function cleanText(value: any) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSection(value: any, fallback: string) {
  const clean = cleanText(value);
  return VALID_SECTIONS.includes(clean) ? clean : fallback;
}

function normalizeSeverity(value: any, fallback: string) {
  const clean = cleanText(value);
  return VALID_SEVERITIES.includes(clean) ? clean : fallback;
}

function inferSectionFromText(text: string, fallback: string) {
  const clean = text.toLowerCase();

  const rules: Array<[string, string[]]> = [
    ["Electrical", ["breaker", "panel", "gfci", "afci", "outlet", "receptacle", "wire", "wiring", "junction", "double tap", "double-tap", "neutral", "ground", "knockout", "service cable"]],
    ["Roof", ["roof", "shingle", "flashing", "ridge", "valley", "skylight", "roof vent", "drip edge"]],
    ["Plumbing", ["water heater", "pipe", "drain", "trap", "toilet", "sink", "faucet", "shower", "tub", "leak", "sump", "hose bib", "water supply"]],
    ["Heating", ["furnace", "boiler", "burner", "heat exchanger", "flue", "heater", "heating"]],
    ["Cooling", ["air conditioner", "a/c", "ac condenser", "condenser", "evaporator", "refrigerant", "cooling", "condensate"]],
    ["Built-in Appliances", ["dishwasher", "range", "oven", "cooktop", "microwave", "disposal", "appliance"]],
    ["Garage", ["garage", "garage door", "opener", "auto reverse"]],
    ["Attic, Insulation & Ventilation", ["attic", "insulation", "ventilation", "bath fan", "bathroom exhaust", "soffit vent", "gable vent"]],
    ["Basement, Foundation, Crawlspace & Structure", ["foundation", "crawlspace", "crawl space", "basement", "joist", "beam", "column", "structural", "settlement"]],
    ["Fireplace", ["fireplace", "firebox", "damper", "hearth", "wood stove", "gas logs"]],
    ["Doors, Windows & Interior", ["window", "door", "interior", "wall", "ceiling", "floor", "stair", "handrail", "guardrail"]],
    ["Exterior", ["siding", "trim", "grading", "downspout", "gutter", "soffit", "fascia", "deck", "porch", "walkway", "driveway"]],
  ];

  for (const [section, keywords] of rules) {
    if (keywords.some((keyword) => clean.includes(keyword))) return section;
  }

  return fallback;
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const imagesFromMulti = formData.getAll("images") as File[];
    const legacyImage = formData.get("image") as File | null;
    const images = (imagesFromMulti.length ? imagesFromMulti : legacyImage ? [legacyImage] : [])
      .filter((image) => image && image.type?.startsWith("image/"))
      .slice(0, 6);
    const note = cleanText(formData.get("note"));
    const currentSection = normalizeSection(formData.get("section"), "Exterior");
    const currentSeverity = normalizeSeverity(
      formData.get("severity"),
      "Recommended Repair"
    );

    if (!images.length) {
      return NextResponse.json(
        { error: "Add at least one photo before using AI photo recognition." },
        { status: 400 }
      );
    }

    const imageContents = await Promise.all(
      images.map(async (image) => {
        const bytes = await image.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64Image = buffer.toString("base64");
        const mimeType = image.type || "image/jpeg";

        return {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64Image}`,
          },
        };
      })
    );

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a senior certified home inspector helping write a professional inspection report from field inspection photos.

Return ONLY valid JSON.
Do not use markdown.
Do not invent hidden conditions.
Do not overstate the defect.
If the photo is not clear enough to confirm a defect, say that the condition should be reviewed by the inspector and use cautious wording.
Use the inspector note as supporting context, but the photo(s) are the main source.

CRITICAL SECTION RULE:
You MUST choose the best matching section from the Valid sections list below.
The "section" value must exactly match one of the Valid sections, character-for-character.
Do not keep the current selected section unless it is truly the best match.
Do not invent new section names.
The inspector can still manually change the dropdown later, so your job is only to auto-select the best starting section.

Valid sections:
${VALID_SECTIONS.map((section) => `- ${section}: ${SECTION_HINTS[section]}`).join("\n")}

Valid severities:
${VALID_SEVERITIES.map((severity) => `- ${severity}`).join("\n")}

Section examples:
- Electrical panel, breakers, GFCI, outlet, wiring, junction box, double tapped conductors = Electrical
- Furnace, boiler, heating equipment, flue for heating appliance = Heating
- AC condenser, cooling equipment, refrigerant lines = Cooling
- Water heater, plumbing leak, drain, faucet, shower, tub, toilet = Plumbing
- Roof shingles, flashing, vents, roof covering = Roof
- Dishwasher, oven, range, microwave, disposal = Built-in Appliances
- Garage door, opener, garage firewall, garage receptacles = Garage
- Attic insulation, attic ventilation, bathroom exhaust ending in attic = Attic, Insulation & Ventilation
- Foundation, basement, crawlspace, framing, beams, joists = Basement, Foundation, Crawlspace & Structure
- Siding, grading, exterior trim, soffit, fascia, gutters, deck = Exterior
- Interior doors, windows, walls, ceilings, floors, stairs, railings = Doors, Windows & Interior
- Fireplace, firebox, damper, hearth = Fireplace

Return this exact JSON structure:
{
  "title": "",
  "section": "",
  "severity": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}

Writing style:
- Clear, detailed, professional, and client-friendly.
- Observation describes the visible condition.
- Implication explains why it matters.
- Recommendation says who should evaluate/repair and what should be done.
- Prefer conservative wording such as "appeared", "was observed", or "recommend evaluation" when certainty is limited.
          `,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Analyze these field inspection photo(s) together and draft one finding that best represents the visible condition.
Number of photos provided: ${images.length}
Current selected section: ${currentSection}
Current selected severity: ${currentSeverity}
Inspector note, if any: ${note || "None"}

Important: Auto-select the best report section from the valid list. Do not simply repeat the current selected section unless it is the correct section for the visible condition.
When multiple photos are provided, use them as supporting angles of the same finding unless they clearly show unrelated conditions.
              `,
            },
            ...imageContents,
          ] as any[],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const title = cleanText(parsed.title) || "AI Photo Finding";
    const observation = cleanText(parsed.observation);
    const implication = cleanText(parsed.implication);
    const recommendation = cleanText(parsed.recommendation);

    const fallbackText = [title, observation, implication, recommendation, note].join(" ");
    const aiSection = normalizeSection(parsed.section, "");
    const finalSection = aiSection || inferSectionFromText(fallbackText, currentSection);

    return NextResponse.json({
      title,
      section: normalizeSection(finalSection, currentSection),
      severity: normalizeSeverity(parsed.severity, currentSeverity),
      observation,
      implication,
      recommendation,
    });
  } catch (error: any) {
    console.error("AI defect recognition error", error);
    return NextResponse.json(
      { error: error?.message || "Failed to analyze photo." },
      { status: 500 }
    );
  }
}
