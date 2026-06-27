import { confidenceEngine } from "./ConfidenceEngine";

export type VisionImageInput = {
  mimeType: string;
  base64: string;
  label?: string;
};

export type VisionObservation = {
  category: string;
  label: string;
  confidence: number;
  evidence: string[];
};

export type VisionAnalysisResult = {
  imageCount: number;
  detectedObjects: VisionObservation[];
  detectedMaterials: VisionObservation[];
  visibleConditions: VisionObservation[];
  photoQuality: "Excellent" | "Good" | "Fair" | "Poor";
  overallConfidence: number;
  reviewRequired: boolean;
  evidence: string[];
  inspectorGuidance: string[];
};

function containsAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export class VisionBrain {
  analyzeTextClues({
    description,
    imageCount = 1,
  }: {
    description: string;
    imageCount?: number;
  }): VisionAnalysisResult {
    const clean = String(description || "").toLowerCase();

    const detectedObjects: VisionObservation[] = [];
    const detectedMaterials: VisionObservation[] = [];
    const visibleConditions: VisionObservation[] = [];

    if (containsAny(clean, ["panel", "breaker", "receptacle", "outlet", "wire", "gfci", "afci"])) {
      detectedObjects.push({
        category: "Electrical",
        label: "Electrical component",
        confidence: 85,
        evidence: ["Electrical terms detected in AI description or inspector note."],
      });
    }

    if (containsAny(clean, ["furnace", "air conditioner", "condenser", "heat pump", "boiler", "air handler"])) {
      detectedObjects.push({
        category: "HVAC",
        label: "HVAC equipment",
        confidence: 85,
        evidence: ["HVAC equipment terms detected."],
      });
    }

    if (containsAny(clean, ["water heater", "pipe", "drain", "trap", "toilet", "sink", "faucet"])) {
      detectedObjects.push({
        category: "Plumbing",
        label: "Plumbing component",
        confidence: 85,
        evidence: ["Plumbing terms detected."],
      });
    }

    if (containsAny(clean, ["shingle", "flashing", "roof", "chimney", "vent boot", "valley"])) {
      detectedObjects.push({
        category: "Roof",
        label: "Roof component",
        confidence: 85,
        evidence: ["Roofing terms detected."],
      });
    }

    if (containsAny(clean, ["concrete", "block", "brick", "stone", "wood", "vinyl", "asphalt", "metal"])) {
      detectedMaterials.push({
        category: "Material",
        label: "Visible building material",
        confidence: 75,
        evidence: ["Material-related terms detected."],
      });
    }

    if (containsAny(clean, ["crack", "stain", "corrosion", "rust", "leak", "missing", "damaged", "loose", "open", "gap"])) {
      visibleConditions.push({
        category: "Condition",
        label: "Visible reportable condition",
        confidence: 80,
        evidence: ["Defect or condition terms detected."],
      });
    }

    const confidence = confidenceEngine.calculate({
      imageCount,
      detectedFields:
        detectedObjects.length + detectedMaterials.length + visibleConditions.length,
      expectedFields: 5,
      ocrQuality: imageCount > 1 ? "Good" : "Fair",
    });

    const inspectorGuidance: string[] = [];

    if (confidence.overall < 85) {
      inspectorGuidance.push("Review the AI result carefully before saving.");
      inspectorGuidance.push("Add another photo or a short note if the condition is not obvious.");
    }

    if (imageCount === 1) {
      inspectorGuidance.push("Multiple angles improve AI accuracy when documenting defects.");
    }

    return {
      imageCount,
      detectedObjects,
      detectedMaterials,
      visibleConditions,
      photoQuality: confidence.ocrQuality,
      overallConfidence: confidence.overall,
      reviewRequired: confidence.reviewRequired,
      evidence: confidence.evidence,
      inspectorGuidance,
    };
  }
}

export const visionBrain = new VisionBrain();
