import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "../../../lib/supabaseClient";

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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      reportId,
      section,
      severity,
      note,
      imageDataUrl,
    } = body;

    const response =
      await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content: `
You are a professional certified home inspector.

Convert quick field notes into detailed inspection findings.

Return ONLY valid JSON.

Use this exact structure:

{
  "title": "",
  "section": "",
  "severity": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}

Rules:
- Write detailed professional findings.
- Use Observation, Implication, Recommendation format.
- Realtor-friendly but accurate.
- Do not exaggerate defects.
- Do not invent information not present.
            `,
          },
          {
            role: "user",
            content: `
Section:
${section}

Severity:
${severity}

Inspector note:
${note}
            `,
          },
        ],
      });

    const raw =
      response.choices[0]?.message?.content || "{}";

    const parsed = JSON.parse(raw);

    const cleanSection = VALID_SECTIONS.includes(
      parsed.section
    )
      ? parsed.section
      : section;

    const cleanSeverity =
      VALID_SEVERITIES.includes(parsed.severity)
        ? parsed.severity
        : severity;

    let imageUrl = "";

    if (imageDataUrl) {
      const blob = await fetch(imageDataUrl).then((r) =>
        r.blob()
      );

      const fileName = `${Date.now()}-${crypto.randomUUID()}.jpg`;

      const { error: uploadError } =
        await supabase.storage
          .from("inspection-photos")
          .upload(fileName, blob, {
            contentType: "image/jpeg",
          });

      if (!uploadError) {
        const { data } = supabase.storage
          .from("inspection-photos")
          .getPublicUrl(fileName);

        imageUrl = data.publicUrl;
      }
    }

    const { data: finding, error } =
      await supabase
        .from("findings")
        .insert({
          inspection_id: reportId,
          section: cleanSection,
          severity: cleanSeverity,
          title:
            parsed.title || "Inspection Finding",
          observation:
            parsed.observation || "",
          implication:
            parsed.implication || "",
          recommendation:
            parsed.recommendation || "",
          image_url: imageUrl || null,
        })
        .select("*")
        .single();

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 500 }
      );
    }

    if (imageUrl && finding?.id) {
      await supabase.from("photos").insert({
        inspection_id: reportId,
        finding_id: finding.id,
        url: imageUrl,
        image_url: imageUrl,
      });
    }

    return NextResponse.json({
      success: true,
      finding,
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Offline AI sync failed.",
      },
      { status: 500 }
    );
  }
}