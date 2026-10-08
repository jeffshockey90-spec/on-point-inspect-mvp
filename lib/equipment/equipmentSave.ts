// Pure EquipmentResult → save-payload mapping, extracted from app/field/page.tsx
// so BOTH the field tool's synchronous save (saveEquipmentDurable) AND the
// live-camera async background-draft flush produce byte-for-byte identical
// equipment_inventory + derived-finding payloads. No React / page deps — pure
// string/shape helpers only. See buildEquipmentSavePayload at the bottom.

export type EquipmentResult = {
  equipmentType?: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  manufactureYear?: string | number;
  estimatedAge?: string | number;
  expectedServiceLife?: string;
  maintenanceSchedule?: string;
  recallAwareness?: string;
  knownFailurePatterns?: string[];
  replacementCostEstimate?: string;
  lifeExpectancyPercent?: number;
  estimatedSEER?: string;
  estimatedAFUE?: string;
  estimatedBTU?: string;
  equipmentCategory?: string;
  maintenanceLevel?: string;
  equipmentStatus?: string;
  efficiency?: string;
  capacity?: string;
  fuelType?: string;
  refrigerant?: string;
  condition?: string;
  estimatedLifeRemaining?: string;
  clientSummary?: string;
  section?: string;
  severity?: string;
  observation?: string;
  implication?: string;
  recommendation?: string;
  intelligenceFlags?: {
    category?: string;
    r22Detected?: boolean;
    problemPanelDetected?: boolean;
    problemPanelType?: string | null;
    ageBasedSeverityApplied?: boolean;
  };
  error?: string;
  raw?: string;
};

export function isKnownEquipmentValue(value: any) {
  const clean = String(value ?? "").trim();
  const lower = clean.toLowerCase();

  if (!clean) return false;

  return ![
    "unknown",
    "n/a",
    "na",
    "not available",
    "not visible",
    "not readable",
    "unreadable",
    "unable to determine",
    "unable to confirm",
    "cannot determine",
    "not determined",
    "none",
    "null",
    "undefined",
  ].includes(lower);
}

export function cleanEquipmentValue(value: any) {
  return isKnownEquipmentValue(value) ? String(value).trim() : "";
}

export function meaningfulEquipmentValue(value: any) {
  return cleanEquipmentValue(value);
}

export function shouldCreateEquipmentFinding(result: EquipmentResult) {
  const severity = String(result.severity || "").toLowerCase();
  const condition = String(result.condition || "").toLowerCase();

  if (result.intelligenceFlags?.problemPanelDetected) return true;
  if (result.intelligenceFlags?.r22Detected) return true;

  if (
    severity.includes("monitor") ||
    severity.includes("maintenance") ||
    severity.includes("repair") ||
    severity.includes("safety") ||
    severity.includes("major")
  ) {
    return true;
  }

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("beyond") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("end of typical service life")
  ) {
    return true;
  }

  return false;
}

export function cleanServiceLifeCondition(value: any) {
  const clean = String(value || "").trim();
  const lower = clean.toLowerCase();

  if (!clean) return "No specific deficiency noted";

  if (
    lower.includes("typical service life remaining") ||
    lower.includes("service life remaining") ||
    lower.includes("life remaining")
  ) {
    return "No specific deficiency noted";
  }

  if (
    lower.includes("near end") ||
    lower.includes("end of typical service life") ||
    lower.includes("beyond")
  ) {
    return "Older equipment. Monitor and budget for replacement as needed.";
  }

  return clean;
}

