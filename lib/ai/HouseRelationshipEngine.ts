export type RelationshipSeverity = "info" | "monitor" | "concern" | "critical";

export type HouseRelationshipFinding = {
  id?: string | number;
  title: string;
  section?: string;
  severity?: string;
  observation?: string;
};

export type HouseRelationship = {
  id: string;
  title: string;
  category:
    | "moisture"
    | "drainage"
    | "hvac"
    | "electrical"
    | "safety"
    | "structure"
    | "maintenance";
  severity: RelationshipSeverity;
  confidence: number;
  findings: HouseRelationshipFinding[];
  explanation: string;
  recommendation: string;
  inspectorNote: string;
};

export type HouseRelationshipResult = {
  relationshipCount: number;
  highestConfidence: number;
  relationships: HouseRelationship[];
  summary: string;
  suggestions: string[];
};

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
    finding?.client_comment,
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

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function mapFinding(finding: any): HouseRelationshipFinding {
  return {
    id: finding?.id,
    title: cleanText(finding?.title || finding?.observation || "Finding"),
    section: normalizeSection(finding?.section || finding?.section_name),
    severity: cleanText(finding?.severity),
    observation: cleanText(finding?.observation),
  };
}

function uniqueFindings(findings: any[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = String(finding?.id || `${finding?.section}-${finding?.title}-${finding?.observation}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRelationship({
  id,
  title,
  category,
  severity,
  findings,
  explanation,
  recommendation,
  inspectorNote,
  baseConfidence = 70,
}: {
  id: string;
  title: string;
  category: HouseRelationship["category"];
  severity: RelationshipSeverity;
  findings: any[];
  explanation: string;
  recommendation: string;
  inspectorNote: string;
  baseConfidence?: number;
}): HouseRelationship | null {
  const unique = uniqueFindings(findings);

  if (unique.length < 2) return null;

  const sectionCount = new Set(
    unique.map((finding) => normalizeSection(finding?.section || finding?.section_name))
  ).size;

  const confidence = Math.min(
    98,
    Math.round(baseConfidence + unique.length * 5 + sectionCount * 4)
  );

  return {
    id,
    title,
    category,
    severity,
    confidence,
    findings: unique.slice(0, 8).map(mapFinding),
    explanation,
    recommendation,
    inspectorNote,
  };
}

function scoreMoisturePath(finding: any) {
  const text = lowerText(findingText(finding));
  let score = 0;

  if (hasAny(text, ["roof", "shingle", "flashing", "boot", "valley", "chimney"])) score += 2;
  if (hasAny(text, ["attic", "insulation", "rafter", "truss", "sheathing"])) score += 2;
  if (hasAny(text, ["ceiling", "wall", "drywall", "interior", "stain"])) score += 2;
  if (hasAny(text, ["moisture", "wet", "leak", "water", "stain", "active", "elevated"])) score += 3;

  return score;
}

function scoreDrainageFoundation(finding: any) {
  const text = lowerText(findingText(finding));
  let score = 0;

  if (hasAny(text, ["negative grade", "grading", "downspout", "gutter", "drainage", "slope"])) score += 3;
  if (hasAny(text, ["foundation", "basement", "crawlspace", "slab", "structure"])) score += 2;
  if (hasAny(text, ["moisture", "water intrusion", "efflorescence", "damp", "wet", "seepage"])) score += 3;
  if (hasAny(text, ["crack", "settlement", "movement"])) score += 1;

  return score;
}

function scoreHvacPerformance(item: any) {
  const text = lowerText(`${findingText(item)} ${equipmentText(item)}`);
  let score = 0;

  if (hasAny(text, ["hvac", "furnace", "heat pump", "air handler", "condenser", "air conditioner", "cooling", "heating"])) score += 2;
  if (hasAny(text, ["older", "service life", "near end", "budget", "replacement", "r22", "r-22"])) score += 3;
  if (hasAny(text, ["dirty filter", "filter", "airflow", "weak", "temperature split", "humidity", "condensation"])) score += 2;
  if (hasAny(text, ["service", "maintenance", "repair", "not operating"])) score += 2;

  return score;
}

function scoreElectricalSafety(finding: any) {
  const text = lowerText(findingText(finding));
  let score = 0;

  if (hasAny(text, ["electrical", "panel", "breaker", "service", "sub panel", "subpanel"])) score += 2;
  if (hasAny(text, ["double tap", "double tapped", "neutral", "ground", "bonding", "open ground", "reverse polarity", "gfci"])) score += 3;
  if (hasAny(text, ["safety", "hazard", "fire", "shock", "electrician"])) score += 2;

  return score;
}

export class HouseRelationshipEngine {
  analyze({
    inspection,
    findings = [],
    equipment = [],
    houseMemory,
  }: {
    inspection?: any;
    findings?: any[];
    equipment?: any[];
    houseMemory?: any;
  }): HouseRelationshipResult {
    const normalizedFindings = (findings || []).map((finding) => ({
      ...finding,
      section: normalizeSection(finding?.section || finding?.section_name),
      _text: lowerText(findingText(finding)),
    }));

    const normalizedEquipment = (equipment || []).map((item) => ({
      ...item,
      _text: lowerText(equipmentText(item)),
    }));

    const relationships: HouseRelationship[] = [];

    const moisturePath = normalizedFindings.filter((finding) => scoreMoisturePath(finding) >= 4);
    const moistureRelationship = buildRelationship({
      id: "roof-attic-interior-moisture-path",
      title: "Possible roof / attic / interior moisture relationship",
      category: "moisture",
      severity: "concern",
      findings: moisturePath,
      explanation:
        "Multiple findings include roof, attic, interior staining, leak, water, or moisture language. These may represent a connected water path instead of isolated observations.",
      recommendation:
        "Review these findings together. If the evidence supports it, note that the roof/attic/interior moisture observations may be related and recommend further evaluation/repair by a qualified contractor.",
      inspectorNote:
        "Only link these as related if location and photo evidence support the same source or moisture path.",
      baseConfidence: 72,
    });
    if (moistureRelationship) relationships.push(moistureRelationship);

    const drainageFoundation = normalizedFindings.filter((finding) => scoreDrainageFoundation(finding) >= 4);
    const drainageRelationship = buildRelationship({
      id: "drainage-foundation-moisture-relationship",
      title: "Possible exterior drainage / foundation moisture relationship",
      category: "drainage",
      severity: "concern",
      findings: drainageFoundation,
      explanation:
        "Drainage, grading, foundation, basement/crawlspace, efflorescence, water intrusion, or moisture language appears in multiple findings.",
      recommendation:
        "Review exterior drainage and foundation/moisture findings for consistent wording. Consider recommending correction of grading/downspouts and further evaluation of moisture intrusion where applicable.",
      inspectorNote:
        "Avoid stating the exact source as fact unless the inspection evidence confirms it.",
      baseConfidence: 74,
    });
    if (drainageRelationship) relationships.push(drainageRelationship);

    const hvacItems = [...normalizedFindings, ...normalizedEquipment].filter((item) => scoreHvacPerformance(item) >= 4);
    const hvacRelationship = buildRelationship({
      id: "hvac-age-maintenance-performance",
      title: "Possible HVAC age / maintenance / performance relationship",
      category: "hvac",
      severity: "monitor",
      findings: hvacItems,
      explanation:
        "HVAC age, maintenance, filter, airflow, refrigerant, or service-life language appears across multiple records.",
      recommendation:
        "Review HVAC findings and equipment inventory together. Make sure service, maintenance, and replacement-planning language is consistent and not overstated.",
      inspectorNote:
        "Useful when the equipment scan and field findings both point toward age or performance concerns.",
      baseConfidence: 70,
    });
    if (hvacRelationship) relationships.push(hvacRelationship);

    const electricalSafety = normalizedFindings.filter((finding) => scoreElectricalSafety(finding) >= 4);
    const electricalRelationship = buildRelationship({
      id: "electrical-panel-safety-relationship",
      title: "Possible electrical panel / branch circuit safety relationship",
      category: "electrical",
      severity: "critical",
      findings: electricalSafety,
      explanation:
        "Electrical safety language appears in multiple findings and may represent a broader panel or wiring concern.",
      recommendation:
        "Review the electrical findings together and confirm the report clearly recommends evaluation/repair by a qualified electrical contractor where appropriate.",
      inspectorNote:
        "This is especially useful when several electrical defects are present in the same panel or area.",
      baseConfidence: 76,
    });
    if (electricalRelationship) relationships.push(electricalRelationship);

    const sortedRelationships = relationships
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8);

    const highestConfidence =
      sortedRelationships.length > 0
        ? Math.max(...sortedRelationships.map((item) => item.confidence))
        : 0;

    const suggestions: string[] = [];

    if (sortedRelationships.some((item) => item.category === "moisture")) {
      suggestions.push("Review roof, attic, and interior moisture findings together before publishing.");
    }

    if (sortedRelationships.some((item) => item.category === "drainage")) {
      suggestions.push("Check that drainage and foundation moisture recommendations are consistent.");
    }

    if (sortedRelationships.some((item) => item.category === "hvac")) {
      suggestions.push("Verify HVAC age, maintenance, and performance wording matches the actual findings.");
    }

    if (sortedRelationships.some((item) => item.category === "electrical")) {
      suggestions.push("Confirm electrical safety findings clearly recommend qualified contractor evaluation.");
    }

    const summary =
      sortedRelationships.length > 0
        ? `AI found ${sortedRelationships.length} possible relationship${sortedRelationships.length === 1 ? "" : "s"} between findings. Inspector should verify before linking them in the report.`
        : "No strong cross-finding relationships detected yet.";

    return {
      relationshipCount: sortedRelationships.length,
      highestConfidence,
      relationships: sortedRelationships,
      summary,
      suggestions,
    };
  }
}

export const houseRelationshipEngine = new HouseRelationshipEngine();
