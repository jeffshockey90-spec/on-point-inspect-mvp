export type CopilotSeverity = "info" | "warning" | "critical";

export type CopilotIssue = {
  id: string;
  title: string;
  severity: CopilotSeverity;
  section?: string;
  reason: string;
  recommendation: string;
};

export type RelatedFindingCluster = {
  id: string;
  title: string;
  confidence: number;
  findings: Array<{
    id?: string | number;
    title: string;
    section?: string;
    severity?: string;
  }>;
  explanation: string;
  recommendation: string;
};

export type InspectionCopilotResult = {
  score: number;
  confidence: number;
  status: "Monitoring" | "Needs Review" | "Ready";
  completedSystems: string[];
  missingSystems: string[];
  priorityIssues: CopilotIssue[];
  contradictions: CopilotIssue[];
  relatedFindings: RelatedFindingCluster[];
  suggestions: string[];
  answer?: string;
  findingCount: number;
  equipmentCount: number;
  photoCount: number;
};

const CORE_SYSTEMS = [
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

function cleanText(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lowerText(value: any) {
  return cleanText(value).toLowerCase();
}

function allFindingText(finding: any) {
  return [
    finding?.title,
    finding?.section,
    finding?.severity,
    finding?.observation,
    finding?.implication,
    finding?.recommendation,
    finding?.comment,
    finding?.inspector_note,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

function allEquipmentText(item: any) {
  return [
    item?.equipment_type,
    item?.equipmentType,
    item?.manufacturer,
    item?.model,
    item?.serial,
    item?.condition,
    item?.equipment_status,
    item?.inspector_note,
    item?.maintenance_note,
    item?.refrigerant,
    item?.section,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

function normalizeSection(value: any) {
  const clean = cleanText(value);
  if (!clean) return "General";

  const aliases: Record<string, string> = {
    "Basement/Foundation/Crawlspace & Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Basement, Foundation, Crawlspace and Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Attic/Insulation & Ventilation": "Attic, Insulation & Ventilation",
    "Attic, Insulation and Ventilation": "Attic, Insulation & Ventilation",
    "Doors/Windows & Interior": "Doors, Windows & Interior",
    "Doors, Windows and Interior": "Doors, Windows & Interior",
    Appliances: "Built-in Appliances",
    "Built In Appliances": "Built-in Appliances",
  };

  return aliases[clean] || clean;
}

function inferEquipmentSection(item: any) {
  const text = lowerText(allEquipmentText(item));
  const explicit = normalizeSection(item?.section);
  if (explicit !== "General") return explicit;

  if (text.includes("water heater") || text.includes("hot water")) return "Plumbing";
  if (text.includes("panel") || text.includes("breaker") || text.includes("electrical")) return "Electrical";
  if (text.includes("furnace") || text.includes("boiler") || text.includes("air handler") || text.includes("heat pump")) return "Heating";
  if (text.includes("condenser") || text.includes("air conditioner") || text.includes("cooling")) return "Cooling";
  return "General";
}

function hasText(items: any[], terms: string[]) {
  const text = items.map((item) => `${allFindingText(item)} ${allEquipmentText(item)}`).join(" ").toLowerCase();
  return terms.some((term) => text.includes(term));
}

function isReportableSeverity(value: any) {
  const severity = lowerText(value);
  return (
    severity.includes("repair") ||
    severity.includes("safety") ||
    severity.includes("major") ||
    severity.includes("maintenance") ||
    severity.includes("monitor")
  );
}

function issue(
  id: string,
  title: string,
  severity: CopilotSeverity,
  reason: string,
  recommendation: string,
  section?: string
): CopilotIssue {
  return { id, title, severity, section, reason, recommendation };
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function relatedCluster(
  id: string,
  title: string,
  matches: any[],
  explanation: string,
  recommendation: string
): RelatedFindingCluster | null {
  const unique = matches.filter((item, index, arr) =>
    arr.findIndex((other) => String(other?.id ?? other?.title) === String(item?.id ?? item?.title)) === index
  );

  if (unique.length < 2) return null;

  return {
    id,
    title,
    confidence: Math.min(96, 72 + unique.length * 6),
    findings: unique.slice(0, 6).map((finding) => ({
      id: finding?.id,
      title: cleanText(finding?.title || finding?.observation || "Finding"),
      section: normalizeSection(finding?.section),
      severity: cleanText(finding?.severity),
    })),
    explanation,
    recommendation,
  };
}

function buildRelatedFindingClusters(findings: any[]) {
  const normalized = findings.map((finding) => ({
    ...finding,
    _text: lowerText(allFindingText(finding)),
  }));

  const clusters = [
    relatedCluster(
      "roof-attic-ceiling-moisture",
      "Possible roof-to-interior moisture path",
      normalized.filter((finding) =>
        ["roof", "shingle", "flashing", "attic", "stain", "ceiling", "moisture", "leak", "wet insulation"].some((term) => finding._text.includes(term))
      ),
      "The report includes roof/attic/interior moisture language that may represent the same water path across multiple systems.",
      "Review these findings together and consider noting that conditions may be related if the evidence supports it."
    ),
    relatedCluster(
      "grading-foundation-basement-moisture",
      "Possible exterior drainage / foundation moisture relationship",
      normalized.filter((finding) =>
        ["negative grade", "grading", "downspout", "drainage", "foundation", "basement", "crawlspace", "efflorescence", "moisture", "water intrusion"].some((term) => finding._text.includes(term))
      ),
      "Exterior drainage, foundation, and moisture observations may be connected.",
      "Review drainage, grading, foundation, and basement/crawlspace comments for a consistent moisture recommendation."
    ),
    relatedCluster(
      "hvac-age-airflow-comfort",
      "Possible HVAC performance relationship",
      normalized.filter((finding) =>
        ["hvac", "furnace", "heat pump", "air conditioner", "condenser", "air handler", "filter", "airflow", "humidity", "older equipment", "service life"].some((term) => finding._text.includes(term))
      ),
      "HVAC age, airflow, filter, cooling/heating, or comfort-related findings may point to a larger performance concern.",
      "Review HVAC findings together and make sure maintenance, service, and replacement-planning wording is consistent."
    ),
  ].filter(Boolean) as RelatedFindingCluster[];

  return clusters;
}

export class InspectionCopilot {
  analyze({
    inspection,
    findings = [],
    equipment = [],
    photos = [],
    houseMemory,
    question,
  }: {
    inspection?: any;
    findings?: any[];
    equipment?: any[];
    photos?: any[];
    houseMemory?: any;
    question?: string;
  }): InspectionCopilotResult {
    const completed = new Set<string>();
    const priorityIssues: CopilotIssue[] = [];
    const contradictions: CopilotIssue[] = [];
    const suggestions: string[] = [];

    const normalizedFindings = (findings || []).map((finding) => ({
      ...finding,
      section: normalizeSection(finding?.section || finding?.section_name),
    }));

    normalizedFindings.forEach((finding) => {
      if (finding.section && finding.section !== "Inspection Details") completed.add(finding.section);
    });

    (equipment || []).forEach((item) => {
      const section = inferEquipmentSection(item);
      if (section !== "General") completed.add(section);
    });

    if (houseMemory?.facts) {
      houseMemory.facts.forEach((fact: any) => {
        const section = normalizeSection(fact?.system);
        if (section && section !== "General") completed.add(section);
      });
    }

    const missingSystems = CORE_SYSTEMS.filter((system) => !completed.has(system));

    const allItems = [...normalizedFindings, ...(equipment || [])];
    const hasGarage = completed.has("Garage") || hasText(allItems, ["garage door", "overhead door", "auto reverse", "photo eye"]);
    const hasWaterHeater = hasText(allItems, ["water heater", "tpr", "temperature pressure", "relief valve", "discharge pipe"]);
    const hasAttic = completed.has("Attic, Insulation & Ventilation") || hasText(allItems, ["attic", "insulation", "ventilation"]);
    const hasRoof = completed.has("Roof") || hasText(allItems, ["roof", "shingle", "flashing"]);
    const hasElectrical = completed.has("Electrical") || hasText(allItems, ["panel", "breaker", "electrical service"]);

    if (hasGarage && !hasText(allItems, ["auto reverse", "auto-reverse", "reverses", "resistance", "photo eye", "sensor"])) {
      priorityIssues.push(issue(
        "garage-auto-reverse",
        "Garage door auto-reverse not clearly documented",
        "warning",
        "Garage appears to be part of the inspection, but the safety reversal test is not clearly recorded.",
        "Confirm auto-reverse / resistance testing and photo-eye sensor condition, or add a limitation if not tested.",
        "Garage"
      ));
    }

    if (hasWaterHeater && !hasText(allItems, ["tpr", "temperature pressure", "relief valve", "discharge pipe"])) {
      priorityIssues.push(issue(
        "water-heater-tpr",
        "Water heater TPR discharge not clearly documented",
        "warning",
        "A water heater appears to be present, but TPR valve/discharge piping language was not found.",
        "Document the TPR valve/discharge pipe condition or add a limitation if it was not visible.",
        "Plumbing"
      ));
    }

    if (hasAttic && !hasText(allItems, ["insulation depth", "inches deep", "approximately", "r-", "r value", "r-value"])) {
      priorityIssues.push(issue(
        "attic-insulation-depth",
        "Attic insulation depth may be missing",
        "info",
        "Attic/insulation appears documented, but insulation depth or R-value language was not found.",
        "Add insulation depth, approximate R-value, or a limitation if it could not be determined.",
        "Attic, Insulation & Ventilation"
      ));
    }

    if (hasRoof && !hasText(allItems, ["flashing", "valley", "penetration", "boot", "counter flashing", "step flashing"])) {
      priorityIssues.push(issue(
        "roof-flashing",
        "Roof flashing not clearly mentioned",
        "info",
        "Roof findings are present, but flashing observations may not be documented.",
        "Confirm roof penetrations, wall intersections, valleys, and flashing details where visible.",
        "Roof"
      ));
    }

    if (hasElectrical && !hasText(allItems, ["main panel", "service panel", "breaker panel", "amperage", "service size"])) {
      priorityIssues.push(issue(
        "electrical-service-details",
        "Electrical service/panel details may be missing",
        "info",
        "Electrical is documented, but main service/panel details are not clearly detected.",
        "Confirm main panel/service details and add them to the report if applicable.",
        "Electrical"
      ));
    }

    normalizedFindings.forEach((finding) => {
      const severity = lowerText(finding.severity);
      const title = cleanText(finding.title || "Finding");
      const section = normalizeSection(finding.section);

      if (isReportableSeverity(severity)) {
        if (!cleanText(finding.recommendation)) {
          priorityIssues.push(issue(
            `missing-recommendation-${finding.id || title}`,
            `Missing recommendation: ${title}`,
            severity.includes("safety") || severity.includes("major") ? "critical" : "warning",
            "This finding appears reportable but does not include a recommendation.",
            "Add a clear recommendation telling the client what should happen next.",
            section
          ));
        }

        if (!cleanText(finding.implication)) {
          priorityIssues.push(issue(
            `missing-implication-${finding.id || title}`,
            `Missing implication: ${title}`,
            "warning",
            "This finding appears reportable but does not explain why it matters.",
            "Add a plain-language implication so the client understands the concern.",
            section
          ));
        }

        const photoCount = Array.isArray(finding.photos) ? finding.photos.length : 0;
        if (!finding.image_url && photoCount === 0) {
          priorityIssues.push(issue(
            `missing-photo-${finding.id || title}`,
            `No media attached: ${title}`,
            "info",
            "This finding may not have supporting photo/video media attached.",
            "Attach media if available, or leave as-is if the condition did not need a photo.",
            section
          ));
        }
      }
    });

    (equipment || []).forEach((item) => {
      const text = lowerText(allEquipmentText(item));
      const equipmentName = cleanText([item?.manufacturer, item?.equipment_type || item?.equipmentType, item?.model].filter(Boolean).join(" ")) || "Equipment";
      const ageText = cleanText(item?.estimated_age || item?.estimatedAge || "");
      const ageNumber = Number(ageText.replace(/[^0-9.]/g, ""));
      const statusText = lowerText(item?.equipment_status || item?.condition || "");

      if (Number.isFinite(ageNumber) && ageNumber >= 15 && (statusText.includes("excellent") || statusText.includes("operating normally"))) {
        contradictions.push(issue(
          `older-equipment-status-${item?.id || equipmentName}`,
          `Review older equipment status: ${equipmentName}`,
          "warning",
          `This equipment appears older (${ageText}) but is marked with a very positive status. That may be fine, but it should be intentional.`,
          "Consider wording such as operating at time of inspection, monitor due to age, and budget for replacement when appropriate.",
          inferEquipmentSection(item)
        ));
      }

      if (text.includes("r-22") || text.includes("r22")) {
        priorityIssues.push(issue(
          `r22-${item?.id || equipmentName}`,
          `R-22 refrigerant noted: ${equipmentName}`,
          "warning",
          "R-22 equipment may have service/replacement-planning implications.",
          "Confirm the refrigerant note is included in client-facing wording and recommend service/replacement planning as appropriate.",
          inferEquipmentSection(item)
        ));
      }
    });

    const relatedFindings = buildRelatedFindingClusters(normalizedFindings);

    if (missingSystems.length > 0) {
      suggestions.push(`Review missing systems: ${missingSystems.slice(0, 5).join(", ")}.`);
    }

    if (relatedFindings.length > 0) {
      suggestions.push("Review possible related findings so the report tells one consistent story.");
    }

    if (priorityIssues.length === 0 && contradictions.length === 0 && missingSystems.length === 0) {
      suggestions.push("No major copilot concerns detected. Do a final inspector review before publishing.");
    }

    const criticalCount = priorityIssues.filter((item) => item.severity === "critical").length;
    const warningCount = priorityIssues.filter((item) => item.severity === "warning").length + contradictions.length;

    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          100 -
            missingSystems.length * 4 -
            criticalCount * 10 -
            warningCount * 5 -
            relatedFindings.length * 2
        )
      )
    );

    const confidence = Math.max(0, Math.min(99, Math.round(score + Math.min(8, normalizedFindings.length))));
    const status = score >= 90 ? "Ready" : score >= 75 ? "Monitoring" : "Needs Review";

    const result: InspectionCopilotResult = {
      score,
      confidence,
      status,
      completedSystems: Array.from(completed).sort(),
      missingSystems,
      priorityIssues: uniqueById(priorityIssues).slice(0, 12),
      contradictions: uniqueById(contradictions).slice(0, 8),
      relatedFindings: relatedFindings.slice(0, 5),
      suggestions: suggestions.slice(0, 8),
      findingCount: normalizedFindings.length,
      equipmentCount: (equipment || []).length,
      photoCount: (photos || []).length,
    };

    result.answer = this.answerQuestion(question, result);
    return result;
  }

  answerQuestion(question: string | undefined, result: InspectionCopilotResult) {
    const clean = lowerText(question);
    if (!clean) return "Ask the copilot what is missing, what needs review, whether anything appears related, or whether the report looks ready to publish.";

    if (clean.includes("missing") || clean.includes("still needs") || clean.includes("what did i miss")) {
      const parts = [];
      if (result.missingSystems.length) parts.push(`Missing systems: ${result.missingSystems.join(", ")}.`);
      if (result.priorityIssues.length) parts.push(`Top review items: ${result.priorityIssues.slice(0, 5).map((item) => item.title).join("; ")}.`);
      return parts.join("\n\n") || "I do not see any obvious missing systems or required review items from the current saved data.";
    }

    if (clean.includes("contradiction") || clean.includes("conflict")) {
      return result.contradictions.length
        ? result.contradictions.map((item) => `${item.title}: ${item.reason}`).join("\n\n")
        : "I do not see obvious contradictions in the current saved data.";
    }

    if (clean.includes("related") || clean.includes("connect")) {
      return result.relatedFindings.length
        ? result.relatedFindings.map((cluster) => `${cluster.title}: ${cluster.explanation}`).join("\n\n")
        : "I do not see strong cross-system related finding patterns yet.";
    }

    if (clean.includes("ready") || clean.includes("publish")) {
      if (result.status === "Ready") return `This looks close to publish-ready from the copilot checks. Score: ${result.score}/100. Inspector final review still controls.`;
      return `Not fully ready yet. Score: ${result.score}/100. Review: ${[...result.priorityIssues, ...result.contradictions].slice(0, 5).map((item) => item.title).join("; ") || result.missingSystems.join(", ")}.`;
    }

    if (clean.includes("confidence") || clean.includes("score")) {
      return `Current copilot score is ${result.score}/100 with ${result.confidence}% confidence. Deductions come from missing systems, missing finding details, possible contradictions, and related-finding review items.`;
    }

    return `Current status: ${result.status}. Score: ${result.score}/100. Top focus: ${result.priorityIssues[0]?.title || result.contradictions[0]?.title || result.missingSystems[0] || "No major issue detected."}`;
  }
}

export const inspectionCopilot = new InspectionCopilot();
