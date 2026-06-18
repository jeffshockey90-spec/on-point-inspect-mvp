import { NextResponse } from "next/server";
import OpenAI from "openai";
import { logAIEvent } from "../../../lib/logging";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type EquipmentAnalysis = {
  equipmentType?: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  manufactureYear?: string | number;
  estimatedAge?: string | number;
  expectedServiceLife?: string;
  estimatedSEER?: string;
  estimatedAFUE?: string;
  estimatedBTU?: string;
  equipmentCategory?: string;
  budgetPlanning?: string;
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
  error?: string;
  raw?: string;
};

const VALID_SECTIONS = [
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
  "General",
];

const VALID_SEVERITIES = [
  "Informational",
  "Monitor",
  "Maintenance",
  "Recommended Repair",
  "Safety Concern",
  "Major Concern",
];

function cleanText(value: any) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getCurrentYear() {
  return new Date().getFullYear();
}

function getFirstYear(value: any) {
  const text = cleanText(value);
  const match = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (!match) return null;

  const year = Number(match[1]);
  const currentYear = getCurrentYear();

  if (!Number.isFinite(year) || year < 1950 || year > currentYear + 1) {
    return null;
  }

  return year;
}

function getAgeFromYear(year: number | null) {
  if (!year) return null;
  const age = getCurrentYear() - year;
  if (!Number.isFinite(age) || age < 0 || age > 80) return null;
  return age;
}

function decodeManufactureYearFromSerial({
  manufacturer,
  serial,
}: {
  manufacturer: string;
  serial: string;
}) {
  const brand = cleanText(manufacturer).toLowerCase();
  const cleanSerial = cleanText(serial).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const currentYear = getCurrentYear();
  const currentTwoDigitYear = currentYear % 100;

  if (!cleanSerial || cleanSerial.length < 4) return null;

  // A.O. Smith / State / American / Reliance water heaters commonly use YYWW...
  // Example: 1231A107021 = 31st week of 2012.
  if (
    brand.includes("a.o. smith") ||
    brand.includes("ao smith") ||
    brand.includes("a o smith") ||
    brand.includes("state") ||
    brand.includes("american water heater") ||
    brand.includes("reliance")
  ) {
    const yy = Number(cleanSerial.slice(0, 2));
    const ww = Number(cleanSerial.slice(2, 4));

    if (Number.isFinite(yy) && Number.isFinite(ww) && ww >= 1 && ww <= 53) {
      const year = yy <= currentTwoDigitYear + 1 ? 2000 + yy : 1900 + yy;
      if (year >= 1980 && year <= currentYear + 1) return year;
    }
  }

  // Goodman / Amana / Daikin often use YYMM... at the beginning of the serial.
  if (
    brand.includes("goodman") ||
    brand.includes("amana") ||
    brand.includes("daikin")
  ) {
    const yy = Number(cleanSerial.slice(0, 2));
    const mm = Number(cleanSerial.slice(2, 4));

    if (Number.isFinite(yy) && Number.isFinite(mm) && mm >= 1 && mm <= 12) {
      const year = yy <= currentTwoDigitYear + 1 ? 2000 + yy : 1900 + yy;
      if (year >= 1980 && year <= currentYear + 1) return year;
    }
  }

  return null;
}


function getStatusLifeMax(category: string, equipmentType: string) {
  const cleanCategory = cleanText(category).toLowerCase();
  const cleanType = cleanText(equipmentType).toLowerCase();
  const combined = `${cleanCategory} ${cleanType}`;

  if (combined.includes("water heater") || combined.includes("storage tank")) return 12;
  if (combined.includes("tankless")) return 20;
  if (combined.includes("heat pump")) return 15;
  if (combined.includes("air conditioner") || combined.includes("condenser")) return 15;
  if (combined.includes("air handler")) return 15;
  if (combined.includes("furnace")) return 20;
  if (combined.includes("boiler")) return 30;
  if (combined.includes("electrical panel") || combined.includes("service panel")) return 40;
  if (combined.includes("water softener")) return 15;
  if (combined.includes("dishwasher")) return 12;
  if (combined.includes("range") || combined.includes("oven") || combined.includes("stove")) return 15;
  if (combined.includes("refrigerator")) return 15;

  return null;
}

