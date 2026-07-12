export type InspectionGraphNodeType =
  | "property"
  | "system"
  | "component"
  | "finding"
  | "equipment"
  | "evidence"
  | "limitation"
  | "requirement"
  | "memory";

export type InspectionGraphNode = {
  id: string;
  type: InspectionGraphNodeType;
  label: string;
  section: string;
  status: "documented" | "attention" | "missing" | "limited" | "informational";
  severity?: string;
  confidence?: number;
  sourceId?: string | number;
  metadata?: Record<string, any>;
};

export type InspectionGraphEdge = {
  id: string;
  from: string;
  to: string;
  relation:
    | "contains"
    | "documents"
    | "supports"
    | "limits"
    | "relates_to"
    | "requires"
    | "may_explain";
  confidence: number;
  reason?: string;
};

export type InspectionGraphSection = {
  section: string;
  score: number;
  findingCount: number;
  photoCount: number;
  equipmentCount: number;
  limitationCount: number;
  documentedRequirements: string[];
  missingRequirements: string[];
  attentionItems: string[];
};

export type InspectionGraphResult = {
  inspectionId: string;
  generatedAt: string;
  score: number;
  nodes: InspectionGraphNode[];
  edges: InspectionGraphEdge[];
  sections: InspectionGraphSection[];
  relationships: Array<{
    id: string;
    title: string;
    sections: string[];
    confidence: number;
    explanation: string;
    recommendation: string;
  }>;
  summary: string;
  missingSystems: string[];
  documentedSystems: string[];
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
  "Built-in Appliances",
  "Garage",
];

const REQUIREMENTS: Record<string, Array<{ id: string; title: string; keywords: string[] }>> = {
  Roof: [
    { id: "covering", title: "Roof covering", keywords: ["roof covering", "shingle", "metal roof", "slate", "membrane"] },
    { id: "flashing", title: "Flashing and penetrations", keywords: ["flashing", "chimney", "valley", "vent boot", "penetration"] },
    { id: "drainage", title: "Gutters and drainage", keywords: ["gutter", "downspout", "drainage"] },
  ],
  Exterior: [
    { id: "cladding", title: "Wall covering and trim", keywords: ["siding", "cladding", "veneer", "trim", "fascia", "soffit"] },
    { id: "grading", title: "Grading and drainage", keywords: ["grading", "drainage", "slope", "soil"] },
    { id: "appurtenances", title: "Decks, porches, steps and rails", keywords: ["deck", "porch", "steps", "stairs", "rail", "ledger"] },
  ],
  Electrical: [
    { id: "panel", title: "Panel and main disconnect", keywords: ["panel", "breaker", "main disconnect", "service equipment"] },
    { id: "label", title: "Panel label or service data", keywords: ["panel label", "data label", "amperage", "service size", "panel schedule"] },
    { id: "gfci", title: "GFCI protection", keywords: ["gfci", "gfi", "ground fault"] },
    { id: "afci", title: "AFCI protection", keywords: ["afci", "arc fault"] },
    { id: "alarms", title: "Smoke and CO alarms", keywords: ["smoke alarm", "smoke detector", "carbon monoxide", "co alarm"] },
    { id: "grounding", title: "Grounding and bonding", keywords: ["grounding", "bonding", "ground rod", "neutral bond"] },
  ],
  Plumbing: [
    { id: "water-heater", title: "Water heater and TPR", keywords: ["water heater", "tpr", "temperature pressure", "discharge pipe"] },
    { id: "fixtures", title: "Fixtures, drains and visible piping", keywords: ["sink", "toilet", "tub", "shower", "drain", "piping", "leak"] },
  ],
  Heating: [
    { id: "equipment", title: "Heating equipment and label", keywords: ["furnace", "boiler", "heat pump", "air handler", "heating equipment", "data plate"] },
    { id: "venting", title: "Venting and distribution", keywords: ["flue", "vent", "duct", "register", "radiator", "baseboard"] },
  ],
  Cooling: [
    { id: "equipment", title: "Cooling equipment and label", keywords: ["condenser", "air conditioner", "cooling", "heat pump", "data plate"] },
    { id: "operation", title: "Operation or temperature limitation", keywords: ["operated", "not tested", "temperature", "cooling mode", "delta"] },
  ],
  "Attic, Insulation & Ventilation": [
    { id: "access", title: "Attic access or limitation", keywords: ["attic access", "viewed from", "not entered", "limited access"] },
    { id: "insulation", title: "Insulation and ventilation", keywords: ["insulation", "ventilation", "soffit vent", "ridge vent"] },
    { id: "sheathing", title: "Roof sheathing and moisture indicators", keywords: ["sheathing", "roof deck", "staining", "moisture"] },
  ],
  "Basement, Foundation, Crawlspace & Structure": [
    { id: "structure", title: "Foundation and structure", keywords: ["foundation", "joist", "beam", "column", "pier", "structure"] },
    { id: "moisture", title: "Moisture and drainage indicators", keywords: ["moisture", "water", "staining", "efflorescence", "sump"] },
  ],
  "Doors, Windows & Interior": [
    { id: "openings", title: "Representative doors and windows", keywords: ["door", "window", "opening", "seal"] },
    { id: "safety", title: "Stairs, guards and handrails", keywords: ["stairs", "steps", "guard", "handrail", "railing"] },
  ],
  Garage: [
    { id: "door", title: "Garage door and safety features", keywords: ["garage door", "opener", "photo eye", "auto reverse"] },
    { id: "separation", title: "Garage fire separation", keywords: ["fire separation", "garage ceiling", "garage wall", "self closing"] },
  ],
  "Built-in Appliances": [
    { id: "appliances", title: "Built-in appliances operated or limited", keywords: ["dishwasher", "range", "oven", "microwave", "disposal", "appliance"] },
  ],
};

