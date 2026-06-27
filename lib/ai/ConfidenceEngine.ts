export type ConfidenceResult = {
  overall: number;
  ocrQuality: "Excellent" | "Good" | "Fair" | "Poor";
  reviewRequired: boolean;
  evidence: string[];
  reasoning: string;
};

export type ConfidenceInput = {
  imageCount?: number;
  detectedFields?: number;
  expectedFields?: number;
  conflicts?: string[];
  ocrQuality?: "Excellent" | "Good" | "Fair" | "Poor";
};

export class ConfidenceEngine {
  calculate(input: ConfidenceInput): ConfidenceResult {
    const expected = input.expectedFields ?? 10;
    const detected = input.detectedFields ?? 0;
    let score = Math.round((detected / expected) * 100);

    if ((input.imageCount ?? 1) > 1) score += 5;
    if (input.conflicts?.length) score -= input.conflicts.length * 10;

    score = Math.max(0, Math.min(100, score));

    const ocr = input.ocrQuality ?? "Good";

    const evidence = [
      `${detected}/${expected} expected fields identified`,
      `${input.imageCount ?? 1} image(s) analyzed`,
      `OCR Quality: ${ocr}`,
    ];

    if (input.conflicts?.length) {
      evidence.push(...input.conflicts.map(c => `Conflict: ${c}`));
    }

    return {
      overall: score,
      ocrQuality: ocr,
      reviewRequired: score < 85 || !!input.conflicts?.length,
      evidence,
      reasoning:
        score >= 95
          ? "High confidence based on consistent extracted information."
          : score >= 85
          ? "Good confidence, but inspector review is recommended."
          : "Lower confidence. Verify equipment/photo details before saving."
    };
  }
}

export const confidenceEngine = new ConfidenceEngine();