function getEquipmentStatus({
  condition,
  severity,
  problemPanel,
  r22,
  age,
  category,
  equipmentType,
}: {
  condition: string;
  severity: string;
  problemPanel: string;
  r22: boolean;
  age: number | null;
  category: string;
  equipmentType: string;
}) {
  if (problemPanel) return "⚠ Specialist Evaluation Recommended";
  if (r22) return "⚠ Service / Replacement Planning Recommended";

  const cleanCondition = cleanText(condition).toLowerCase();
  const cleanSeverity = cleanText(severity).toLowerCase();

  if (
    cleanSeverity.includes("safety") ||
    cleanSeverity.includes("major") ||
    cleanCondition.includes("beyond") ||
    cleanCondition.includes("failed") ||
    cleanCondition.includes("not operating")
  ) {
    return "⚠ Monitor / Budget for Replacement";
  }

  if (
    cleanCondition.includes("repair") ||
    cleanCondition.includes("defect") ||
    cleanCondition.includes("service recommended")
  ) {
    return "⚠ Service Recommended";
  }

  const maxLife = getStatusLifeMax(category, equipmentType);
  if (age !== null && maxLife) {
    if (age > maxLife) return "⚠ Monitor / Budget for Replacement";
    if (age >= maxLife - 2) return "⚠ Monitor";
  }

  return "✓ No Specific Deficiency Noted";
}


function chooseSeverity({
  parsed,
  age,
  category,
  equipmentType,
  problemPanel,
  r22,
}: {
  parsed: EquipmentAnalysis;
  age: number | null;
  category: string;
  equipmentType: string;
  problemPanel: string;
  r22: boolean;
}) {
  if (problemPanel) return "Safety Concern";

  const maxLife = getStatusLifeMax(category, equipmentType);
  if (maxLife && age !== null) {
    if (age >= maxLife) return "Recommended Repair";
    if (age >= maxLife - 3) return "Monitor";
  }

  if (r22) return "Monitor";

  const proposed = cleanText(parsed.severity);
  if (VALID_SEVERITIES.includes(proposed)) return proposed;

  return "Informational";
}

function buildClientSummary({
  parsed,
  category,
  equipmentType,
  manufacturer,
  model,
  manufactureYear,
  age,
  expectedLife,
  lifeRemaining,
  r22,
  problemPanel,
}: {
  parsed: EquipmentAnalysis;
  category: string;
  equipmentType: string;
  manufacturer: string;
  model: string;
  manufactureYear: string;
  age: number | null;
  expectedLife: string;
  lifeRemaining: string;
  r22: boolean;
  problemPanel: string;
}) {
  const existing = cleanText(parsed.clientSummary);
  if (existing && existing.toLowerCase() !== "unknown") return existing;

  const nameParts = [manufacturer !== "Unknown" ? manufacturer : "", equipmentType || "equipment"]
    .filter(Boolean)
    .join(" ");

  if (problemPanel) {
    return `The electrical panel appears to be a ${problemPanel} type panel. These panels are commonly considered a concern in residential inspections, and evaluation by a qualified electrical contractor is recommended.`;
  }

  const ageText = age !== null ? `It appears to be approximately ${age} years old` : "The exact age could not be confirmed from the photo";
  const yearText = manufactureYear && manufactureYear !== "Unknown" ? `, with a manufacture year of ${manufactureYear}` : "";
  const modelText = model && model !== "Unknown" ? ` Model number: ${model}.` : "";

  let summary = `The ${nameParts} was reviewed from the equipment photo. ${ageText}${yearText}. Typical industry service-life range is ${expectedLife}.${modelText}`;

  if (r22) {
    summary += " The system appears to use R-22 refrigerant, which is obsolete and can be expensive or difficult to service. Budgeting for future replacement should be considered.";
  }

  return summary;
}


function parseTonnageFromModel(modelValue: any) {
  const model = cleanText(modelValue).toUpperCase();
  if (!model || model === "UNKNOWN") return "Unknown";

  const match = model.match(/(?:^|[^0-9])(18|24|30|36|42|48|60)(?:[^0-9]|$)/);
  if (!match) return "Unknown";

  const btu = Number(match[1]) * 1000;
  const tons = btu / 12000;

  return `${btu.toLocaleString()} BTU / ${tons} ton${tons === 1 ? "" : "s"}`;
}

