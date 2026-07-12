export type InspectionIssue = {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  reason: string;
  recommendation: string;
  section?: string;
  category?: "system" | "photo" | "equipment" | "limitation" | "coach";
};

export type SectionRequirement = {
  id: string;
  title: string;
  keywords: string[];
  photoKeywords?: string[];
  equipmentKeywords?: string[];
  required?: boolean;
  severity?: "info" | "warning" | "critical";
  recommendation: string;
};

export type SectionCompletenessResult = {
  section: string;
  score: number;
  completedItems: string[];
  missingItems: string[];
  issues: InspectionIssue[];
  hasFindings: boolean;
  hasPhotos: boolean;
  hasLimitations: boolean;
  canComplete: boolean;
  summary: string;
};

export type InspectionCompletenessResult = {
  score: number;
  completedSystems: string[];
  missingSystems: string[];
  issues: InspectionIssue[];
  sectionReviews: SectionCompletenessResult[];
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

const SECTION_REQUIREMENTS: Record<string, SectionRequirement[]> = {
  Roof: [
    {
      id: "roof-covering",
      title: "Roof covering documented",
      keywords: ["shingle", "roof covering", "metal roof", "membrane", "tile", "slate"],
      photoKeywords: ["roof", "shingle", "covering"],
      required: true,
      recommendation: "Document the roof covering material and visible condition before leaving the roof section.",
    },
    {
      id: "roof-flashing",
      title: "Flashings reviewed",
      keywords: ["flashing", "counter flashing", "step flashing", "valley", "roof penetration", "vent boot", "chimney"],
      photoKeywords: ["flashing", "chimney", "valley", "vent boot"],
      required: true,
      recommendation: "Verify flashing at penetrations, valleys, sidewalls, and chimney areas where visible.",
    },
    {
      id: "roof-drainage",
      title: "Roof drainage/gutters reviewed",
      keywords: ["gutter", "downspout", "drainage", "leader"],
      photoKeywords: ["gutter", "downspout"],
      recommendation: "Document gutters and downspouts where present or add a limitation if not visible.",
    },
  ],
  Exterior: [
    {
      id: "exterior-siding-trim",
      title: "Siding/trim condition documented",
      keywords: ["siding", "trim", "fascia", "soffit", "veneer", "cladding", "stucco", "vinyl"],
      photoKeywords: ["siding", "trim", "exterior"],
      required: true,
      recommendation: "Document the exterior wall covering and visible trim conditions.",
    },
    {
      id: "exterior-grading",
      title: "Grading/drainage reviewed",
      keywords: ["grading", "drainage", "negative grade", "soil", "slope", "water management"],
      photoKeywords: ["grading", "drainage"],
      required: true,
      recommendation: "Verify grading and exterior water management conditions around the home.",
    },
    {
      id: "exterior-deck-porch",
      title: "Decks/porches/steps reviewed",
      keywords: ["deck", "porch", "steps", "stairs", "guardrail", "handrail", "ledger"],
      photoKeywords: ["deck", "porch", "stairs"],
      recommendation: "Check decks, porches, stairs, handrails, guardrails, and attachment details where present.",
    },
  ],
  Electrical: [
    {
      id: "electrical-panel",
      title: "Electrical panel documented",
      keywords: ["panel", "service equipment", "breaker", "main disconnect", "panelboard"],
      photoKeywords: ["panel", "breaker"],
      equipmentKeywords: ["electrical panel", "panelboard", "service panel"],
      required: true,
      severity: "warning",
      recommendation: "Document the main panel/service equipment with a clear photo before leaving the electrical section.",
    },
    {
      id: "electrical-panel-label",
      title: "Panel label/data documented",
      keywords: ["panel label", "service size", "amperage", "manufacturer", "data label", "panel schedule"],
      photoKeywords: ["label", "data plate", "panel schedule"],
      equipmentKeywords: ["electrical panel", "panelboard"],
      required: true,
      severity: "warning",
      recommendation: "Capture the panel label or document why it could not be read.",
    },
    {
      id: "electrical-gfci",
      title: "GFCI protection reviewed",
      keywords: ["gfci", "gfi", "ground fault", "wet area receptacle", "bathroom receptacle", "kitchen receptacle"],
      photoKeywords: ["gfci", "gfi", "outlet", "receptacle"],
      required: true,
      severity: "warning",
      recommendation: "Verify accessible GFCI protection in required wet-area locations and document any concern or limitation.",
    },
    {
      id: "electrical-afci",
      title: "AFCI protection reviewed",
      keywords: ["afci", "arc fault", "combination afci", "afci breaker"],
      photoKeywords: ["afci", "arc fault", "breaker"],
      severity: "info",
      recommendation: "Document visible AFCI protection or note that verification was limited by panel age, labeling, or accessibility.",
    },
    {
      id: "electrical-smoke-co",
      title: "Smoke and carbon-monoxide alarms reviewed",
      keywords: ["smoke alarm", "smoke detector", "carbon monoxide", "co alarm", "co detector"],
      photoKeywords: ["smoke alarm", "carbon monoxide", "co alarm"],
      required: true,
      severity: "warning",
      recommendation: "Document visible smoke and carbon-monoxide alarms and any missing, damaged, or inaccessible devices.",
    },
    {
      id: "electrical-grounding-bonding",
      title: "Grounding and bonding reviewed",
      keywords: ["grounding", "bonding", "ground rod", "grounding electrode", "bond screw", "neutral bond"],
      photoKeywords: ["grounding", "bonding", "ground rod", "neutral"],
      required: true,
      severity: "warning",
      recommendation: "Review visible service grounding and bonding conditions and document limitations where concealed or inaccessible.",
    },
    {
      id: "electrical-open-grounds-polarity",
      title: "Open grounds and polarity concerns reviewed",
      keywords: ["open ground", "reverse polarity", "reversed polarity", "ungrounded", "two prong", "receptacle tester"],
      photoKeywords: ["open ground", "receptacle tester", "two prong", "outlet"],
      severity: "warning",
      recommendation: "Document representative receptacle test concerns such as open grounds, reversed polarity, or missing grounding protection.",
    },
    {
      id: "electrical-exterior-receptacles",
      title: "Exterior receptacles reviewed",
      keywords: ["exterior receptacle", "outdoor outlet", "weather resistant", "in-use cover", "bubble cover"],
      photoKeywords: ["exterior receptacle", "outdoor outlet", "in-use cover"],
      severity: "info",
      recommendation: "Review accessible exterior receptacles, covers, and visible GFCI protection where present.",
    },
    {
      id: "electrical-wiring",
      title: "Visible wiring reviewed",
      keywords: ["wiring", "open junction", "double tap", "double tapped", "conductor", "neutral", "ground", "bonding", "open splice"],
      photoKeywords: ["wire", "junction", "breaker", "splice"],
      required: true,
      severity: "warning",
      recommendation: "Review visible wiring and panel conditions for reportable shock, fire, overheating, or improper-connection concerns.",
    },
  ],
  Plumbing: [
    {
      id: "plumbing-water-heater",
      title: "Water heater documented",
      keywords: ["water heater", "tpr", "temperature pressure", "discharge pipe", "expansion tank"],
      photoKeywords: ["water heater", "tpr"],
      equipmentKeywords: ["water heater"],
      required: true,
      severity: "warning",
      recommendation: "Document the water heater, data plate where visible, and TPR discharge piping.",
    },
    {
      id: "plumbing-fixtures-drains",
      title: "Fixtures/drains reviewed",
      keywords: ["sink", "toilet", "tub", "shower", "faucet", "drain", "trap", "leak"],
      photoKeywords: ["sink", "toilet", "drain", "leak"],
      recommendation: "Verify representative fixtures, drains, traps, and visible supply piping.",
    },
  ],
  Heating: [
    {
      id: "heating-equipment",
      title: "Heating equipment documented",
      keywords: ["furnace", "boiler", "heat pump", "air handler", "heating equipment", "burner"],
      photoKeywords: ["furnace", "boiler", "heat pump", "air handler"],
      equipmentKeywords: ["furnace", "boiler", "heat pump", "air handler"],
      required: true,
      severity: "warning",
      recommendation: "Document heating equipment and data plate where visible.",
    },
    {
      id: "heating-venting-distribution",
      title: "Heating venting/distribution reviewed",
      keywords: ["flue", "vent", "duct", "radiator", "register", "baseboard", "distribution"],
      photoKeywords: ["flue", "duct", "vent"],
      recommendation: "Verify visible venting and heating distribution components.",
    },
  ],
  Cooling: [
    {
      id: "cooling-equipment",
      title: "Cooling equipment documented",
      keywords: ["condenser", "air conditioner", "ac", "a/c", "cooling", "evaporator", "refrigerant", "heat pump"],
      photoKeywords: ["condenser", "air conditioner", "cooling"],
      equipmentKeywords: ["condenser", "air conditioner", "heat pump"],
      required: true,
      severity: "warning",
      recommendation: "Document cooling equipment and data plate where visible.",
    },
    {
      id: "cooling-operation-limitation",
      title: "Cooling operation/limitation noted",
      keywords: ["not tested", "temperature", "cooling mode", "operated", "did not operate", "low outdoor temperature"],
      recommendation: "Document whether cooling was tested or limited by outdoor temperature/conditions.",
    },
  ],
  Garage: [
    {
      id: "garage-door-opener",
      title: "Garage door/opener reviewed",
      keywords: ["garage door", "opener", "photo eye", "auto reverse", "auto-reverse", "safety reverse"],
      photoKeywords: ["garage door", "opener", "photo eye"],
      required: true,
      severity: "warning",
      recommendation: "Verify garage door opener safety features and document any limitations.",
    },
    {
      id: "garage-fire-separation",
      title: "Garage fire separation reviewed",
      keywords: ["fire separation", "firewall", "garage ceiling", "self closing", "house door"],
      recommendation: "Review visible garage fire separation conditions and the door to the living area where present.",
    },
  ],
  "Attic, Insulation & Ventilation": [
    {
      id: "attic-access",
      title: "Attic access/limitation documented",
      keywords: ["attic access", "attic", "limited access", "not accessible", "low clearance"],
      photoKeywords: ["attic"],
      required: true,
      severity: "warning",
      recommendation: "Document attic access and add a limitation if attic areas could not be entered or fully viewed.",
    },
    {
      id: "attic-insulation-ventilation",
      title: "Insulation/ventilation reviewed",
      keywords: ["insulation", "ventilation", "baffle", "soffit vent", "ridge vent", "bath fan", "duct"],
      photoKeywords: ["insulation", "ventilation", "duct"],
      required: true,
      recommendation: "Verify visible insulation, ventilation, and exhaust ducting conditions.",
    },
    {
      id: "attic-roof-sheathing",
      title: "Roof sheathing underside reviewed",
      keywords: ["sheathing", "rafters", "truss", "staining", "roof leak", "attic side"],
      recommendation: "Review the attic side of roof sheathing/framing where accessible.",
    },
  ],
  "Basement, Foundation, Crawlspace & Structure": [
    {
      id: "structure-foundation",
      title: "Foundation/structure documented",
      keywords: ["foundation", "crack", "block", "stone", "beam", "joist", "pier", "post", "settlement"],
      photoKeywords: ["foundation", "beam", "joist", "crack"],
      required: true,
      severity: "warning",
      recommendation: "Document visible foundation and structural components or add limitations where access is restricted.",
    },
    {
      id: "structure-moisture",
      title: "Moisture/water intrusion reviewed",
      keywords: ["moisture", "water intrusion", "staining", "efflorescence", "sump", "crawlspace", "basement water"],
      photoKeywords: ["moisture", "staining", "crawlspace"],
      recommendation: "Review visible moisture indicators and drainage conditions in basement/crawlspace areas.",
    },
  ],
  "Doors, Windows & Interior": [
    {
      id: "interior-openings",
      title: "Doors/windows/interior reviewed",
      keywords: ["door", "window", "floor", "wall", "ceiling", "stair", "handrail", "guardrail"],
      photoKeywords: ["door", "window", "stair", "handrail"],
      recommendation: "Review representative doors, windows, stairs, railings, and visible interior finishes.",
    },
  ],
  "Built-in Appliances": [
    {
      id: "appliances-tested",
      title: "Built-in appliances reviewed",
      keywords: ["dishwasher", "range", "oven", "microwave", "disposal", "appliance"],
      photoKeywords: ["dishwasher", "range", "oven", "microwave"],
      recommendation: "Document built-in appliance operation or limitations.",
    },
  ],
  Fireplace: [
    {
      id: "fireplace-reviewed",
      title: "Fireplace reviewed",
      keywords: ["fireplace", "chimney", "damper", "hearth", "flue"],
      photoKeywords: ["fireplace", "chimney", "damper"],
      recommendation: "Document fireplace/chimney conditions or limitations where present.",
    },
  ],
};

function cleanText(value: any) {
  return String(value || "").trim();
}

function normalize(value: any) {
  return cleanText(value).toLowerCase();
}

function includesAny(text: string, keywords: string[] = []) {
  const clean = normalize(text);
  return keywords.some((keyword) => clean.includes(keyword.toLowerCase()));
}

function rowText(row: any) {
  return [
    row?.section,
    row?.title,
    row?.observation,
    row?.implication,
    row?.recommendation,
    row?.ai_notes,
    row?.limitation_comment,
    row?.custom_text,
    row?.label,
    row?.equipment_type,
    row?.manufacturer,
    row?.model,
    row?.serial,
    row?.file_path,
    row?.public_url,
    row?.thumbnail_url,
    row?.mime_type,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

function sectionMatches(row: any, section: string) {
  return normalize(row?.section) === normalize(section);
}

function hasRequirementEvidence({
  requirement,
  findings,
  photos,
  equipment,
  limitations,
  houseMemory,
}: {
  requirement: SectionRequirement;
  findings: any[];
  photos: any[];
  equipment: any[];
  limitations: any[];
  houseMemory?: any;
}) {
  const findingHit = findings.some((finding) =>
    includesAny(rowText(finding), requirement.keywords),
  );

  const photoHit = photos.some((photo) =>
    includesAny(rowText(photo), [
      ...(requirement.photoKeywords || []),
      ...requirement.keywords,
    ]),
  );

  const equipmentHit = equipment.some((item) =>
    includesAny(rowText(item), [
      ...(requirement.equipmentKeywords || []),
      ...requirement.keywords,
    ]),
  );

  const limitationHit = limitations.some((limitation) =>
    includesAny(rowText(limitation), requirement.keywords),
  );

  const memoryHit = Array.isArray(houseMemory?.facts)
    ? houseMemory.facts.some((fact: any) =>
        includesAny(rowText(fact), requirement.keywords),
      )
    : false;

  return findingHit || photoHit || equipmentHit || limitationHit || memoryHit;
}

function getSectionRequirements(section: string) {
  return SECTION_REQUIREMENTS[section] || [];
}

export class InspectionCompleteness {
  analyze({
    findings = [],
    photos = [],
    equipment = [],
    limitations = [],
    houseMemory,
  }: {
    findings?: any[];
    photos?: any[];
    equipment?: any[];
    limitations?: any[];
    houseMemory?: any;
  }): InspectionCompletenessResult {
    const completed = new Set<string>();
    const issues: InspectionIssue[] = [];

    for (const finding of findings) {
      const section = cleanText(finding?.section);
      if (section) completed.add(section);
    }

    for (const photo of photos) {
      const section = cleanText(photo?.section || photo?.report_section);
      if (section) completed.add(section);
    }

    for (const item of equipment) {
      const section = cleanText(item?.section || item?.equipment_category);
      if (section) completed.add(section);
    }

    for (const limitation of limitations) {
      const section = cleanText(limitation?.section);
      if (section) completed.add(section);
    }

    if (houseMemory?.facts) {
      for (const fact of houseMemory.facts) {
        const system = cleanText(fact?.system || fact?.section);
        if (system) completed.add(system);
      }
    }

    const missingSystems = CORE_SYSTEMS.filter((system) => !completed.has(system));

    for (const system of missingSystems) {
      issues.push({
        id: `missing-${system.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: `${system} not documented yet`,
        severity: "warning",
        section: system,
        category: "system",
        reason: `${system} is a core inspection system and no finding, photo, equipment entry, limitation, or memory item was found for it.`,
        recommendation: `Review ${system} or add a limitation if it was not accessible/applicable.`,
      });
    }

    const sectionReviews = CORE_SYSTEMS.map((section) =>
      this.analyzeSection({
        section,
        findings,
        photos,
        equipment,
        limitations,
        houseMemory,
      }),
    );

    for (const review of sectionReviews) {
      issues.push(...review.issues);
    }

    const completedSectionScores = sectionReviews.map((review) => review.score);
    const avgSectionScore = completedSectionScores.length
      ? completedSectionScores.reduce((sum, score) => sum + score, 0) /
        completedSectionScores.length
      : 0;

    const systemCoverageScore = Math.round(
      ((CORE_SYSTEMS.length - missingSystems.length) / CORE_SYSTEMS.length) * 100,
    );

    const score = Math.max(
      0,
      Math.min(100, Math.round(systemCoverageScore * 0.45 + avgSectionScore * 0.55)),
    );

    return {
      score,
      completedSystems: [...completed].sort(),
      missingSystems,
      issues: issues.slice(0, 80),
      sectionReviews,
    };
  }

  analyzeSection({
    section,
    findings = [],
    photos = [],
    equipment = [],
    limitations = [],
    houseMemory,
  }: {
    section: string;
    findings?: any[];
    photos?: any[];
    equipment?: any[];
    limitations?: any[];
    houseMemory?: any;
  }): SectionCompletenessResult {
    const targetSection = cleanText(section);
    const requirements = getSectionRequirements(targetSection);

    const sectionFindings = findings.filter((finding) => sectionMatches(finding, targetSection));
    const sectionPhotos = photos.filter((photo) => sectionMatches(photo, targetSection));
    const sectionEquipment = equipment.filter((item) => sectionMatches(item, targetSection));
    const sectionLimitations = limitations.filter((item) => sectionMatches(item, targetSection));

    const completedItems: string[] = [];
    const missingItems: string[] = [];
    const issues: InspectionIssue[] = [];

    for (const requirement of requirements) {
      const complete = hasRequirementEvidence({
        requirement,
        findings: sectionFindings,
        photos: sectionPhotos,
        equipment: sectionEquipment,
        limitations: sectionLimitations,
        houseMemory,
      });

      if (complete) {
        completedItems.push(requirement.title);
        continue;
      }

      missingItems.push(requirement.title);

      if (requirement.required || requirement.severity === "critical" || requirement.severity === "warning") {
        issues.push({
          id: `${targetSection.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${requirement.id}`,
          title: requirement.title,
          severity: requirement.severity || (requirement.required ? "warning" : "info"),
          section: targetSection,
          category: "coach",
          reason: `${requirement.title} was not clearly documented in ${targetSection}.`,
          recommendation: requirement.recommendation,
        });
      }
    }

    const hasFindings = sectionFindings.length > 0;
    const hasPhotos = sectionPhotos.length > 0;
    const hasLimitations = sectionLimitations.length > 0;

    if (!hasFindings && !hasPhotos && !hasLimitations && requirements.length > 0) {
      issues.unshift({
        id: `${targetSection.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-empty-section`,
        title: `${targetSection} has not been documented yet`,
        severity: "warning",
        section: targetSection,
        category: "system",
        reason: `No findings, section photos, or limitations were found for ${targetSection}.`,
        recommendation: `Inspect and document ${targetSection}, or add a limitation if it was not accessible/applicable.`,
      });
    }

    const total = Math.max(1, requirements.length);
    const completedCount = completedItems.length;
    const baseScore = requirements.length > 0 ? Math.round((completedCount / total) * 100) : 100;
    const documentationBoost = hasPhotos || hasFindings || hasLimitations ? 10 : 0;
    const score = Math.max(0, Math.min(100, baseScore + documentationBoost));
    const blockingIssues = issues.filter((issue) => issue.severity !== "info");

    const summary =
      blockingIssues.length > 0
        ? `${targetSection} appears incomplete. ${blockingIssues[0].title} should be verified before leaving this section.`
        : missingItems.length > 0
          ? `${targetSection} is mostly documented. Consider verifying ${missingItems[0].toLowerCase()} before completing the section.`
          : `${targetSection} appears documented based on the available findings, photos, equipment, and limitations.`;

    return {
      section: targetSection,
      score,
      completedItems,
      missingItems,
      issues,
      hasFindings,
      hasPhotos,
      hasLimitations,
      canComplete: blockingIssues.length === 0,
      summary,
    };
  }
}

export const inspectionCompleteness = new InspectionCompleteness();
