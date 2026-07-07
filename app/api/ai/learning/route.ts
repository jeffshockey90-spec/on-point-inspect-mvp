import { NextResponse } from "next/server";
import { learningEngine } from "../../../../lib/ai/LearningEngine";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      inspectionId,
      original,
      updated,
      tool = "finding_editor",
    } = body;

    if (!original || !updated) {
      return NextResponse.json(
        { error: "Missing learning data" },
        { status: 400 }
      );
    }

    await learningEngine.record({
      inspectionId,
      tool,
      aiPrediction: original,
      inspectorResult: updated,
      accepted: true,
      notes:
        "Inspector edited AI generated finding. Store differences as preferred inspection style.",
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("AI Learning API Error:", error);

    return NextResponse.json(
      {
        error: error.message || "Learning failed",
      },
      { status: 500 }
    );
  }
}