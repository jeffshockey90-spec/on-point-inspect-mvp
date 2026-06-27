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
      lines.push("", "Equipment Already Identified:");
      lines.push(...context.equipmentFound.map(v => `- ${v}`));
    }

    if (context.previousFindings?.length) {
      lines.push("", "Existing Findings:");
      lines.push(...context.previousFindings.map(v => `- ${v}`));
    }

    if (context.inspectorNotes) {
      lines.push("", `Inspector Notes: ${context.inspectorNotes}`);
    }

    lines.push(
      "",
      "Always remain conservative.",
      "Never invent defects.",
      "Explain uncertainty when confidence is low.",
      "The inspector always has the final decision."
    );

    return lines.join("\n");
  }
}

export const promptEngine = new PromptEngine();
