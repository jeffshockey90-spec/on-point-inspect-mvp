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
    expect(parseEquipmentRedraft("not json", fallback)).toEqual({ ...fallback, relatedTitles: [], limitationRelated: false });
    expect(parseEquipmentRedraft('{"condition":"New"}', fallback)).toEqual({ ...fallback, condition: "New", relatedTitles: [], limitationRelated: false });
  });
});

import { resolveRelatedTitles } from "./equipmentNoteRedraft";
import { defectCandidates } from "./equipmentFindings";

describe("AI-matched related findings", () => {
  const findings = [
    { title: "TPR discharge pipe missing", severity: "Safety Concern", section: "Plumbing" },
    { title: "Leaking sink trap", severity: "Recommended Repair", section: "Plumbing" },
    { title: "Data plate photo", severity: "Informational", section: "Plumbing" },
    { title: "Rusted tank", severity: "Monitor", needs_review: true },
  ];

  it("offers only saved defects to the AI", () => {
    expect(defectCandidates(findings).map((c) => c.title)).toEqual([
      "TPR discharge pipe missing",
      "Leaking sink trap",
    ]);
  });

  it("keeps named findings, adds AI matches that exist, ignores invented titles", () => {
    const candidates = defectCandidates(findings);
    expect(
      resolveRelatedTitles([], candidates, ["tpr discharge pipe missing", "Made up finding"]),
    ).toEqual(["TPR discharge pipe missing"]);
    expect(resolveRelatedTitles([{ title: "Water heater rust" }], candidates, [])).toEqual(["Water heater rust"]);
  });

  it("asks the AI to judge every defect and return related_titles", () => {
    const prompt = buildEquipmentRedraftPrompt({
      item: { equipment_type: "Water Heater" },
      related: [],
      candidates: defectCandidates(findings),
    });
    expect(prompt).toContain('"TPR discharge pipe missing" (Safety Concern, Plumbing)');
    expect(prompt).toContain("related_titles");
  });

  it("parses related_titles", () => {
    const fallback = { condition: "", inspector_note: "", maintenance_note: "" };
    expect(parseEquipmentRedraft('{"related_titles":["A"," "]}', fallback).relatedTitles).toEqual(["A"]);
  });
});

describe("redraft with limitations", () => {
  it("shows the AI the limitations and parses not_fully_evaluated", () => {
    const prompt = buildEquipmentRedraftPrompt({
      item: { equipment_type: "Water Heater" },
      related: [],
      limitations: [{ text: "Water heater not tested — gas off", section: "Plumbing" }],
    });
    expect(prompt).toContain("- Water heater not tested — gas off (Plumbing)");
    expect(prompt).toContain("not_fully_evaluated");
    const fallback = { condition: "", inspector_note: "", maintenance_note: "" };
    expect(parseEquipmentRedraft('{"not_fully_evaluated":true}', fallback).limitationRelated).toBe(true);
  });
});