export function isWaterHeaterEquipment(result: EquipmentResult) {
  const text = [
    result.equipmentType,
    result.equipmentCategory,
    result.manufacturer,
    result.model,
    result.section,
    result.clientSummary,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return (
    text.includes("water heater") ||
    text.includes("storage tank water heater") ||
    text.includes("tankless") ||
    text.includes("hot water")
  );
}

export function isHvacEquipment(result: EquipmentResult) {
  const text = [
    result.equipmentType,
    result.equipmentCategory,
    result.section,
    result.clientSummary,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return (
    text.includes("air handler") ||
    text.includes("furnace") ||
    text.includes("heat pump") ||
    text.includes("condenser") ||
    text.includes("air conditioner") ||
    text.includes("cooling") ||
    text.includes("heating")
  );
}

export function isElectricalPanelEquipment(result: EquipmentResult) {
  const text = [
    result.equipmentType,
    result.equipmentCategory,
    result.section,
    result.clientSummary,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return (
    text.includes("electrical panel") ||
    text.includes("breaker panel") ||
    text.includes("panelboard") ||
    text.includes("service panel")
  );
}

export function stripMaintenanceLanguageFromInspectorNote(value: any) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  return clean
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const lower = sentence.toLowerCase();
      return !(
        lower.includes("routine maintenance") ||
        lower.includes("regular maintenance") ||
        lower.includes("maintenance is recommended") ||
        lower.includes("recommend maintenance") ||
        lower.includes("servicing is recommended") ||
        lower.includes("service is recommended")
      );
    })
    .join(" ")
    .trim();
}

export function getEquipmentStatusLabel(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const severity = String(result.severity || "").toLowerCase();
  const maintenance = String(result.maintenanceLevel || "").toLowerCase();
  const explicit = meaningfulEquipmentValue(result.equipmentStatus);

  if (result.intelligenceFlags?.problemPanelDetected) {
    return "⚠ Specialist Evaluation Recommended";
  }

  if (result.intelligenceFlags?.r22Detected) {
    return "⚠ Service / Replacement Planning Recommended";
  }

  if (condition.includes("failed") || condition.includes("not operating")) {
    return "⚠ Service Recommended";
  }

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    return "⚠ Monitor Due To Age";
  }

  if (severity.includes("major") || severity.includes("safety")) {
    return "⚠ Specialist Evaluation Recommended";
  }

  if (
    condition.includes("service") ||
    condition.includes("repair") ||
    severity.includes("maintenance")
  ) {
    return "⚠ Service Recommended";
  }

  if (maintenance.includes("elevated")) {
    return "⚠ Monitor";
  }

  if (explicit) {
    const lowerExplicit = explicit.toLowerCase();

    if (
      lowerExplicit.includes("older equipment") ||
      lowerExplicit.includes("monitor")
    ) {
      return "⚠ Monitor Due To Age";
    }

    if (
      lowerExplicit.includes("no specific") ||
      lowerExplicit.includes("operating normally")
    ) {
      return "✓ No Specific Deficiency Noted";
    }

    return explicit;
  }

  return "✓ No Specific Deficiency Noted";
}

