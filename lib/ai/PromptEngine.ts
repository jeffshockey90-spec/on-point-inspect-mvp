export type PromptContext = {
  inspectorName?: string;
  companyName?: string;
  propertyAddress?: string;
  inspectionType?: string;
  houseYear?: number | string;
  houseStyle?: string;
  inspectorNotes?: string;
  previousFindings?: string[];
  equipmentFound?: string[];

  // AI Learning Memory
  learningPatterns?: {
    preferredPhrases?: string[];
    avoidedPhrases?: string[];
    recommendationStyle?: string[];
    severityPreferences?: string[];
    sectionPreferences?: string[];
  };
};

export class PromptEngine {
  buildSystemPrompt(basePrompt: string, context: PromptContext = {}) {
    const lines = [
      basePrompt,
      "",
      "Additional Inspection Context:",
      `Inspector: ${context.inspectorName || "Unknown"}`,
      `Company: ${context.companyName || "Unknown"}`,
      `Inspection Type: ${context.inspectionType || "Unknown"}`,
      `Property: ${context.propertyAddress || "Unknown"}`,
      `Year Built: ${context.houseYear || "Unknown"}`,
      `Style: ${context.houseStyle || "Unknown"}`,
    ];

    if (context.equipmentFound?.length) {
      lines.push(
        "",
        "Equipment Already Identified:"
      );

      lines.push(
        ...context.equipmentFound.map(
          (item) => `- ${item}`
        )
      );
    }

    if (context.previousFindings?.length) {
      lines.push(
        "",
        "Existing Findings:"
      );

      lines.push(
        ...context.previousFindings.map(
          (item) => `- ${item}`
        )
      );
    }

    if (context.inspectorNotes) {
      lines.push(
        "",
        `Inspector Notes: ${context.inspectorNotes}`
      );
    }


    /*
      =============================
      AI STYLE LEARNING MEMORY
      =============================
    */

    const memory = context.learningPatterns;

    if (memory) {
      lines.push(
        "",
        "Inspector Writing Style Memory:",
        "Adapt future responses using these inspector preferences."
      );

      if (memory.preferredPhrases?.length) {
        lines.push(
          "",
          "Preferred wording:"
        );

        lines.push(
          ...memory.preferredPhrases.map(
            (item) => `- ${item}`
          )
        );
      }

      if (memory.avoidedPhrases?.length) {
        lines.push(
          "",
          "Avoid these phrases:"
        );

        lines.push(
          ...memory.avoidedPhrases.map(
            (item) => `- ${item}`
          )
        );
      }

      if (memory.recommendationStyle?.length) {
        lines.push(
          "",
          "Recommendation style:"
        );

        lines.push(
          ...memory.recommendationStyle.map(
            (item) => `- ${item}`
          )
        );
      }

      if (memory.severityPreferences?.length) {
        lines.push(
          "",
          "Severity preferences:"
        );

        lines.push(
          ...memory.severityPreferences.map(
            (item) => `- ${item}`
          )
        );
      }

      if (memory.sectionPreferences?.length) {
        lines.push(
          "",
          "Section routing preferences:"
        );

        lines.push(
          ...memory.sectionPreferences.map(
            (item) => `- ${item}`
          )
        );
      }
    }


    lines.push(
      "",
      "Inspection AI Rules:",
      "- Match the inspector's documented writing style.",
      "- Maintain professional home inspection language.",
      "- Do not exaggerate defects.",
      "- Never invent conditions.",
      "- Explain uncertainty when confidence is low.",
      "- The inspector always has final approval."
    );

    return lines.join("\n");
  }
}

export const promptEngine = new PromptEngine();