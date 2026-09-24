import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAIModel } from "../../../../lib/openai";
import {
  getSessionUser,
  getAdminClient,
  unauthorized,
  authorizeInspection,
} from "../../../../lib/apiAuth";
import {
  MATERIAL_FIELDS,
  buildMaterialFills,
  writeChecklistFills,
} from "../../../../lib/ai/checklistAutofill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const NO_STORE: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

// Lightweight material recognition for a section from a reference photo (which
// otherwise runs no AI). Returns { sectionInfo: { <groupTitle>: <value> } }
// constrained to that section's real material option lists — the exact shape
// buildMaterialFills() consumes. Accuracy-first: only report a material clearly
// visible; everything else stays "Unknown" and is dropped downstream.
export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500, headers: NO_STORE });
    }

    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const inspectionId = String(body?.inspectionId || body?.inspection_id || "").trim();
    const section = String(body?.section || "").trim();
    const images: string[] = Array.isArray(body?.images)
      ? body.images
      : body?.imageDataUrl
        ? [String(body.imageDataUrl)]
        : [];

    const groups = MATERIAL_FIELDS[section];
    if (!section || !groups || !groups.length || !images.length) {
      // Nothing this section can auto-identify, or no image — no-op.
      return NextResponse.json({ sectionInfo: {} }, { headers: NO_STORE });
    }

    const fieldList = groups
      .map((g) => {
        // Brand/manufacturer fields are OPEN-ENDED: read the actual brand off
        // the logo/badge (there are far more brands than any list, and the fill
        // engine checks an existing brand or adds a new one). Material fields
        // stay constrained to their option list.
        const isBrand = /brand|manufacturer/i.test(g.groupTitle);
        return isBrand
          ? `- "${g.groupTitle}": the exact brand name read from the appliance's logo/badge/nameplate (e.g. Bosch, Samsung, LG, Whirlpool, KitchenAid, Frigidaire, GE, Maytag), or "Unknown" if no brand is visible`
          : `- "${g.groupTitle}": one of [${g.options.join(", ")}] or "Unknown"`;
      })
      .join("\n");

    const systemPrompt = `You identify details visible in an inspection photo of the "${section}" area — building materials, and for appliances the BRAND read from a visible logo, badge, or nameplate. For each field below, choose the single best-matching option from its list based ONLY on what is clearly visible (read the brand logo for a fridge / dishwasher / range / oven). If you cannot tell, use "Unknown". Never guess a brand you cannot see. Do not invent fields.

Fields:
${fieldList}

Return ONLY valid JSON: { "sectionInfo": { <field>: <value>, ... } } — include a field only when you are confident; omit or use "Unknown" otherwise.`;

    const content: any[] = [
      { type: "text", text: `Identify the materials in this ${section} photo.` },
      ...images.slice(0, 3).map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    const aiResponse = await openai.chat.completions.create({
      model: getAIModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      temperature: 0.1,
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(aiResponse.choices[0]?.message?.content || "{}");
    } catch {
      parsed = {};
    }

    const sectionInfo =
      parsed?.sectionInfo && typeof parsed.sectionInfo === "object" ? parsed.sectionInfo : {};

    // Write the recognized materials into the section's checklist (only-empty
    // groups, snap-to-option, add-as-NEW) — same behavior as finding-photo
    // material autofill. Best-effort; requires an authorized inspection.
    let written = 0;
    if (inspectionId) {
      try {
        const admin = getAdminClient();
        const authorized = await authorizeInspection(admin, user.id, inspectionId, "id");
        if (authorized) {
          const fills = buildMaterialFills(section, sectionInfo);
          if (fills.length) written = await writeChecklistFills(admin, inspectionId, fills);
        }
      } catch (writeErr) {
        console.error("Section-materials write failed:", writeErr);
      }
    }

    return NextResponse.json({ sectionInfo, written }, { headers: NO_STORE });
  } catch (error: any) {
    console.error("Section-materials error:", error);
    // Fail soft — reference photos still saved; this is only an enhancement.
    return NextResponse.json({ sectionInfo: {} }, { headers: NO_STORE });
  }
}
