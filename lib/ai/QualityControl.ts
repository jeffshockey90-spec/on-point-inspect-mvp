export type QualityIssue = {
  level: "info" | "warning" | "error";
  category:
    | "missing_content"
    | "missing_photo"
    | "duplicate"
    | "contradiction"
    | "wording"
    | "safety"
    | "completeness";
  message: string;
  section?: string;
  findingId?: string | number;
};

export type ReportQualityInput = {
  findings?: Array<{
    id?: string | number;
    title?: string | null;
    section?: string | null;
    severity?: string | null;
    observation?: string | null;
    implication?: string | null;
    recommendation?: string | null;
    image_url?: string | null;
  }>;
  equipment?: Array<{
    equipment_type?: string | null;
    manufacturer?: string | null;
    condition?: string | null;
  }>;
};

const CORE_SECTIONS = [
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
];

function clean(value: any) {
  return String(value || "").trim();
}

export class QualityControl {
  reviewReport(input: ReportQualityInput) {
    const findings = input.findings || [];
    const equipment = input.equipment || [];
    const issues: QualityIssue[] = [];

    const sectionsPresent = new Set(
      findings.map((f) => clean(f.section)).filter(Boolean)
    );

    for (const section of CORE_SECTIONS) {
      if (!sectionsPresent.has(section)) {
        issues.push({
          level: "info",
          category: "completeness",
          section,
          message: `${section} has no findings documented. Confirm this section was inspected and no reportable conditions were observed.`,
        });
      }
    }

    for (const finding of findings) {
      const id = finding.id;
      const title = clean(finding.title) || "Untitled finding";

      if (!clean(finding.observation)) {
        issues.push({
          level: "warning",
          category: "missing_content",
          findingId: id,
          section: clean(finding.section),
          message: `"${title}" is missing an observation.`,
        });
      }

      if (!clean(finding.implication)) {
        issues.push({
          level: "warning",
          category: "missing_content",
          findingId: id,
          section: clean(finding.section),
          message: `"${title}" is missing an implication.`,
        });
      }

      if (!clean(finding.recommendation)) {
        issues.push({
          level: "warning",
          category: "missing_content",
          findingId: id,
          section: clean(finding.section),
          message: `"${title}" is missing a recommendation.`,
        });
      }

      const severity = clean(finding.severity).toLowerCase();
      if (
        (severity.includes("safety") || severity.includes("major")) &&
        !clean(finding.image_url)
      ) {
        issues.push({
          level: "warning",
          category: "missing_photo",
          findingId: id,
          section: clean(finding.section),
          message: `"${title}" is marked ${finding.severity} but does not have a main photo attached.`,
        });
      }
    }

    const titleMap = new Map<string, number>();
    for (const finding of findings) {
      const key = clean(finding.title).toLowerCase();
      if (!key) continue;
      titleMap.set(key, (titleMap.get(key) || 0) + 1);
    }

    for (const [title, count] of titleMap.entries()) {
      if (count > 1) {
        issues.push({
          level: "info",
          category: "duplicate",
          message: `Possible duplicate finding title: "${title}" appears ${count} times.`,
        });
      }
    }

    const hasHvacEquipment = equipment.some((item) =>
      clean(item.equipment_type).toLowerCase().match(/furnace|heat pump|air conditioner|condenser|air handler|boiler/)
    );

    if (!hasHvacEquipment) {
      issues.push({
        level: "info",
        category: "completeness",
        section: "Heating",
        message: "No HVAC equipment inventory item was found. Confirm heating/cooling equipment was documented when applicable.",
      });
    }

    const hasWaterHeater = equipment.some((item) =>
      clean(item.equipment_type).toLowerCase().includes("water heater")
    );

    if (!hasWaterHeater) {
      issues.push({
        level: "info",
        category: "completeness",
        section: "Plumbing",
        message: "No water heater inventory item was found. Confirm the water heater was documented when applicable.",
      });
    }

    return {
      score: Math.max(0, 100 - issues.filter((i) => i.level !== "info").length * 8),
      issues,
      passed: issues.filter((i) => i.level === "error").length === 0,
    };
  }
}

export const qualityControl = new QualityControl();