function text(...values: any[]) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function normalizeSection(value: any) {
  const clean = String(value || "").trim();
  const aliases: Record<string, string> = {
    General: "Inspection Details",
    Safety: "Inspection Details",
    "Basement/Foundation/Crawlspace & Structure": "Basement, Foundation, Crawlspace & Structure",
    "Attic/Insulation & Ventilation": "Attic, Insulation & Ventilation",
    "Doors/Windows & Interior": "Doors, Windows & Interior",
    Appliances: "Built-in Appliances",
  };
  return aliases[clean] || clean || "Inspection Details";
}

function includesAny(haystack: string, keywords: string[]) {
  const clean = haystack.toLowerCase();
  return keywords.some((keyword) => clean.includes(keyword.toLowerCase()));
}

function severityWeight(value: any) {
  const clean = String(value || "").toLowerCase();
  if (clean.includes("major") || clean.includes("safety")) return 3;
  if (clean.includes("recommended")) return 2;
  if (clean.includes("maintenance") || clean.includes("monitor")) return 1;
  return 0;
}

function componentLabel(finding: any) {
  return text(
    finding?.component,
    finding?.subsection,
    finding?.category,
    finding?.system,
    finding?.group_title,
  ) || "General";
}

function buildRelationships(findings: any[], sections: InspectionGraphSection[]) {
  const relationships: InspectionGraphResult["relationships"] = [];
  const combined = findings.map((finding) => ({
    ...finding,
    _section: normalizeSection(finding?.section),
    _text: text(finding?.title, finding?.observation, finding?.implication, finding?.recommendation).toLowerCase(),
  }));

  const rules = [
    {
      id: "roof-attic-moisture",
      title: "Roof-to-attic moisture relationship",
      a: "Roof",
      b: "Attic, Insulation & Ventilation",
      aWords: ["flashing", "roof leak", "damaged shingle", "chimney", "penetration"],
      bWords: ["stain", "moisture", "leak", "sheathing", "water"],
      explanation: "Roof-surface concerns and attic-side moisture evidence may describe the same water-entry path.",
      recommendation: "Cross-reference roof and attic documentation and verify that the report explains the possible relationship without claiming a concealed source as fact.",
    },
    {
      id: "grading-basement-moisture",
      title: "Exterior drainage-to-foundation moisture relationship",
      a: "Exterior",
      b: "Basement, Foundation, Crawlspace & Structure",
      aWords: ["grading", "drainage", "downspout", "negative slope", "soil"],
      bWords: ["moisture", "water", "efflorescence", "stain", "damp"],
      explanation: "Exterior drainage conditions may contribute to below-grade moisture indicators.",
      recommendation: "Reference both observations and recommend correction of exterior water management plus further evaluation if active intrusion is suspected.",
    },
    {
      id: "plumbing-interior-moisture",
      title: "Plumbing-to-interior moisture relationship",
      a: "Plumbing",
      b: "Doors, Windows & Interior",
      aWords: ["leak", "drain", "supply", "toilet", "shower", "tub"],
      bWords: ["stain", "moisture", "damage", "soft", "swelling"],
      explanation: "Visible plumbing concerns and nearby finish damage may be related.",
      recommendation: "Confirm location and wording so the report distinguishes visible evidence from the unverified concealed source.",
    },
    {
      id: "electrical-moisture",
      title: "Moisture near electrical components",
      a: "Electrical",
      b: "Basement, Foundation, Crawlspace & Structure",
      aWords: ["corrosion", "rust", "water", "moisture", "panel"],
      bWords: ["moisture", "water", "damp", "leak"],
      explanation: "Moisture evidence near electrical equipment can increase shock, corrosion, and reliability concerns.",
      recommendation: "Prioritize electrician evaluation and correction of the moisture source when the locations overlap.",
    },
  ];

  for (const rule of rules) {
    const left = combined.filter((finding) => finding._section === rule.a && includesAny(finding._text, rule.aWords));
    const right = combined.filter((finding) => finding._section === rule.b && includesAny(finding._text, rule.bWords));
    if (!left.length || !right.length) continue;

    relationships.push({
      id: rule.id,
      title: rule.title,
      sections: [rule.a, rule.b],
      confidence: Math.min(0.96, 0.72 + Math.min(left.length + right.length, 4) * 0.05),
      explanation: rule.explanation,
      recommendation: rule.recommendation,
    });
  }

  const missing = sections.filter((section) => section.missingRequirements.length >= 2);
  for (const section of missing.slice(0, 3)) {
    relationships.push({
      id: `coverage-${section.section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: `${section.section} documentation gap`,
      sections: [section.section],
      confidence: 0.95,
      explanation: `${section.missingRequirements.length} expected documentation items are not yet represented in the inspection evidence graph.`,
      recommendation: `Verify ${section.missingRequirements.join(", ")} before leaving the property or document an appropriate limitation.`,
    });
  }

  return relationships;
}

export function buildInspectionGraph(input: {
  inspection: any;
  findings?: any[];
  equipment?: any[];
  photos?: any[];
  limitations?: any[];
  referencePhotos?: any[];
  checklist?: any[];
  memoryEvents?: any[];
}): InspectionGraphResult {
  const inspection = input.inspection || {};
  const findings = input.findings || [];
  const equipment = input.equipment || [];
  const photos = input.photos || [];
  const limitations = input.limitations || [];
  const referencePhotos = input.referencePhotos || [];
  const checklist = input.checklist || [];
  const memoryEvents = input.memoryEvents || [];
  const inspectionId = String(inspection?.id || inspection?.inspection_id || "");

  const nodes: InspectionGraphNode[] = [];
  const edges: InspectionGraphEdge[] = [];
  const propertyId = `property:${inspectionId || "current"}`;

  nodes.push({
    id: propertyId,
    type: "property",
    label: text(inspection?.address, inspection?.property_address) || "Current Property",
    section: "Inspection Details",
    status: "documented",
    sourceId: inspectionId,
    metadata: {
      yearBuilt: inspection?.year_built || inspection?.yearBuilt || null,
      propertyType: inspection?.property_type || inspection?.style || null,
    },
  });

  const photoByFinding = new Map<string, any[]>();
  for (const photo of photos) {
    const id = String(photo?.finding_id || "");
    if (!id) continue;
    photoByFinding.set(id, [...(photoByFinding.get(id) || []), photo]);
  }

  const sectionResults: InspectionGraphSection[] = [];
  for (const section of CORE_SECTIONS) {
    const sectionId = `system:${section}`;
    const sectionFindings = findings.filter((finding) => normalizeSection(finding?.section) === section);
    const sectionEquipment = equipment.filter((item) => normalizeSection(item?.section || item?.report_section || item?.category) === section || includesAny(text(item?.equipment_type, item?.type, item?.name), REQUIREMENTS[section]?.flatMap((item) => item.keywords) || []));
    const sectionLimitations = limitations.filter((item) => normalizeSection(item?.section) === section);
    const sectionReference = referencePhotos.filter((item) => normalizeSection(item?.section || item?.report_section) === section);
    const sectionChecklist = checklist.filter((item) => normalizeSection(item?.section) === section);
    const sectionMemory = memoryEvents.filter((item) => normalizeSection(item?.section) === section && ["accepted", "checked", "completed", "saved"].includes(String(item?.status || "").toLowerCase()));
    const findingPhotos = sectionFindings.flatMap((finding) => photoByFinding.get(String(finding?.id)) || []);
    const sectionPhotos = [...findingPhotos, ...sectionReference];

    const evidenceText = text(
      sectionFindings.map((finding) => text(finding?.title, finding?.observation, finding?.implication, finding?.recommendation, componentLabel(finding))),
      sectionEquipment.map((item) => text(item?.equipment_type, item?.type, item?.manufacturer, item?.model, item?.notes)),
      sectionLimitations.map((item) => text(item?.label, item?.custom_text, item?.limitation_comment)),
      sectionChecklist.map((item) => text(item?.group_title, item?.value, item?.custom_text)),
      sectionMemory.map((item) => text(item?.title, item?.detail, item?.event_type)),
      sectionReference.map((item) => text(item?.caption, item?.title)),
    ).toLowerCase();

    const requirements = REQUIREMENTS[section] || [];
    const documentedRequirements = requirements.filter((requirement) => includesAny(evidenceText, requirement.keywords)).map((requirement) => requirement.title);
    const missingRequirements = requirements.filter((requirement) => !includesAny(evidenceText, requirement.keywords)).map((requirement) => requirement.title);
    const hasAnyEvidence = Boolean(sectionFindings.length || sectionEquipment.length || sectionLimitations.length || sectionChecklist.length || sectionMemory.length || sectionPhotos.length);
    const requirementScore = requirements.length ? documentedRequirements.length / requirements.length : hasAnyEvidence ? 1 : 0;
    const evidenceBonus = Math.min(0.25, (sectionPhotos.length > 0 ? 0.1 : 0) + (sectionLimitations.length > 0 ? 0.05 : 0) + (sectionChecklist.length > 0 ? 0.05 : 0) + (sectionEquipment.length > 0 ? 0.05 : 0));
    const score = Math.round(Math.max(0, Math.min(100, (requirementScore + evidenceBonus) * 100)));
    const attentionItems = sectionFindings.filter((finding) => severityWeight(finding?.severity) >= 2).map((finding) => text(finding?.title) || "Finding requiring attention").slice(0, 5);

    nodes.push({
      id: sectionId,
      type: "system",
      label: section,
      section,
      status: !hasAnyEvidence ? "missing" : missingRequirements.length ? "attention" : "documented",
      confidence: score / 100,
      metadata: { score, findingCount: sectionFindings.length, photoCount: sectionPhotos.length },
    });
    edges.push({ id: `edge:${propertyId}:${sectionId}`, from: propertyId, to: sectionId, relation: "contains", confidence: 1 });

    for (const requirement of requirements) {
      const documented = documentedRequirements.includes(requirement.title);
      const requirementId = `requirement:${section}:${requirement.id}`;
      nodes.push({
        id: requirementId,
        type: "requirement",
        label: requirement.title,
        section,
        status: documented ? "documented" : "missing",
        confidence: documented ? 0.95 : 0.85,
      });
      edges.push({ id: `edge:${sectionId}:${requirementId}`, from: sectionId, to: requirementId, relation: "requires", confidence: 1 });
    }

    for (const finding of sectionFindings) {
      const findingId = `finding:${finding?.id}`;
      nodes.push({
        id: findingId,
        type: "finding",
        label: text(finding?.title, finding?.finding_title) || "Inspection Finding",
        section,
        status: severityWeight(finding?.severity) >= 2 ? "attention" : "documented",
        severity: finding?.severity,
        sourceId: finding?.id,
        metadata: { component: componentLabel(finding), observation: finding?.observation || "" },
      });
      edges.push({ id: `edge:${sectionId}:${findingId}`, from: sectionId, to: findingId, relation: "documents", confidence: 1 });
      for (const photo of photoByFinding.get(String(finding?.id)) || []) {
        const photoId = `evidence:${photo?.id || photo?.file_path || Math.random()}`;
        nodes.push({ id: photoId, type: "evidence", label: photo?.caption || photo?.title || "Finding photo", section, status: "documented", sourceId: photo?.id });
        edges.push({ id: `edge:${findingId}:${photoId}`, from: photoId, to: findingId, relation: "supports", confidence: 1 });
      }
    }

    for (const item of sectionEquipment) {
      const equipmentId = `equipment:${item?.id}`;
      nodes.push({
        id: equipmentId,
        type: "equipment",
        label: text(item?.manufacturer, item?.equipment_type, item?.type, item?.name) || "Equipment",
        section,
        status: "documented",
        sourceId: item?.id,
        metadata: { model: item?.model || null, serial: item?.serial_number || item?.serial || null, age: item?.age || item?.manufacture_year || null },
      });
      edges.push({ id: `edge:${sectionId}:${equipmentId}`, from: sectionId, to: equipmentId, relation: "contains", confidence: 1 });
    }

    for (const item of sectionLimitations) {
      const limitationId = `limitation:${item?.id}`;
      nodes.push({ id: limitationId, type: "limitation", label: text(item?.label, item?.custom_text) || "Inspection limitation", section, status: "limited", sourceId: item?.id });
      edges.push({ id: `edge:${limitationId}:${sectionId}`, from: limitationId, to: sectionId, relation: "limits", confidence: 1 });
    }

    sectionResults.push({
      section,
      score,
      findingCount: sectionFindings.length,
      photoCount: sectionPhotos.length,
      equipmentCount: sectionEquipment.length,
      limitationCount: sectionLimitations.length,
      documentedRequirements,
      missingRequirements,
      attentionItems,
    });
  }

  const relationships = buildRelationships(findings, sectionResults);
  for (const relationship of relationships) {
    const relationshipNodeId = `relationship:${relationship.id}`;
    nodes.push({ id: relationshipNodeId, type: "component", label: relationship.title, section: relationship.sections[0] || "Inspection Details", status: "attention", confidence: relationship.confidence, metadata: relationship });
    for (const section of relationship.sections) {
      edges.push({ id: `edge:${relationshipNodeId}:system:${section}`, from: relationshipNodeId, to: `system:${section}`, relation: "relates_to", confidence: relationship.confidence, reason: relationship.explanation });
    }
  }

  const documentedSystems = sectionResults.filter((section) => section.score >= 60).map((section) => section.section);
  const missingSystems = sectionResults.filter((section) => section.score < 40).map((section) => section.section);
  const score = Math.round(sectionResults.reduce((sum, section) => sum + section.score, 0) / Math.max(1, sectionResults.length));
  const summary = `${documentedSystems.length} of ${sectionResults.length} core systems have meaningful documentation. ${relationships.length} cross-system relationship${relationships.length === 1 ? "" : "s"} require review.`;

  return {
    inspectionId,
    generatedAt: new Date().toISOString(),
    score,
    nodes,
    edges,
    sections: sectionResults,
    relationships,
    summary,
    missingSystems,
    documentedSystems,
  };
}

export function formatInspectionGraphForPrompt(graph: InspectionGraphResult) {
  const sectionLines = graph.sections.map((section) =>
    `- ${section.section}: ${section.score}% complete; documented: ${section.documentedRequirements.join(", ") || "none"}; missing: ${section.missingRequirements.join(", ") || "none"}; attention: ${section.attentionItems.join(", ") || "none"}`,
  );
  const relationshipLines = graph.relationships.map((relationship) =>
    `- ${relationship.title} (${Math.round(relationship.confidence * 100)}%): ${relationship.explanation}`,
  );
  return [
    `Inspection graph score: ${graph.score}%`,
    graph.summary,
    "Systems:",
    ...sectionLines,
    "Cross-system relationships:",
    ...(relationshipLines.length ? relationshipLines : ["- None currently identified."]),
  ].join("\n");
}