function estimateSEER({ age, refrigerant, category }: { age: number | null; refrigerant: string; category: string }) {
  if (category !== "cooling") return "Unknown";

  const ref = refrigerant.toLowerCase();

  if (age === null) {
    if (ref.includes("r-22") || ref.includes("r22")) return "Likely older/lower efficiency";
    if (ref.includes("410")) return "Likely 13+ SEER";
    return "Unknown";
  }

  const year = getCurrentYear() - age;

  if (year >= 2023) return "Likely SEER2 rated; verify label/manual";
  if (year >= 2015) return "Approx. 14+ SEER if code-minimum or better";
  if (year >= 2006) return "Approx. 13+ SEER if code-minimum or better";
  return "Likely 10 SEER or lower";
}

function estimateAFUE({ age, category, fuelType }: { age: number | null; category: string; fuelType: string }) {
  if (category !== "heating") return "Unknown";

  const fuel = fuelType.toLowerCase();
  if (!fuel.includes("gas") && !fuel.includes("oil") && !fuel.includes("propane")) {
    return "Unknown";
  }

  if (age === null) return "Unknown; verify equipment label";

  const year = getCurrentYear() - age;
  if (year >= 2015) return "Typically 80%-96% AFUE depending on furnace type";
  if (year >= 1992) return "Typically 78%-90% AFUE depending on furnace type";
  return "Older/lower efficiency likely";
}

function estimateBTU({ parsed, category }: { parsed: EquipmentAnalysis; category: string }) {
  const visibleCapacity = cleanText(parsed.capacity);
  if (visibleCapacity && visibleCapacity.toLowerCase() !== "unknown") return visibleCapacity;

  if (category === "hvac" || category === "heating") {
    const fromModel = parseTonnageFromModel(parsed.model);
    if (fromModel !== "Unknown") return fromModel;
  }

  return "Unknown";
}

function getBudgetPlanning({ age, category, condition, r22, problemPanel }: { age: number | null; category: string; condition: string; r22: boolean; problemPanel: string }) {
  if (problemPanel) return "Specialist evaluation recommended";
  if (r22) return "Budget for future replacement due to obsolete refrigerant";

  const cond = condition.toLowerCase();
  if (cond.includes("beyond")) return "Replacement should be anticipated";
  if (cond.includes("near end")) return "Budget for replacement in the coming years";

  if (age !== null) {
    const maxLife = getStatusLifeMax(category, "");
    if (maxLife && age >= maxLife) return "Replacement should be anticipated";
    if (maxLife && age >= maxLife - 3) return "Budget for replacement in the coming years";
  }

  return "Routine maintenance recommended";
}

function getMaintenanceLevel({ age, category, condition, r22, problemPanel }: { age: number | null; category: string; condition: string; r22: boolean; problemPanel: string }) {
  if (problemPanel) return "High - specialist evaluation recommended";
  if (r22) return "Elevated - obsolete refrigerant may increase service cost";

  const cond = condition.toLowerCase();
  if (cond.includes("beyond") || cond.includes("near end")) return "Elevated - monitor closely and budget for replacement";

  if (age !== null) {
    const maxLife = getStatusLifeMax(category, "");
    if (maxLife && age >= maxLife - 3) return "Elevated - approaching typical service life";
  }

  if (category === "water_heater") return "Normal - recommend periodic inspection and maintenance";
  if (category === "hvac" || category === "heating") return "Normal - recommend annual HVAC service";
  if (category === "appliance") return "Normal - maintain per manufacturer instructions";

  return "Normal";
}



