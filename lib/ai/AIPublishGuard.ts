export type PublishGuardSeverity = "info" | "warning" | "critical";

export type PublishGuardIssue = {
  id: string;
  title: string;
  severity: PublishGuardSeverity;
  section?: string;
  reason: string;
  recommendation: string;
  blocking?: boolean;
};

export type AIPublishGuardResult = {
  score: number;
  readyToPublish: boolean;
  blocked: boolean;
  recommendation: "Ready" | "Review Recommended" | "Do Not Publish Yet";
  issues: PublishGuardIssue[];
  criticalIssues: PublishGuardIssue[];
  warnings: PublishGuardIssue[];
  suggestions: string[];
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

const LIMITED_ACCESS_TERMS = [
  "limited access",
  "not accessible",
  "inaccessible",
  "unable to access",
  "blocked",
  "stored items",
  "personal belongings",
  "concealed",
  "covered",
  "snow",
  "ice",
  "unsafe access",
  "low clearance",
  "locked",
  "utilities off",
  "not operated",
  "could not be inspected",
];

const WEAK_WORDING_TERMS = [
  "passed inspection",
  "failed inspection",
  "up to code",
  "not up to code",
  "code violation",
  "definitely mold",
  "definitely asbestos",
  "black mold",
  "probably okay",
  "appears fine",
  "looks fine",
  "all good",
  "no issues at all",
];

const SATISFACTORY_TERMS = [
  "satisfactory",
  "acceptable",
  "operating normally",
  "functional",
  "working properly",
  "no significant deficiencies",
  "no specific deficiency",
];

const NOT_TESTED_TERMS = [
  "not tested",
  "not operated",
  "could not test",
  "unable to test",
  "unable to operate",
  "did not operate",
  "utilities off",
  "shut off",
  "disconnected",
];

function cleanText(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lowerText(value: any) {
  return cleanText(value).toLowerCase();
}

function normalizeSection(value: any) {
  const clean = cleanText(value);
  if (!clean) return "General";

  const aliases: Record<string, string> = {
    General: "Inspection Details",
    Safety: "Inspection Details",
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

function findingText(finding: any) {
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

function equipmentText(item: any) {
  return [
    item?.equipment_type,
    item?.equipmentType,
    item?.manufacturer,
    item?.model,
    item?.serial,
    item?.manufacture_year,
    item?.manufactureYear,
    item?.estimated_age,
    item?.estimatedAge,
    item?.condition,
    item?.equipment_status,
    item?.equipmentStatus,
    item?.section,
    item?.refrigerant,
    item?.inspector_note,
    item?.maintenance_note,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

function hasAnyText(items: any[], terms: string[]) {
  const text = items
    .map((item) => `${findingText(item)} ${equipmentText(item)}`)
    .join(" ")
    .toLowerCase();

  return terms.some((term) => text.includes(term));
}

function itemContainsAny(item: any, terms: string[]) {
  const text = `${findingText(item)} ${equipmentText(item)}`.toLowerCase();
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

function isInformationalFinding(finding: any) {
  const section = lowerText(finding?.section);
  const title = lowerText(finding?.title);
  const severity = lowerText(finding?.severity);

  return (
    section === "inspection details" ||
    section === "disclaimers" ||
    title === "in attendance" ||
    title === "occupancy" ||
    title === "style" ||
    title === "temperature" ||
    title === "type of building" ||
    title === "weather conditions" ||
    severity.includes("info") ||
    severity.includes("informational")
  );
}

function issue(
  id: string,
  title: string,
  severity: PublishGuardSeverity,
  reason: string,
  recommendation: string,
  section?: string,
  blocking = false
): PublishGuardIssue {
  return { id, title, severity, reason, recommendation, section, blocking };
}

function uniqueById(items: PublishGuardIssue[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function inferEquipmentSection(item: any) {
  const explicit = normalizeSection(item?.section);
  if (explicit && explicit !== "General") return explicit;

  const text = lowerText(equipmentText(item));

  if (text.includes("water heater") || text.includes("hot water")) return "Plumbing";
  if (text.includes("panel") || text.includes("breaker") || text.includes("electrical")) return "Electrical";
  if (text.includes("furnace") || text.includes("boiler") || text.includes("air handler") || text.includes("heat pump")) return "Heating";
  if (text.includes("condenser") || text.includes("air conditioner") || text.includes("cooling")) return "Cooling";

  return "General";
}

function getFindingIdentityText(finding: any) {
  return cleanText(
    [finding?.section, finding?.title, finding?.observation]
      .filter(Boolean)
      .join(" ")
  )
    .toLowerCase()
    .replace(/\b(the|a|an|and|or|to|of|at|in|on|for|with|by|as|is|was|were|appeared|observed|recommend|recommended|repair|evaluation|qualified|contractor)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTokenSet(text: string) {
  return new Set(
    text
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
  );
}

function similarityScore(a: string, b: string) {
  const aSet = getTokenSet(a);
  const bSet = getTokenSet(b);
  if (aSet.size === 0 || bSet.size === 0) return 0;

  let overlap = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) overlap += 1;
  });

  return overlap / Math.min(aSet.size, bSet.size);
}

function hasUsefulEquipmentIdentity(item: any) {
  return Boolean(
    cleanText(item?.manufacturer) ||
      cleanText(item?.model) ||
      cleanText(item?.serial) ||
      cleanText(item?.manufacture_year || item?.manufactureYear) ||
      cleanText(item?.estimated_age || item?.estimatedAge)
  );
}

function hasPhotoLikeValue(item: any) {
  return Boolean(
    item?.image_url ||
      item?.public_url ||
      item?.photo_url ||
      item?.file_path ||
      item?.signed_image_url ||
      item?.signed_url ||
      (Array.isArray(item?.photos) && item.photos.length > 0)
  );
}

export class AIPublishGuard {
  analyze({
    inspection,
    findings = [],
    equipment = [],
    photos = [],
  }: {
    inspection?: any;
    findings?: any[];
    equipment?: any[];
    photos?: any[];
  }): AIPublishGuardResult {
    const issues: PublishGuardIssue[] = [];
    const suggestions: string[] = [];

    const normalizedFindings = (findings || []).map((finding) => ({
      ...finding,
      section: normalizeSection(finding?.section || finding?.section_name),
    }));

    const completedSystems = new Set<string>();

    normalizedFindings.forEach((finding) => {
      if (finding.section && finding.section !== "Inspection Details") {
        completedSystems.add(finding.section);
      }
    });

    (equipment || []).forEach((item) => {
      const section = inferEquipmentSection(item);
      if (section !== "General") completedSystems.add(section);
    });

    const reportableFindings = normalizedFindings.filter(
      (finding) => !isInformationalFinding(finding) && isReportableSeverity(finding?.severity)
    );

    if (reportableFindings.length === 0) {
      issues.push(
        issue(
          "no-reportable-findings",
          "No reportable findings detected",
          "warning",
          "The report does not appear to contain any reportable defects or maintenance/monitor findings.",
          "Confirm this is intentional before publishing.",
          undefined,
          false
        )
      );
    }

    const missingSystems = CORE_SYSTEMS.filter((system) => !completedSystems.has(system));

    if (missingSystems.length >= 5) {
      issues.push(
        issue(
          "many-missing-systems",
          "Multiple core systems appear missing",
          "critical",
          `${missingSystems.length} core systems do not appear represented in saved findings or equipment data.`,
          "Review the inspection for missing system documentation before publishing.",
          undefined,
          true
        )
      );
    } else if (missingSystems.length > 0) {
      suggestions.push(`Review missing/undocumented systems: ${missingSystems.slice(0, 5).join(", ")}.`);
    }

    const allItems = [...normalizedFindings, ...(equipment || [])];

    const hasGarage = completedSystems.has("Garage") || hasAnyText(allItems, ["garage door", "overhead door", "photo eye"]);
    if (hasGarage && !hasAnyText(allItems, ["auto reverse", "auto-reverse", "reverses", "resistance", "photo eye", "sensor"])) {
      issues.push(
        issue(
          "garage-auto-reverse",
          "Garage auto-reverse not documented",
          "warning",
          "Garage appears to be included, but auto-reverse / safety reversal language was not detected.",
          "Document the auto-reverse test, sensor condition, or a limitation if not tested.",
          "Garage",
          false
        )
      );
    }

    const hasWaterHeater = hasAnyText(allItems, ["water heater", "hot water", "tpr", "temperature pressure", "relief valve"]);
    if (hasWaterHeater && !hasAnyText(allItems, ["tpr", "temperature pressure", "relief valve", "discharge pipe"])) {
      issues.push(
        issue(
          "water-heater-tpr",
          "Water heater TPR discharge not documented",
          "warning",
          "A water heater appears present, but TPR valve/discharge pipe language was not detected.",
          "Document TPR valve/discharge pipe condition or add a limitation if not visible.",
          "Plumbing",
          false
        )
      );
    }

    const hasAttic = completedSystems.has("Attic, Insulation & Ventilation") || hasAnyText(allItems, ["attic", "insulation", "ventilation"]);
    if (hasAttic && !hasAnyText(allItems, ["insulation depth", "inches deep", "r-value", "r value", "approximately"])) {
      issues.push(
        issue(
          "attic-insulation-depth",
          "Attic insulation depth may be missing",
          "info",
          "Attic/insulation appears included, but insulation depth or R-value language was not detected.",
          "Add insulation depth/R-value or a limitation if it could not be determined.",
          "Attic, Insulation & Ventilation"
        )
      );
    }

    reportableFindings.forEach((finding) => {
      const title = cleanText(finding?.title || "Finding");
      const section = normalizeSection(finding?.section);
      const severity = lowerText(finding?.severity);
      const text = lowerText(findingText(finding));

      if (!cleanText(finding?.recommendation)) {
        issues.push(
          issue(
            `missing-recommendation-${finding?.id || title}`,
            `Missing recommendation: ${title}`,
            severity.includes("safety") || severity.includes("major") ? "critical" : "warning",
            "This reportable finding does not include a recommendation.",
            "Add a clear recommendation telling the client what should happen next.",
            section,
            severity.includes("safety") || severity.includes("major")
          )
        );
      }

      if (!cleanText(finding?.implication)) {
        issues.push(
          issue(
            `missing-implication-${finding?.id || title}`,
            `Missing implication: ${title}`,
            "warning",
            "This reportable finding does not explain why the condition matters.",
            "Add a plain-language implication for the client.",
            section,
            false
          )
        );
      }

      const photoCount = Array.isArray(finding?.photos) ? finding.photos.length : 0;
      if (!finding?.image_url && photoCount === 0) {
        issues.push(
          issue(
            `missing-media-${finding?.id || title}`,
            `No media attached: ${title}`,
            "info",
            "This finding may not have supporting photo/video media attached.",
            "Attach media if available, or leave as-is if a photo was not needed.",
            section,
            false
          )
        );
      }

      const weakTerm = WEAK_WORDING_TERMS.find((term) => text.includes(term));
      if (weakTerm) {
        issues.push(
          issue(
            `weak-wording-${finding?.id || title}`,
            `Review wording: ${title}`,
            weakTerm.includes("code violation") || weakTerm.includes("mold") || weakTerm.includes("asbestos") ? "critical" : "warning",
            `The finding contains wording that may be too absolute or risky: "${weakTerm}".`,
            "Revise the language to stay factual, non-alarmist, and inspection-scope appropriate.",
            section,
            weakTerm.includes("definitely") || weakTerm.includes("code violation")
          )
        );
      }

      if (
        itemContainsAny(finding, SATISFACTORY_TERMS) &&
        itemContainsAny(finding, NOT_TESTED_TERMS)
      ) {
        issues.push(
          issue(
            `contradiction-tested-${finding?.id || title}`,
            `Possible contradiction: ${title}`,
            "critical",
            "This finding appears to include both satisfactory/functional wording and not-tested/not-operated wording.",
            "Clarify whether the component was operated, limited, or functioning at the time of inspection.",
            section,
            true
          )
        );
      }
    });

    for (let i = 0; i < reportableFindings.length; i += 1) {
      for (let j = i + 1; j < reportableFindings.length; j += 1) {
        const first = reportableFindings[i];
        const second = reportableFindings[j];
        const firstSection = normalizeSection(first?.section);
        const secondSection = normalizeSection(second?.section);
        if (firstSection !== secondSection) continue;

        const firstIdentity = getFindingIdentityText(first);
        const secondIdentity = getFindingIdentityText(second);
        const score = similarityScore(firstIdentity, secondIdentity);

        if (score >= 0.72) {
          const firstTitle = cleanText(first?.title || "Finding");
          const secondTitle = cleanText(second?.title || "Finding");
          issues.push(
            issue(
              `possible-duplicate-${first?.id || i}-${second?.id || j}`,
              `Possible duplicate findings in ${firstSection}`,
              "warning",
              `"${firstTitle}" and "${secondTitle}" appear to describe a very similar condition.`,
              "Review both findings and combine, delete, or differentiate them if needed.",
              firstSection,
              false
            )
          );
        }
      }
    }

    CORE_SYSTEMS.forEach((system) => {
      const sectionItems = allItems.filter((item) => {
        const section = "equipment_type" in item || "equipmentType" in item ? inferEquipmentSection(item) : normalizeSection(item?.section);
        return section === system;
      });

      if (sectionItems.length === 0) return;
      const sectionHasLimitationLanguage = hasAnyText(sectionItems, LIMITED_ACCESS_TERMS);
      const sectionSuggestsLimitedAccess = sectionItems.some((item) => itemContainsAny(item, LIMITED_ACCESS_TERMS));

      if (sectionSuggestsLimitedAccess && !sectionHasLimitationLanguage) {
        issues.push(
          issue(
            `limitation-review-${system}`,
            `Limitation may need review: ${system}`,
            "warning",
            "This section may include access or visibility limitations, but clear limitation wording was not detected.",
            "Confirm the limitation is documented in the section limitations or finding language before publishing.",
            system,
            false
          )
        );
      }
    });

    const inspectionText = lowerText(
      [
        inspection?.summary,
        inspection?.notes,
        inspection?.report_summary,
        inspection?.executive_summary,
        inspection?.status,
        inspection?.overall_condition,
      ]
        .filter(Boolean)
        .join(" ")
    );

    CORE_SYSTEMS.forEach((system) => {
      const sectionItems = allItems.filter((item) => {
        const section = "equipment_type" in item || "equipmentType" in item ? inferEquipmentSection(item) : normalizeSection(item?.section);
        return section === system;
      });
      const sectionText = lowerText(sectionItems.map((item) => `${findingText(item)} ${equipmentText(item)}`).join(" "));

      const systemWasCalledGood =
        inspectionText.includes(`${system.toLowerCase()} satisfactory`) ||
        inspectionText.includes(`${system.toLowerCase()} acceptable`) ||
        sectionText.includes("satisfactory") ||
        sectionText.includes("operating normally");

      const systemWasNotTested =
        sectionText.includes("not tested") ||
        sectionText.includes("not operated") ||
        sectionText.includes("unable to test") ||
        sectionText.includes("unable to operate") ||
        sectionText.includes("utilities off");

      if (sectionItems.length > 0 && systemWasCalledGood && systemWasNotTested) {
        issues.push(
          issue(
            `section-contradiction-${system}`,
            `Possible section contradiction: ${system}`,
            "critical",
            `${system} appears to include both satisfactory/operating language and not-tested/not-operated limitation language.`,
            "Clarify the section wording before publishing so the report does not conflict with itself.",
            system,
            true
          )
        );
      }
    });

    (equipment || []).forEach((item) => {
      const text = lowerText(equipmentText(item));
      const name =
        cleanText([item?.manufacturer, item?.equipment_type || item?.equipmentType, item?.model].filter(Boolean).join(" ")) ||
        "Equipment";
      const ageText = cleanText(item?.estimated_age || item?.estimatedAge || "");
      const ageNumber = Number(ageText.replace(/[^0-9.]/g, ""));
      const status = lowerText(item?.equipment_status || item?.equipmentStatus || item?.condition);
      const section = inferEquipmentSection(item);

      if (Number.isFinite(ageNumber) && ageNumber >= 15 && (status.includes("excellent") || status.includes("operating normally"))) {
        issues.push(
          issue(
            `older-equipment-positive-status-${item?.id || name}`,
            `Review older equipment wording: ${name}`,
            "warning",
            `Equipment appears older (${ageText}) but has very positive status wording.`,
            "Confirm this is intentional. Consider wording such as operating at time of inspection, monitor due to age, and budget for future replacement when appropriate.",
            section,
            false
          )
        );
      }

      if (text.includes("r-22") || text.includes("r22")) {
        issues.push(
          issue(
            `r22-${item?.id || name}`,
            `R-22 refrigerant noted: ${name}`,
            "warning",
            "R-22 refrigerant may have service/replacement-planning implications.",
            "Confirm client-facing language includes service/replacement planning as appropriate.",
            section,
            false
          )
        );
      }

      if (!hasUsefulEquipmentIdentity(item)) {
        issues.push(
          issue(
            `missing-equipment-identity-${item?.id || name}`,
            `Equipment identity may be incomplete: ${name}`,
            "info",
            "Equipment was saved but manufacturer/model/serial/age information may be incomplete.",
            "Confirm whether a data plate photo or equipment identity note should be added before publishing.",
            section,
            false
          )
        );
      }

      if (!hasPhotoLikeValue(item)) {
        issues.push(
          issue(
            `missing-equipment-photo-${item?.id || name}`,
            `Equipment photo may be missing: ${name}`,
            "info",
            "Equipment was saved without a clear attached image value.",
            "Attach an equipment/data plate photo if available, or leave as-is if intentionally omitted.",
            section,
            false
          )
        );
      }
    });

    const uniqueIssues = uniqueById(issues);
    const criticalIssues = uniqueIssues.filter((item) => item.severity === "critical");
    const warnings = uniqueIssues.filter((item) => item.severity === "warning");

    const score = Math.max(
      0,
      Math.min(
        100,
        100 -
          criticalIssues.length * 18 -
          warnings.length * 8 -
          uniqueIssues.filter((item) => item.severity === "info").length * 3 -
          Math.min(missingSystems.length * 2, 16)
      )
    );

    const blocked = criticalIssues.some((item) => item.blocking) || score < 70;
    const readyToPublish = !blocked && score >= 85 && warnings.length === 0;

    const recommendation: AIPublishGuardResult["recommendation"] = blocked
      ? "Do Not Publish Yet"
      : readyToPublish
        ? "Ready"
        : "Review Recommended";

    if (uniqueIssues.length === 0) {
      suggestions.push("No major publish guard concerns detected. Inspector final review still applies.");
    }

    if (criticalIssues.length > 0) {
      suggestions.push("Resolve critical publish guard items before sending this report to the client.");
    } else if (warnings.length > 0) {
      suggestions.push("Review warning items before publishing, especially missing recommendations, duplicate findings, and contradictory wording.");
    }

    return {
      score,
      readyToPublish,
      blocked,
      recommendation,
      issues: uniqueIssues,
      criticalIssues,
      warnings,
      suggestions,
      findingCount: normalizedFindings.length,
      equipmentCount: (equipment || []).length,
      photoCount: (photos || []).length,
    };
  }
}

export const aiPublishGuard = new AIPublishGuard();