export function getAiInspectorNote(result: EquipmentResult, optionalAiNote = "") {
  const cleanOptionalAiNote = String(optionalAiNote || "").trim();

  const equipmentType = meaningfulEquipmentValue(result.equipmentType);
  const manufacturer = meaningfulEquipmentValue(result.manufacturer);
  const model = meaningfulEquipmentValue(result.model);
  const manufactureYear = meaningfulEquipmentValue(result.manufactureYear);
  const refrigerant = meaningfulEquipmentValue(result.refrigerant);
  const capacity = meaningfulEquipmentValue(
    result.capacity || result.estimatedBTU,
  );
  const fuelType = meaningfulEquipmentValue(result.fuelType);
  const condition = meaningfulEquipmentValue(
    cleanServiceLifeCondition(result.condition),
  );

  const sentences: string[] = [];

  if (cleanOptionalAiNote) {
    sentences.push(`Inspector note: ${cleanOptionalAiNote}.`);
  }

  const equipmentName = [manufacturer, equipmentType]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (equipmentName) {
    sentences.push(`${equipmentName}.`);
  } else {
    sentences.push("Equipment data plate was documented.");
  }

  if (model && manufactureYear) {
    sentences.push(`Model ${model} manufactured in ${manufactureYear}.`);
  } else if (model) {
    sentences.push(`Model ${model}.`);
  } else if (manufactureYear) {
    sentences.push(`Manufactured in ${manufactureYear}.`);
  }

  const detailParts: string[] = [];

  if (capacity) {
    const capacityText = capacity
      .replace(/(\d+)\s*gallons?/i, "$1-gallon")
      .replace(/\s+capacity$/i, "");
    detailParts.push(capacityText);
  }

  if (fuelType) {
    detailParts.push(`${fuelType.toLowerCase()} unit`);
  }

  if (refrigerant && isHvacEquipment(result)) {
    detailParts.push(`${refrigerant} refrigerant`);
  }

  if (detailParts.length > 0) {
    sentences.push(detailParts.join(" ").replace(/\s+/g, " ").trim() + ".");
  }

  if (
    condition &&
    condition.toLowerCase() !== "no specific deficiency noted" &&
    !condition.toLowerCase().includes("industry estimate")
  ) {
    const lowerCondition = condition.toLowerCase();

    if (
      lowerCondition.includes("older equipment") ||
      lowerCondition.includes("monitor") ||
      lowerCondition.includes("budget")
    ) {
      sentences.push(
        "Older equipment. The unit was operating at the time of inspection. Monitor performance and budget for future replacement as part of normal ownership planning.",
      );
    } else {
      sentences.push(condition.endsWith(".") ? condition : `${condition}.`);
    }
  } else {
    sentences.push(
      "No significant deficiencies were observed at the time of inspection.",
    );
  }

  return sentences
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function getAiMaintenanceNote(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const remaining = String(result.estimatedLifeRemaining || "").toLowerCase();

  if (isWaterHeaterEquipment(result)) {
    return "Recommend routine water heater maintenance in accordance with manufacturer recommendations.";
  }

  if (isElectricalPanelEquipment(result)) {
    return "Recommend periodic evaluation and maintenance by a qualified electrical contractor as needed.";
  }

  if (isHvacEquipment(result)) {
    if (
      condition.includes("near end") ||
      condition.includes("beyond") ||
      condition.includes("end of typical") ||
      remaining.includes("beyond") ||
      remaining.includes("0-")
    ) {
      return "Recommend routine service by a qualified HVAC contractor and budgeting for future replacement due to age and typical service-life considerations.";
    }

    return "Recommend regular HVAC servicing and filter maintenance in accordance with manufacturer recommendations.";
  }

  return "Recommend routine maintenance in accordance with manufacturer recommendations.";
}

export function getFindingTitlePrefix(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const severity = String(result.severity || "").toLowerCase();

  if (condition.includes("unsafe") || severity.includes("safety")) {
    return "Safety Concern";
  }

  if (condition.includes("failed") || condition.includes("not operating")) {
    return "Defective";
  }

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    return "Older Equipment";
  }

  return "";
}

export function getCalmFindingObservation(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const observation = String(result.observation || "").trim();

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    if (
      !observation ||
      observation.toLowerCase().includes("no visible leaks") ||
      observation.toLowerCase().includes("no visible damage") ||
      observation.toLowerCase().includes("no specific") ||
      observation.toLowerCase().includes("operational")
    ) {
      return "Equipment appeared functional at the time of inspection with no significant visible deficiencies noted.";
    }
  }

  return (
    observation || "Equipment condition was documented during the inspection."
  );
}

export function getCalmFindingImplication(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const implication = String(result.implication || "").trim();

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    return "The equipment is older and may require increased maintenance over time. While functional at the time of inspection, budgeting for eventual replacement is prudent.";
  }

  return (
    implication ||
    "Deferred maintenance or component wear may affect reliable operation over time."
  );
}