function normalizeManufacturer(value: any) {
  const clean = cleanText(value);
  const lower = clean.toLowerCase();

  if (!clean) return "";

  if (
    lower.includes("a.o. smith") ||
    lower.includes("ao smith") ||
    lower.includes("a o smith")
  ) {
    return "A.O. Smith";
  }

  if (lower.includes("rheem")) return "Rheem";
  if (lower.includes("ruud")) return "Ruud";
  if (lower.includes("bradford white")) return "Bradford White";
  if (lower.includes("goodman")) return "Goodman";
  if (lower.includes("amana")) return "Amana";
  if (lower.includes("daikin")) return "Daikin";
  if (lower.includes("carrier")) return "Carrier";
  if (lower.includes("bryant")) return "Bryant";
  if (lower.includes("trane")) return "Trane";
  if (lower.includes("american standard")) return "American Standard";
  if (lower.includes("lennox")) return "Lennox";
  if (lower.includes("york")) return "York";
  if (lower.includes("nordyne")) return "Nordyne";
  if (lower.includes("intertherm")) return "Intertherm";
  if (lower.includes("frigidaire")) return "Frigidaire";
  if (lower.includes("whirlpool")) return "Whirlpool";
  if (lower.includes("ge appliances") || lower === "ge") return "GE";
  if (lower.includes("samsung")) return "Samsung";
  if (lower.includes("lg")) return "LG";
  if (lower.includes("siemens")) return "Siemens";
  if (lower.includes("square d")) return "Square D";
  if (lower.includes("eaton")) return "Eaton";
  if (lower.includes("cutler")) return "Cutler-Hammer";

  return clean;
}

function inferEquipmentCategory(parsed: EquipmentAnalysis) {
  const combined = [
    parsed.equipmentType,
    parsed.equipmentCategory,
    parsed.manufacturer,
    parsed.model,
    parsed.section,
    parsed.clientSummary,
  ]
    .map((value) => cleanText(value).toLowerCase())
    .join(" ");

  if (
    combined.includes("water heater") ||
    combined.includes("storage tank") ||
    combined.includes("tankless")
  ) {
    return "water_heater";
  }

  if (
    combined.includes("heat pump") ||
    combined.includes("air conditioner") ||
    combined.includes("condenser") ||
    combined.includes("air handler") ||
    combined.includes("furnace") ||
    combined.includes("hvac") ||
    combined.includes("cooling") ||
    combined.includes("heating")
  ) {
    return "hvac";
  }

  if (
    combined.includes("electrical panel") ||
    combined.includes("service panel") ||
    combined.includes("breaker panel") ||
    combined.includes("panelboard")
  ) {
    return "electrical";
  }

  if (
    combined.includes("dishwasher") ||
    combined.includes("range") ||
    combined.includes("oven") ||
    combined.includes("stove") ||
    combined.includes("refrigerator") ||
    combined.includes("microwave") ||
    combined.includes("appliance")
  ) {
    return "appliance";
  }

  if (
    combined.includes("water softener") ||
    combined.includes("softener") ||
    combined.includes("filter") ||
    combined.includes("well pump")
  ) {
    return "plumbing";
  }

  return "general";
}

