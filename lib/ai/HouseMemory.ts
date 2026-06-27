export type HouseMemorySystem =
  | "Exterior"
  | "Roof"
  | "Basement, Foundation, Crawlspace & Structure"
  | "Heating"
  | "Cooling"
  | "Plumbing"
  | "Electrical"
  | "Fireplace"
  | "Attic, Insulation & Ventilation"
  | "Doors, Windows & Interior"
  | "Built-in Appliances"
  | "Garage"
  | "General";

export type HouseMemoryFact = {
  system: HouseMemorySystem;
  label: string;
  value: string;
  confidence?: number;
  source?: "photo_ai" | "equipment_ai" | "field_note" | "report_review" | "manual" | "property_lookup";
  evidence?: string[];
  lastUpdated?: string;
};

export type HouseMemorySnapshot = {
  inspectionId: string | number;
  propertyAddress?: string;
  propertyType?: string;
  yearBuilt?: string | number;
  facts: HouseMemoryFact[];
  reminders: string[];
  summary: string;
};

function cleanText(value: any) {
  return String(value || "").trim();
}

function normalizeConfidence(value: any) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 75;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function addFact(
  facts: HouseMemoryFact[],
  nextFact: HouseMemoryFact
) {
  const label = cleanText(nextFact.label);
  const value = cleanText(nextFact.value);

  if (!label || !value) return;

  const existingIndex = facts.findIndex(
    (fact) =>
      fact.system === nextFact.system &&
      fact.label.toLowerCase() === label.toLowerCase()
  );

  const normalizedFact: HouseMemoryFact = {
    ...nextFact,
    label,
    value,
    confidence: normalizeConfidence(nextFact.confidence),
    evidence: Array.isArray(nextFact.evidence)
      ? nextFact.evidence.filter(Boolean).map(cleanText)
      : [],
    lastUpdated: nextFact.lastUpdated || new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    const existing = facts[existingIndex];
    const existingConfidence = normalizeConfidence(existing.confidence);
    const nextConfidence = normalizeConfidence(normalizedFact.confidence);

    if (nextConfidence >= existingConfidence) {
      facts[existingIndex] = {
        ...existing,
        ...normalizedFact,
        evidence: Array.from(
          new Set([...(existing.evidence || []), ...(normalizedFact.evidence || [])])
        ),
      };
    }

    return;
  }

  facts.push(normalizedFact);
}

function getKnownValue(value: any) {
  const clean = cleanText(value);
  const lower = clean.toLowerCase();

  if (
    !clean ||
    [
      "unknown",
      "n/a",
      "na",
      "not visible",
      "not readable",
      "unreadable",
      "unable to determine",
      "unable to confirm",
      "none",
      "null",
      "undefined",
    ].includes(lower)
  ) {
    return "";
  }

  return clean;
}