export function getCalmFindingRecommendation(result: EquipmentResult) {
  const condition = String(result.condition || "").toLowerCase();
  const severity = String(result.severity || "").toLowerCase();
  const recommendation = String(result.recommendation || "").trim();

  if (
    condition.includes("failed") ||
    condition.includes("not operating") ||
    condition.includes("unsafe") ||
    severity.includes("safety") ||
    severity.includes("major")
  ) {
    return (
      recommendation ||
      "Further evaluation, repair, or replacement is recommended by a qualified contractor."
    );
  }

  if (
    condition.includes("older equipment") ||
    condition.includes("near end") ||
    condition.includes("service life") ||
    condition.includes("budget for replacement") ||
    condition.includes("beyond")
  ) {
    return "Continue routine maintenance and monitor performance. Budgeting for future replacement should be anticipated as the equipment continues to age.";
  }

  return (
    recommendation ||
    "Routine maintenance is recommended in accordance with manufacturer guidelines."
  );
}

// The single mapping EquipmentResult → the offline-queue equipment payload,
// identical to what app/field/page.tsx saveEquipmentDurable built inline. Both
// the field tool and the live-camera async flush call this so they can't drift.
export type EquipmentSavePayload = {
  inventory: Record<string, any>;
  inventory_base: Record<string, any>;
  create_finding: boolean;
  finding: Record<string, any> | null;
};

export function buildEquipmentSavePayload(
  er: EquipmentResult,
  note: string,
  inspectionId: string | number,
): EquipmentSavePayload {
  const baseInventoryPayload = {
    inspection_id: Number(inspectionId),
    equipment_type: cleanEquipmentValue(er.equipmentType),
    manufacturer: cleanEquipmentValue(er.manufacturer),
    model: cleanEquipmentValue(er.model),
    serial: cleanEquipmentValue(er.serial),
    manufacture_year: cleanEquipmentValue(er.manufactureYear),
    estimated_age: cleanEquipmentValue(er.estimatedAge),
    expected_service_life: cleanEquipmentValue(er.expectedServiceLife),
    estimated_life_remaining: "",
    refrigerant: cleanEquipmentValue(er.refrigerant),
    condition: meaningfulEquipmentValue(cleanServiceLifeCondition(er.condition)),
    inspector_note: getAiInspectorNote(er, note),
    maintenance_note: getAiMaintenanceNote(er),
    equipment_status: getEquipmentStatusLabel(er),
  };

  const enhancedInventoryPayload = {
    ...baseInventoryPayload,
    maintenance_schedule: cleanEquipmentValue(er.maintenanceSchedule) || null,
    recall_awareness: cleanEquipmentValue(er.recallAwareness) || null,
    known_failure_patterns: Array.isArray(er.knownFailurePatterns)
      ? er.knownFailurePatterns
      : [],
    replacement_cost_estimate:
      cleanEquipmentValue(er.replacementCostEstimate) || null,
    life_expectancy_percent: Number(er.lifeExpectancyPercent) || null,
  };

  const createFinding = shouldCreateEquipmentFinding(er);
  let findingPayload: Record<string, any> | null = null;

  if (createFinding) {
    let equipmentTitle = `${cleanEquipmentValue(er.manufacturer) || "Equipment"} ${
      cleanEquipmentValue(er.equipmentType) || "Finding"
    }`.trim();
    const titlePrefix = getFindingTitlePrefix(er);
    if (
      titlePrefix &&
      !equipmentTitle.toLowerCase().startsWith(titlePrefix.toLowerCase())
    ) {
      equipmentTitle = `${titlePrefix} – ${equipmentTitle}`;
    }

    findingPayload = {
      section: er.section || "Heating",
      severity:
        titlePrefix === "Older Equipment"
          ? "Monitor"
          : er.severity || "Informational",
      title: equipmentTitle,
      observation: getCalmFindingObservation(er),
      implication: getCalmFindingImplication(er),
      recommendation: getCalmFindingRecommendation(er),
    };
  }

  return {
    inventory: enhancedInventoryPayload,
    inventory_base: baseInventoryPayload,
    create_finding: createFinding,
    finding: findingPayload,
  };
}