function enhanceAnalysis(parsed: EquipmentAnalysis) {
  const category = inferEquipmentCategory(parsed);
  const manufacturer = normalizeManufacturer(parsed.manufacturer);
  const equipmentType = cleanText(parsed.equipmentType) ||
    (category === "hvac"
      ? "HVAC Equipment"
      : category === "water_heater"
      ? "Water Heater"
      : category === "electrical"
      ? "Electrical Equipment"
      : category === "appliance"
      ? "Appliance"
      : "Equipment");

  const model = cleanText(parsed.model) || "Unknown";
  const serial = cleanText(parsed.serial) || "Unknown";

  const serialYearNumber = decodeManufactureYearFromSerial({
    manufacturer,
    serial: cleanText(parsed.serial),
  });
  const manufactureYearNumber = getFirstYear(parsed.manufactureYear) ?? serialYearNumber;
  const ageFromYear = getAgeFromYear(manufactureYearNumber);
  const parsedAgeNumber = Number(cleanText(parsed.estimatedAge).replace(/[^0-9.-]/g, ""));
  const age = ageFromYear ?? (Number.isFinite(parsedAgeNumber) && parsedAgeNumber > 0 ? parsedAgeNumber : null);

  const manufactureYear = manufactureYearNumber
    ? String(manufactureYearNumber)
    : cleanText(parsed.manufactureYear) || "Unknown";

  const expectedServiceLife = cleanText(parsed.expectedServiceLife) || getExpectedLife(category, equipmentType);
  const estimatedLifeRemaining =
    cleanText(parsed.estimatedLifeRemaining) && cleanText(parsed.estimatedLifeRemaining).toLowerCase() !== "unknown"
      ? cleanText(parsed.estimatedLifeRemaining)
      : estimateLifeRemaining(age, category, equipmentType);

  const r22 = hasR22(parsed);
  const problemPanel = hasProblemPanel(parsed);
  const condition = problemPanel || getAgeCondition(age, category, equipmentType);
  const section = chooseSection(parsed, category);
  const severity = chooseSeverity({
    parsed,
    age,
    category,
    equipmentType,
    problemPanel,
    r22,
  });

  const equipmentStatus = cleanText(parsed.equipmentStatus) || getEquipmentStatus({
    condition,
    severity,
    problemPanel,
    r22,
    age,
    category,
    equipmentType,
  });

  const estimatedBTU = estimateBTU({ parsed, category });
  const refrigerantValue = cleanText(parsed.refrigerant) || (r22 ? "R-22" : "Unknown");
  const estimatedSEER = cleanText(parsed.estimatedSEER) || estimateSEER({ age, refrigerant: refrigerantValue, category });
  const estimatedAFUE = cleanText(parsed.estimatedAFUE) || estimateAFUE({ age, category, fuelType: cleanText(parsed.fuelType) });
  const equipmentCategory = cleanText(parsed.equipmentCategory) || category.replaceAll("_", " ");
  const budgetPlanning =
    cleanText(parsed.budgetPlanning) ||
    getBudgetPlanning({
      age,
      category,
      condition,
      r22,
      problemPanel,
    });

  const clientSummary = buildClientSummary({
    parsed,
    category,
    equipmentType,
    manufacturer,
    model,
    manufactureYear,
    age,
    expectedLife: expectedServiceLife,
    lifeRemaining: estimatedLifeRemaining,
    r22,
    problemPanel,
  });

  let observation = cleanText(parsed.observation);
  let implication = cleanText(parsed.implication);
  let recommendation = cleanText(parsed.recommendation);

  if (!observation || observation.toLowerCase() === "unknown") {
    observation = `${manufacturer !== "Unknown" ? manufacturer + " " : ""}${equipmentType} was observed. Model: ${model}. Serial: ${serial}.`;
  }

  if (problemPanel) {
    observation = `The electrical panel appears to be a ${problemPanel} type panel.`;
    implication = "These panels are commonly associated with reliability and safety concerns and should be further evaluated.";
    recommendation = "Recommend evaluation by a qualified electrical contractor. Replacement may be recommended depending on the specific panel, condition, and installation.";
  } else if (r22) {
    implication = implication || "R-22 refrigerant is obsolete and can be expensive or difficult to service.";
    recommendation = recommendation || "Recommend servicing by a qualified HVAC contractor and budgeting for future system replacement due to the obsolete refrigerant type.";
  } else if (severity === "Recommended Repair" && !recommendation) {
    recommendation = "Recommend further evaluation by the appropriate qualified contractor and budgeting for replacement due to the age or condition of the equipment.";
  } else if (severity === "Monitor" && !recommendation) {
    recommendation = "Recommend monitoring the equipment, maintaining regular service, and budgeting for replacement as it approaches the end of its typical service life.";
  }

  if (!implication || implication.toLowerCase() === "unknown") {
    implication = "Older equipment may be less efficient and may have a higher risk of repair or replacement needs as it ages.";
  }

  if (!recommendation || recommendation.toLowerCase() === "unknown") {
    recommendation = "Recommend regular maintenance and review by the appropriate qualified contractor as needed.";
  }

  const maintenanceLevel = cleanText(parsed.maintenanceLevel) || getMaintenanceLevel({
    age,
    category,
    condition,
    r22,
    problemPanel,
  });

  return {
    equipmentType,
    manufacturer,
    model,
    serial,
    manufactureYear,
    estimatedAge: age !== null ? `${age} years` : cleanText(parsed.estimatedAge) || "Unknown",
    expectedServiceLife,
    estimatedSEER,
    estimatedAFUE,
    estimatedBTU,
    equipmentCategory,
    budgetPlanning,
    maintenanceLevel,
    efficiency: cleanText(parsed.efficiency) || "Unknown",
    capacity: estimatedBTU || cleanText(parsed.capacity) || "Unknown",
    fuelType: cleanText(parsed.fuelType) || "Unknown",
    refrigerant: refrigerantValue,
    condition,
    estimatedLifeRemaining: "",
    clientSummary,
    section,
    severity,
    observation,
    implication,
    recommendation,
    intelligenceFlags: {
      category,
      r22Detected: r22,
      problemPanelDetected: Boolean(problemPanel),
      problemPanelType: problemPanel || null,
      ageBasedSeverityApplied: severity === "Monitor" || severity === "Recommended Repair",
    },
  };
}