export class HouseMemory {
  buildFromInspection({
    inspection,
    findings = [],
    equipment = [],
  }: {
    inspection: any;
    findings?: any[];
    equipment?: any[];
  }): HouseMemorySnapshot {
    const facts: HouseMemoryFact[] = [];
    const reminders: string[] = [];

    const inspectionId = inspection?.id || inspection?.inspection_id || "";

    const propertyAddress =
      getKnownValue(inspection?.address) ||
      getKnownValue(inspection?.property_address);

    const propertyType =
      getKnownValue(inspection?.property_type) ||
      getKnownValue(inspection?.style) ||
      getKnownValue(inspection?.property_style);

    const yearBuilt = getKnownValue(inspection?.year_built);

    if (propertyType) {
      addFact(facts, {
        system: "General",
        label: "Property Type / Style",
        value: propertyType,
        confidence: 85,
        source: "property_lookup",
      });
    }

    if (yearBuilt) {
      addFact(facts, {
        system: "General",
        label: "Year Built",
        value: String(yearBuilt),
        confidence: 90,
        source: "property_lookup",
      });
    }

    for (const item of equipment || []) {
      const equipmentType =
        getKnownValue(item.equipment_type) ||
        getKnownValue(item.equipmentType) ||
        "Equipment";

      const manufacturer =
        getKnownValue(item.manufacturer) ||
        getKnownValue(item.brand);

      const model = getKnownValue(item.model);
      const manufactureYear =
        getKnownValue(item.manufacture_year) ||
        getKnownValue(item.manufactureYear);

      const section =
        getKnownValue(item.section) ||
        (equipmentType.toLowerCase().includes("water heater")
          ? "Plumbing"
          : equipmentType.toLowerCase().includes("air conditioner") ||
              equipmentType.toLowerCase().includes("condenser")
            ? "Cooling"
            : equipmentType.toLowerCase().includes("furnace") ||
                equipmentType.toLowerCase().includes("boiler")
              ? "Heating"
              : "General");

      const label = equipmentType;
      const value = [manufacturer, model, manufactureYear ? `(${manufactureYear})` : ""]
        .filter(Boolean)
        .join(" ")
        .trim();

      if (value) {
        addFact(facts, {
          system: section as HouseMemorySystem,
          label,
          value,
          confidence: 88,
          source: "equipment_ai",
          evidence: [
            manufacturer ? `Manufacturer: ${manufacturer}` : "",
            model ? `Model: ${model}` : "",
            manufactureYear ? `Manufacture year: ${manufactureYear}` : "",
          ].filter(Boolean),
        });
      }

      const refrigerant = getKnownValue(item.refrigerant);
      if (refrigerant) {
        addFact(facts, {
          system: "Cooling",
          label: "Refrigerant",
          value: refrigerant,
          confidence: 82,
          source: "equipment_ai",
        });
      }

      const status =
        getKnownValue(item.equipment_status) ||
        getKnownValue(item.equipmentStatus) ||
        getKnownValue(item.condition);

      if (status) {
        addFact(facts, {
          system: section as HouseMemorySystem,
          label: `${equipmentType} Status`,
          value: status,
          confidence: 78,
          source: "equipment_ai",
        });
      }
    }

    for (const finding of findings || []) {
      const section = getKnownValue(finding.section) || "General";
      const title = getKnownValue(finding.title);
      const severity = getKnownValue(finding.severity);
      const observation = getKnownValue(finding.observation);

      if (!title && !observation) continue;

      addFact(facts, {
        system: section as HouseMemorySystem,
        label: title || "Finding",
        value: severity ? `${severity}: ${observation || title}` : observation || title,
        confidence: 80,
        source: "field_note",
        evidence: [observation].filter(Boolean),
      });
    }

    const systemsWithFacts = new Set(facts.map((fact) => fact.system));

    const expectedCoreSystems: HouseMemorySystem[] = [
      "Exterior",
      "Roof",
      "Heating",
      "Cooling",
      "Plumbing",
      "Electrical",
      "Attic, Insulation & Ventilation",
      "Basement, Foundation, Crawlspace & Structure",
    ];

    expectedCoreSystems.forEach((system) => {
      if (!systemsWithFacts.has(system)) {
        reminders.push(`${system}: No major facts documented yet.`);
      }
    });

    const hasWaterHeater = facts.some((fact) =>
      `${fact.label} ${fact.value}`.toLowerCase().includes("water heater")
    );
    if (!hasWaterHeater) {
      reminders.push("Plumbing: Water heater has not been added to House Memory yet.");
    }

    const hasElectricalPanel = facts.some((fact) => {
      const text = `${fact.label} ${fact.value}`.toLowerCase();
      return text.includes("panel") || text.includes("electrical service");
    });
    if (!hasElectricalPanel) {
      reminders.push("Electrical: Main panel/service details have not been added to House Memory yet.");
    }

    const summary = this.createSummary(facts, reminders);

    return {
      inspectionId,
      propertyAddress,
      propertyType,
      yearBuilt,
      facts,
      reminders,
      summary,
    };
  }

  createSummary(facts: HouseMemoryFact[], reminders: string[]) {
    const grouped = facts.reduce((acc: Record<string, HouseMemoryFact[]>, fact) => {
      if (!acc[fact.system]) acc[fact.system] = [];
      acc[fact.system].push(fact);
      return acc;
    }, {});

    const systemLines = Object.entries(grouped)
      .map(([system, items]) => {
        const values = items
          .slice(0, 4)
          .map((item) => `${item.label}: ${item.value}`)
          .join("; ");

        return `${system}: ${values}`;
      })
      .join("\n");

    const reminderLines =
      reminders.length > 0
        ? `\n\nOpen reminders:\n${reminders.slice(0, 8).map((item) => `- ${item}`).join("\n")}`
        : "";

    return `${systemLines || "No house memory facts documented yet."}${reminderLines}`;
  }

  extractFactsFromAIResult({
    source,
    result,
  }: {
    source: HouseMemoryFact["source"];
    result: any;
  }) {
    const facts: HouseMemoryFact[] = [];

    const section = getKnownValue(result?.section) || "General";

    if (getKnownValue(result?.equipmentType)) {
      addFact(facts, {
        system: section as HouseMemorySystem,
        label: getKnownValue(result.equipmentType),
        value: [
          getKnownValue(result.manufacturer),
          getKnownValue(result.model),
          getKnownValue(result.manufactureYear),
        ]
          .filter(Boolean)
          .join(" "),
        confidence: result.confidenceScore || result.confidence || 80,
        source,
      });
    }

    if (getKnownValue(result?.refrigerant)) {
      addFact(facts, {
        system: "Cooling",
        label: "Refrigerant",
        value: getKnownValue(result.refrigerant),
        confidence: result.confidenceScore || result.confidence || 75,
        source,
      });
    }

    if (getKnownValue(result?.title) || getKnownValue(result?.observation)) {
      addFact(facts, {
        system: section as HouseMemorySystem,
        label: getKnownValue(result.title) || "AI Finding",
        value: getKnownValue(result.observation) || getKnownValue(result.title),
        confidence: result.confidence || result.confidenceScore || 75,
        source,
        evidence: Array.isArray(result.evidence) ? result.evidence : [],
      });
    }

    return facts;
  }
}

export const houseMemory = new HouseMemory();
