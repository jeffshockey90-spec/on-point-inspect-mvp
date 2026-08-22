import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAIModel } from "../../../lib/openai";
import {
  getSessionUser,
  unauthorized,
  notFound,
  authorizeInspection,
} from "../../../lib/apiAuth";
import { loadFlowStyle } from "../../../lib/ai/flowWriter";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const { inspectionId } = await req.json();

    if (!inspectionId) {
      return NextResponse.json(
        { error: "Missing inspection ID." },
        { status: 400 }
      );
    }

    const numericInspectionId = Number(inspectionId);

    if (!numericInspectionId || !Number.isFinite(numericInspectionId)) {
      return NextResponse.json(
        { error: "Invalid inspection ID." },
        { status: 400 }
      );
    }

    const authorized = await authorizeInspection(
      supabaseAdmin,
      user.id,
      numericInspectionId,
      "id"
    );
    if (!authorized) return notFound();

    const { data: inspection, error: inspectionError } = await supabaseAdmin
      .from("inspections")
      .select("id, address, property_address, client_name")
      .eq("id", numericInspectionId)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json(
        { error: "Inspection not found." },
        { status: 404 }
      );
    }

    const { data: findings, error: findingsError } = await supabaseAdmin
      .from("findings")
      .select(
        "id, title, section, severity, observation, implication, recommendation"
      )
      .eq("inspection_id", numericInspectionId)
      .order("created_at", { ascending: true });

    if (findingsError) {
      return NextResponse.json(
        { error: findingsError.message || "Failed to load findings." },
        { status: 500 }
      );
    }

    if (!findings || findings.length === 0) {
      return NextResponse.json(
        { error: "No findings found for this inspection." },
        { status: 400 }
      );
    }

    const reportFindings = findings.filter((finding: any) => {
      const section = String(finding.section || "").toLowerCase().trim();
      const title = String(finding.title || "").toLowerCase().trim();

      const nonSummaryTitles = new Set([
        "in attendance",
        "occupancy",
        "style",
        "temperature",
        "type of building",
        "weather conditions",
      ]);

      if (section === "inspection details") return false;
      if (section === "disclaimers") return false;
      if (nonSummaryTitles.has(title)) return false;
      if (title.includes("reference photo")) return false;

      return true;
    });

    const findingsForSummary =
      reportFindings.length > 0 ? reportFindings : findings;

    const findingsText = findingsForSummary
      .map(
        (finding: any, index: number) => `
Finding ${index + 1}
Section: ${finding.section || "N/A"}
Severity: ${finding.severity || "N/A"}
Title: ${finding.title || "Untitled Finding"}

Observation:
${finding.observation || "N/A"}

Implication:
${finding.implication || "N/A"}

Recommendation:
${finding.recommendation || "N/A"}
`
      )
      .join("\n\n");

    const property =
      inspection.property_address ||
      inspection.address ||
      "the inspected property";

    const prompt = `
You are an expert home inspector.

Generate a professional executive summary for a home inspection report for:
${property}

The summary should include:

1. Overall Condition
2. Major Concerns
3. Maintenance Items
4. Positive Attributes
5. Recommended Next Steps

Tone:
- professional
- balanced
- realtor friendly
- technically accurate
- easy for clients to understand
- do not exaggerate issues
- do not use alarming wording
- do not use excessive bullet spam

Return clean formatted text.

Inspection Findings:
${findingsText}
`;

    // Match the inspector's voice + learned tone (voice only — finding
    // few-shot examples would mislead a report-level summary).
    const { styleGuidance } = await loadFlowStyle({
      userId: user?.id ?? null,
      inspectionId,
      draft: { text: findingsText },
      includeExamples: false,
    });

    const response = await openai.chat.completions.create({
      model: getAIModel(),
      messages: [
        {
          role: "system",
          content:
            "You generate professional executive summaries for home inspection reports." +
            (styleGuidance ? "\n\n" + styleGuidance : ""),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.45,
    });

    const summary = response.choices[0]?.message?.content?.trim() || "";

    if (!summary) {
      return NextResponse.json(
        { error: "OpenAI did not return a summary." },
        { status: 500 }
      );
    }

    const { data: updatedInspection, error: updateError } = await supabaseAdmin
      .from("inspections")
      .update({
        executive_summary: summary,
        summary_generated_at: new Date().toISOString(),
      })
      .eq("id", numericInspectionId)
      .select("id, executive_summary, summary_generated_at")
      .single();

    if (updateError) {
      console.error("Executive summary save error:", updateError);

      return NextResponse.json(
        {
          error:
            updateError.message ||
            "Summary generated but failed to save to inspection.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      summary: updatedInspection?.executive_summary || summary,
      summary_generated_at: updatedInspection?.summary_generated_at || null,
    });
  } catch (error: any) {
    console.error("Generate summary error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to generate summary.",
      },
      {
        status: 500,
      }
    );
  }
}
