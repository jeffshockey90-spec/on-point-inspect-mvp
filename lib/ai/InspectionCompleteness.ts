export type InspectionIssue = {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  reason: string;
  recommendation: string;
};

export type InspectionCompletenessResult = {
  score: number;
  completedSystems: string[];
  missingSystems: string[];
  issues: InspectionIssue[];
};

const CORE_SYSTEMS = [
  "Roof",
  "Exterior",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Garage",
  "Attic, Insulation & Ventilation",
  "Basement, Foundation, Crawlspace & Structure",
];

export class InspectionCompleteness {
  analyze({
    findings = [],
    equipment = [],
    houseMemory,
  }: {
    findings?: any[];
    equipment?: any[];
    houseMemory?: any;
  }): InspectionCompletenessResult {
    const completed = new Set<string>();
    const issues: InspectionIssue[] = [];

    // Systems documented by findings
    for (const finding of findings) {
      const section = String(finding?.section || "").trim();
      if (section) completed.add(section);
    }

    // Systems documented by equipment
    for (const item of equipment) {
      const section = String(item?.section || "").trim();
      if (section) completed.add(section);
    }

    // Systems documented by House Memory
    if (houseMemory?.facts) {
      for (const fact of houseMemory.facts) {
        if (fact.system) completed.add(fact.system);
      }
    }

    const missingSystems = CORE_SYSTEMS.filter(
      (system) => !completed.has(system)
    );

    // Smart reminders
    if (completed.has("Garage")) {
      issues.push({
        id: "garage-auto-reverse",
        title: "Verify garage door auto-reverse",
        severity: "warning",
        reason:
          "Garage documented but auto-reverse test may not be recorded.",
        recommendation:
          "Confirm the door reverses properly when meeting resistance.",
      });
    }

    if (completed.has("Plumbing")) {
      issues.push({
        id: "tpr",
        title: "Verify TPR discharge pipe",
        severity: "warning",
        reason:
          "Water heater safety discharge should be documented when present.",
        recommendation:
          "Confirm TPR valve and discharge piping are properly installed.",
      });
    }

    if (completed.has("Exterior")) {
      issues.push({
        id: "deck",
        title: "Check deck handrails",
        severity: "info",
        reason:
          "Exterior inspection often includes deck safety observations.",
        recommendation:
          "Verify guardrails, graspable handrails, and attachment details.",
      });
    }

    if (completed.has("Roof")) {
      issues.push({
        id: "flashing",
        title: "Roof flashing review",
        severity: "info",
        reason:
          "Roof system documented but flashing observations were not confirmed.",
        recommendation:
          "Verify flashing at penetrations, valleys, and wall intersections.",
      });
    }

    const score = Math.max(
      0,
      Math.round(
        (completed.size / CORE_SYSTEMS.length) * 100 -
          missingSystems.length * 2
      )
    );

    return {
      score,
      completedSystems: [...completed].sort(),
      missingSystems,
      issues,
    };
  }
}

export const inspectionCompleteness = new InspectionCompleteness();