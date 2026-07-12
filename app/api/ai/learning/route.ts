import { NextResponse } from "next/server";
import { learningEngine } from "../../../../lib/ai/LearningEngine";

export async function GET() {
  try {
    const patterns = await learningEngine.getPatterns();
    return NextResponse.json({ success: true, patterns });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Learning memory could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      inspectionId,
      original,
      updated,
      tool = "finding_editor",
      accepted = true,
      confidence,
      notes,
    } = body;

    if (!original || !updated) {
      return NextResponse.json(
        { error: "Missing learning data" },
        { status: 400 },
      );
    }

    const result = await learningEngine.record({
      inspectionId,
      tool,
      aiPrediction: original,
      inspectorResult: updated,
      accepted:
        typeof accepted === "boolean" || accepted === null ? accepted : true,
      confidence:
        Number.isFinite(Number(confidence)) ? Number(confidence) : undefined,
      notes:
        notes ||
        "Inspector changed or acted on an AI result. Store the differences as an inspector preference.",
    });

    if (!result.success) {
      return NextResponse.json(
        { error: "Learning event could not be saved." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("AI Learning API Error:", error);
    return NextResponse.json(
      { error: error.message || "Learning failed" },
      { status: 500 },
    );
  }
}
