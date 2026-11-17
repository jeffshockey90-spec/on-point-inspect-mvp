import { describe, expect, it } from "vitest";
import { buildEquipmentRedraftPrompt, parseEquipmentRedraft } from "./equipmentNoteRedraft";

describe("equipment note redraft", () => {
  it("tells the AI about written-up defects and the cautious-wording rules", () => {
    const prompt = buildEquipmentRedraftPrompt({
      item: { equipment_type: "Water Heater", manufacturer: "Rheem", model: "Unknown", condition: "No specific deficiency noted" },
      related: [{ title: "TPR discharge pipe missing", severity: "Safety Concern" }],
      instruction: "mention the pipe",
    });
    expect(prompt).toContain("TPR discharge pipe missing (Safety Concern)");
    expect(prompt).toContain("never \"no deficiency noted\"");
    expect(prompt).toContain("Never say the equipment WILL fail");
    expect(prompt).not.toContain("Model: Unknown");
    expect(prompt).toContain("mention the pipe");
  });

  it("keeps the current notes when the AI returns nothing usable", () => {
    const fallback = { condition: "a", inspector_note: "b", maintenance_note: "c" };
    expect(parseEquipmentRedraft("not json", fallback)).toEqual(fallback);
    expect(parseEquipmentRedraft('{"condition":"New"}', fallback)).toEqual({ ...fallback, condition: "New" });
  });
});