export async function POST(req: Request) {
  let inspectionId: string | number | null = null;

  try {
    if (!process.env.OPENAI_API_KEY) {
      await logAIEvent({
        inspectionId,
        tool: "equipment_analyzer",
        status: "failed",
        response: {
          error: "Missing OPENAI_API_KEY",
        },
      });

      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const formData = await req.formData();

    const image = formData.get("image") as File | null;
    const inspectorNote = cleanText(
      formData.get("note") ||
        formData.get("inspectorNote") ||
        formData.get("inspector_note") ||
        ""
    );

    inspectionId =
      (formData.get("inspectionId") as string | null) ||
      (formData.get("inspection_id") as string | null) ||
      null;

    if (!image) {
      await logAIEvent({
        inspectionId,
        tool: "equipment_analyzer",
        status: "failed",
        response: {
          error: "No image uploaded",
        },
      });

      return NextResponse.json(
        { error: "No image uploaded" },
        { status: 400 }
      );
    }

    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");

    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are an expert home inspection equipment analyst and data-plate reader. Return ONLY valid JSON. Be accurate and conservative, but work hard before using Unknown. Carefully read visible labels, model numbers, serial numbers, capacity codes, refrigerant markings, manufacture dates, and brand/manufacturer markings. Use known HVAC, water heater, appliance, and electrical data-plate conventions when they are strongly supported. Never invent a serial number, model number, manufacture year, refrigerant, capacity, or fuel type. Work hard to decode visible serial/model patterns when supported by manufacturer conventions, but if a value cannot be confirmed or strongly inferred, use Unknown. Keep maintenance recommendations separate from identification notes.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Analyze this equipment photo.

Inspector-provided context, if any: ${inspectorNote || "None"}

Return ONLY valid JSON in this exact format:

{
  "equipmentType": "",
  "manufacturer": "",
  "model": "",
  "serial": "",
  "manufactureYear": "",
  "estimatedAge": "",
  "expectedServiceLife": "",
  "estimatedSEER": "",
  "estimatedAFUE": "",
  "estimatedBTU": "",
  "equipmentCategory": "",
  "budgetPlanning": "",
  "maintenanceLevel": "",
  "equipmentStatus": "",
  "efficiency": "",
  "capacity": "",
  "fuelType": "",
  "refrigerant": "",
  "condition": "",
  "estimatedLifeRemaining": "",
  "clientSummary": "",
  "section": "",
  "severity": "",
  "observation": "",
  "implication": "",
  "recommendation": ""
}

Section must be one of:
Exterior, Roof, Basement, Foundation, Crawlspace & Structure, Heating, Cooling, Plumbing, Electrical, Attic, Insulation & Ventilation, Doors, Windows & Interior, Built-in Appliances, Garage, General.

Severity must be one of:
Informational, Monitor, Maintenance, Recommended Repair, Safety Concern, Major Concern.

Equipment classification rules:
- Furnace, boiler, air handler, or heating equipment = Heating
- AC condenser, heat pump, mini split, or cooling equipment = Cooling
- Electrical panel, disconnect, breaker, service equipment = Electrical
- Water heater, tankless water heater, expansion tank, or plumbing equipment = Plumbing
- Dishwasher, refrigerator, range, oven, cooktop, garbage disposal = Built-in Appliances
- Garage door equipment = Garage

Enhanced intelligence rules:
- Carefully extract manufacturer, model, and serial only when visible.
- If information is not visible, use "Unknown".
- Do not guess manufacture year unless the label, serial number pattern, or visible date clearly supports it.
- If visible, identify refrigerant type, especially R-22, HCFC-22, R410A, R-410A, R32, or R454B.
- Flag R-22 or HCFC-22 as obsolete refrigerant.
- Equipment status should be client-friendly, such as: ✓ No Specific Deficiency Noted, ⚠ Monitor, ⚠ Service Recommended, ⚠ Monitor / Budget for Replacement, or ⚠ Specialist Evaluation Recommended.
- Estimate expected service life conservatively:
  - Central AC condenser: 12-15 years
  - Heat pump: 10-15 years
  - Furnace: 15-20 years
  - Boiler: 20-30 years
  - Tank water heater: 8-12 years
  - Tankless water heater: 15-20 years
  - Built-in appliances: 8-15 years
- Do not estimate exact remaining life. Use typical industry service-life ranges only. Never promise or predict remaining life.
- Estimate SEER/SEER2 only conservatively from visible label information or equipment age. If not visible, state approximate/verify.
- Estimate AFUE only for gas/oil/propane heating equipment when reasonable. If not visible, state approximate/verify.
- Estimate BTU/tonnage from visible capacity or model number only when supported. Common AC model numbers include 18=1.5 ton, 24=2 ton, 30=2.5 ton, 36=3 ton, 42=3.5 ton, 48=4 ton, 60=5 ton.
- Do not provide dollar amounts or replacement cost ranges. Use budget planning language only, such as "Routine maintenance recommended", "Budget for replacement in the coming years", or "Replacement should be anticipated."
- Provide maintenance level: Low, Normal, Elevated, or High with short reason.
- If equipment appears near or beyond a typical industry service-life range, explain that budgeting for future replacement may be prudent without predicting exact remaining life.
- If the photo shows Federal Pacific, FPE, Stab-Lok, Zinsco, Challenger, or Pushmatic electrical equipment, mark severity as Safety Concern and recommend electrician evaluation.
- Recommendations should be clear, professional, and not overly alarmist.
- Client summary should be easy for a homebuyer to understand.
              `,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.type};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    });

    const text = result.choices[0]?.message?.content || "{}";

    let parsed: EquipmentAnalysis;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        error: "AI did not return valid JSON",
        raw: text,
      };
    }

    const enhanced = parsed?.error ? parsed : enhanceAnalysis(parsed || {});

    await logAIEvent({
      inspectionId,
      tool: "equipment_analyzer",
      prompt: "Equipment Analyzer expanded intelligence photo analysis",
      response: {
        equipmentType: enhanced?.equipmentType,
        manufacturer: enhanced?.manufacturer,
        model: enhanced?.model,
        serial: enhanced?.serial,
        manufactureYear: enhanced?.manufactureYear,
        estimatedAge: enhanced?.estimatedAge,
        expectedServiceLife: (enhanced as any)?.expectedServiceLife,
        estimatedLifeRemaining: enhanced?.estimatedLifeRemaining,
        refrigerant: enhanced?.refrigerant,
        estimatedSEER: (enhanced as any)?.estimatedSEER,
        estimatedAFUE: (enhanced as any)?.estimatedAFUE,
        estimatedBTU: (enhanced as any)?.estimatedBTU,
        budgetPlanning: (enhanced as any)?.budgetPlanning,
        maintenanceLevel: (enhanced as any)?.maintenanceLevel,
        section: enhanced?.section,
        severity: enhanced?.severity,
        intelligenceFlags: (enhanced as any)?.intelligenceFlags,
      },
      tokensUsed: result.usage?.total_tokens ?? null,
      status: parsed?.error ? "failed" : "success",
    });

    return NextResponse.json(enhanced);
  } catch (error: any) {
    console.error("Analyze equipment error:", error);

    await logAIEvent({
      inspectionId,
      tool: "equipment_analyzer",
      status: "failed",
      response: {
        error: error?.message || "Failed to analyze equipment",
      },
    });

    return NextResponse.json(
      {
        error: error?.message || "Failed to analyze equipment",
      },
      { status: 500 }
    );
  }
}
