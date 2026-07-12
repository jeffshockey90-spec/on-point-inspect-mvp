import { NextResponse } from "next/server";
import { logAIEvent } from "../../../lib/logging";
import { getAIModel, getAIVersion } from "../../../lib/openai";
import { inspectionBrain } from "../../../lib/ai";

export const runtime = "nodejs";

const AI_EQUIPMENT_MODEL = getAIModel();
const AI_EQUIPMENT_VERSION = getAIVersion("equipment-intelligence");

type EquipmentAnalysis = {
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
  estimatedHeatingEfficiency?: string;
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
  notes?: string;
  ocrQuality?: "Excellent" | "Good" | "Fair" | "Poor" | string;
  confidenceScore?: number | string;
  reviewRequired?: boolean;
  aiReasoning?: string;
  fieldConfidence?: Record<string, number | string>;
  evidence?: Record<string, string[]>;
  reviewFlags?: string[];
  crossChecks?: string[];
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

function isKnown(value: any) {
  const clean = cleanText(value);
  if (!clean) return false;

  return ![
    "unknown",
    "n/a",
    "na",
    "none",
    "null",
    "undefined",
    "not visible",
    "not readable",
    "unreadable",
    "unable to determine",
    "cannot determine",
  ].includes(clean.toLowerCase());
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
  if (lower.includes("payne")) return "Payne";
  if (lower.includes("tempstar")) return "Tempstar";
  if (lower.includes("heil")) return "Heil";
  if (lower.includes("comfortmaker")) return "Comfortmaker";
  if (lower.includes("arcoaire")) return "Arcoaire";
  if (lower.includes("keeprite") || lower.includes("keep rite")) return "KeepRite";
  if (lower.includes("day & night") || lower.includes("day and night")) return "Day & Night";
  if (lower.includes("international comfort products") || lower === "icp") return "ICP";
  if (lower.includes("trane")) return "Trane";
  if (lower.includes("american standard")) return "American Standard";
  if (lower.includes("lennox")) return "Lennox";
  if (lower.includes("york")) return "York";
  if (lower.includes("coleman")) return "Coleman";
  if (lower.includes("luxaire")) return "Luxaire";
  if (lower.includes("nordyne")) return "Nordyne";
  if (lower.includes("nortek")) return "Nortek";
  if (lower.includes("intertherm")) return "Intertherm";
  if (lower.includes("miller")) return "Miller";
  if (lower.includes("gibson")) return "Gibson";
  if (lower.includes("frigidaire")) return "Frigidaire";
  if (lower.includes("westinghouse")) return "Westinghouse";
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

  function yearFromTwoDigits(value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 99) return null;
    const year = value <= currentTwoDigitYear + 1 ? 2000 + value : 1900 + value;
    if (year < 1980 || year > currentYear + 1) return null;
    return year;
  }

  function monthIsValid(value: number) {
    return Number.isFinite(value) && value >= 1 && value <= 12;
  }

  function weekIsValid(value: number) {
    return Number.isFinite(value) && value >= 1 && value <= 53;
  }

  function yearFromFourDigitsAt(startIndex: number) {
    const year = Number(cleanSerial.slice(startIndex, startIndex + 4));
    if (!Number.isFinite(year) || year < 1980 || year > currentYear + 1) return null;
    return year;
  }

  // Some data plates include a plain four-digit manufacture year in or near the serial.
  for (let index = 0; index <= cleanSerial.length - 4; index += 1) {
    const possibleYear = yearFromFourDigitsAt(index);
    if (possibleYear) return possibleYear;
  }

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
    const year = yearFromTwoDigits(yy);
    if (year && weekIsValid(ww)) return year;
  }

  if (brand.includes("bradford white")) {
    const yearCodeMap: Record<string, number[]> = {
      A: [1984, 2004, 2024], B: [1985, 2005, 2025], C: [1986, 2006, 2026],
      D: [1987, 2007], E: [1988, 2008], F: [1989, 2009], G: [1990, 2010],
      H: [1991, 2011], J: [1992, 2012], K: [1993, 2013], L: [1994, 2014],
      M: [1995, 2015], N: [1996, 2016], P: [1997, 2017], S: [1998, 2018],
      T: [1999, 2019], W: [2000, 2020], X: [2001, 2021], Y: [2002, 2022],
      Z: [2003, 2023],
    };
    const possibleYears = yearCodeMap[cleanSerial.charAt(0)] || [];
    const bestYear = possibleYears.filter((year) => year <= currentYear + 1).sort((a, b) => b - a)[0];
    if (bestYear) return bestYear;
  }

  if (brand.includes("goodman") || brand.includes("amana") || brand.includes("daikin")) {
    const yy = Number(cleanSerial.slice(0, 2));
    const mm = Number(cleanSerial.slice(2, 4));
    const year = yearFromTwoDigits(yy);
    if (year && monthIsValid(mm)) return year;
  }

  if (brand.includes("rheem") || brand.includes("ruud")) {
    const mm = Number(cleanSerial.slice(0, 2));
    const yy = Number(cleanSerial.slice(2, 4));
    const year = yearFromTwoDigits(yy);
    if (year && monthIsValid(mm)) return year;
  }

  if (
    brand.includes("carrier") ||
    brand.includes("bryant") ||
    brand.includes("payne") ||
    brand.includes("tempstar") ||
    brand.includes("heil") ||
    brand.includes("comfortmaker") ||
    brand.includes("arcoaire") ||
    brand.includes("keeprite") ||
    brand.includes("keep rite") ||
    brand.includes("day & night") ||
    brand.includes("day and night") ||
    brand.includes("international comfort products") ||
    brand === "icp"
  ) {
    // Carrier/Bryant/Payne commonly use WWYY. ICP-family brands may use WWYY or a plant letter followed by YY.
    const ww = Number(cleanSerial.slice(0, 2));
    const yy = Number(cleanSerial.slice(2, 4));
    const year = yearFromTwoDigits(yy);
    if (year && weekIsValid(ww)) return year;

    const yyAfterPlantCode = Number(cleanSerial.slice(1, 3));
    const plantCodeYear = yearFromTwoDigits(yyAfterPlantCode);
    if (plantCodeYear) return plantCodeYear;
  }

  if (brand.includes("trane") || brand.includes("american standard")) {
    const yy = Number(cleanSerial.slice(0, 2));
    const year = yearFromTwoDigits(yy);
    if (year) return year;
  }

  if (brand.includes("lennox")) {
    const yy = Number(cleanSerial.slice(0, 2));
    const year = yearFromTwoDigits(yy);
    if (year) return year;
  }

  if (brand.includes("york") || brand.includes("coleman") || brand.includes("luxaire")) {
    // Many York/Coleman/Luxaire serials use a plant letter followed by a two-digit year.
    const yy = Number(cleanSerial.slice(1, 3));
    const year = yearFromTwoDigits(yy);
    if (year) return year;

    const yyAtStart = Number(cleanSerial.slice(0, 2));
    const fallbackYear = yearFromTwoDigits(yyAtStart);
    if (fallbackYear) return fallbackYear;
  }

  if (
    brand.includes("nordyne") ||
    brand.includes("nortek") ||
    brand.includes("intertherm") ||
    brand.includes("miller") ||
    brand.includes("gibson") ||
    brand.includes("frigidaire") ||
    brand.includes("westinghouse")
  ) {
    // Nortek/Nordyne family data plates commonly encode the year in the first two digits,
    // and some use MMYY. Use only patterns that also contain a valid month when needed.
    const yy = Number(cleanSerial.slice(0, 2));
    const mm = Number(cleanSerial.slice(2, 4));
    const year = yearFromTwoDigits(yy);
    if (year && monthIsValid(mm)) return year;

    const mmFirst = Number(cleanSerial.slice(0, 2));
    const yySecond = Number(cleanSerial.slice(2, 4));
    const mmYear = yearFromTwoDigits(yySecond);
    if (mmYear && monthIsValid(mmFirst)) return mmYear;
  }

  return null;
}

function inferCategory(parsed: EquipmentAnalysis) {
  const combined = [
    parsed.equipmentType,
    parsed.equipmentCategory,
    parsed.manufacturer,
    parsed.model,
    parsed.section,
    parsed.clientSummary,
    parsed.observation,
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

function chooseSection(parsed: EquipmentAnalysis, category: string) {
  const explicit = cleanText(parsed.section);
  if (VALID_SECTIONS.includes(explicit)) return explicit;

  if (category === "water_heater" || category === "plumbing") return "Plumbing";
  if (category === "electrical") return "Electrical";
  if (category === "appliance") return "Built-in Appliances";

  if (category === "hvac") {
    const text = [
      parsed.equipmentType,
      parsed.equipmentCategory,
      parsed.model,
      parsed.clientSummary,
    ]
      .map((value) => cleanText(value).toLowerCase())
      .join(" ");

    if (
      text.includes("air conditioner") ||
      text.includes("condenser") ||
      text.includes("cooling")
    ) {
      return "Cooling";
    }

    return "Heating";
  }

  return "General";
}

function getExpectedLife(category: string, equipmentType: string) {
  const combined = `${category} ${cleanText(equipmentType).toLowerCase()}`;

  if (combined.includes("tankless")) return "15–20 years";
  if (combined.includes("water heater") || combined.includes("storage tank") || category === "water_heater") return "8–12 years";
  if (combined.includes("heat pump")) return "10–15 years";
  if (combined.includes("air conditioner") || combined.includes("condenser")) return "10–15 years";
  if (combined.includes("air handler")) return "10–15 years";
  if (combined.includes("furnace")) return "15–20 years";
  if (combined.includes("boiler")) return "20–30 years";
  if (category === "electrical" || combined.includes("electrical panel") || combined.includes("service panel")) return "30–40 years";
  if (combined.includes("water softener")) return "10–15 years";
  if (combined.includes("dishwasher")) return "9–12 years";
  if (combined.includes("range") || combined.includes("oven") || combined.includes("stove")) return "13–15 years";
  if (combined.includes("refrigerator")) return "10–15 years";

  return "Typical service life varies";
}

function getLifeMax(category: string, equipmentType: string) {
  const expected = getExpectedLife(category, equipmentType);
  const matches = expected.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const last = Number(matches[matches.length - 1]);
  return Number.isFinite(last) ? last : null;
}

function parseTonnageFromModel(modelValue: any) {
  const model = cleanText(modelValue).toUpperCase();
  if (!model || model === "UNKNOWN") return "";

  const match = model.match(/(?:^|[^0-9])(18|24|30|36|42|48|60)(?:[^0-9]|$)/);
  if (!match) return "";

  const btu = Number(match[1]) * 1000;
  const tons = btu / 12000;

  return `${tons} Ton`;
}



function hasR22(parsed: EquipmentAnalysis) {
  const combined = [
    parsed.refrigerant,
    parsed.clientSummary,
    parsed.condition,
    parsed.recommendation,
    parsed.notes,
  ]
    .map((value) => cleanText(value).toLowerCase())
    .join(" ");

  return combined.includes("r-22") || combined.includes("r22") || combined.includes("hcfc-22");
}

function hasProblemPanel(parsed: EquipmentAnalysis) {
  const combined = [
    parsed.equipmentType,
    parsed.equipmentCategory,
    parsed.manufacturer,
    parsed.model,
    parsed.clientSummary,
    parsed.condition,
    parsed.recommendation,
    parsed.notes,
  ]
    .map((value) => cleanText(value).toLowerCase())
    .join(" ");

  if (
    combined.includes("federal pacific") ||
    combined.includes("stab-lok") ||
    combined.includes("zinsco") ||
    combined.includes("sylvani") ||
    combined.includes("challenger panel")
  ) {
    return "Panel brand/model may be associated with known safety concerns. Recommend evaluation by a qualified electrical contractor.";
  }

  return "";
}

function getAgeCondition(age: number | null, category: string, equipmentType: string) {
  if (age === null || age === undefined || !Number.isFinite(age)) {
    return "No specific deficiency noted";
  }

  const maxLife = getLifeMax(category, equipmentType);
  if (!maxLife) return "No specific deficiency noted";

  if (age > maxLife) return "At or beyond typical industry range";
  if (age >= maxLife - 2) return "Near upper end of typical industry range";

  return "No specific deficiency noted";
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

  const proposed = cleanText(parsed.severity);
  if (VALID_SEVERITIES.includes(proposed)) return proposed;

  const condition = cleanText(parsed.condition).toLowerCase();

  if (
    condition.includes("failed") ||
    condition.includes("not operating") ||
    condition.includes("safety") ||
    condition.includes("major")
  ) {
    return "Recommended Repair";
  }

  if (r22) return "Monitor";

  const maxLife = getLifeMax(category, equipmentType);
  if (maxLife && age !== null && age >= maxLife - 2) return "Monitor";

  if (
    condition.includes("service") ||
    condition.includes("repair") ||
    condition.includes("defect")
  ) {
    return "Maintenance";
  }

  return "Informational";
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
  if (problemPanel) {
    return "⚠ Specialist Evaluation Recommended";
  }

  if (r22) {
    return "⚠ Older Equipment – Monitor";
  }

  const cleanCondition = cleanText(condition).toLowerCase();

  if (
    cleanCondition.includes("failed") ||
    cleanCondition.includes("not operating") ||
    cleanCondition.includes("unsafe")
  ) {
    return "⚠ Service Recommended";
  }

  const maxLife = getLifeMax(category, equipmentType);

  if (age !== null && maxLife && age >= maxLife - 2) {
    return "⚠ Older Equipment – Monitor";
  }

  return "✓ No Specific Deficiency Noted";
}


function getMaintenanceLevel({
  age,
  category,
  condition,
  r22,
  problemPanel,
}: {
  age: number | null;
  category: string;
  condition: string;
  r22: boolean;
  problemPanel: string;
}) {
  if (problemPanel) return "High - specialist evaluation recommended";
  if (r22) return "Elevated - obsolete refrigerant may increase service cost";

  const cond = cleanText(condition).toLowerCase();

  if (
    cond.includes("beyond") ||
    cond.includes("failed") ||
    cond.includes("not operating") ||
    cond.includes("near upper") ||
    cond.includes("service") ||
    cond.includes("repair")
  ) {
    return "Elevated - monitor and service as needed";
  }

  if (age !== null) {
    const maxLife = getLifeMax(category, "");
    if (maxLife && age >= maxLife - 2) {
      return "Elevated - approaching upper end of typical industry range";
    }
  }

  if (category === "water_heater") {
    return "Normal - recommend routine water heater maintenance";
  }

  if (category === "hvac") {
    return "Normal - recommend routine HVAC service";
  }

  if (category === "appliance") {
    return "Normal - maintain per manufacturer instructions";
  }

  return "Normal - routine maintenance recommended";
}

function getBudgetPlanning({
  age,
  category,
  condition,
  r22,
  problemPanel,
}: {
  age: number | null;
  category: string;
  condition: string;
  r22: boolean;
  problemPanel: string;
}) {
  if (problemPanel) return "Specialist evaluation recommended";
  if (r22) return "Budget planning may be prudent due to obsolete refrigerant";

  const cond = cleanText(condition).toLowerCase();

  if (
    cond.includes("beyond") ||
    cond.includes("failed") ||
    cond.includes("not operating")
  ) {
    return "Budget planning is recommended";
  }

  if (age !== null) {
    const maxLife = getLifeMax(category, "");
    if (maxLife && age > maxLife) return "Monitor and budget as needed";
    if (maxLife && age >= maxLife - 2) return "Monitor as the equipment ages";
  }

  return "Routine maintenance recommended";
}

function estimateSEER({ age, refrigerant, category }: { age: number | null; refrigerant: string; category: string }) {
  if (category !== "hvac") return "Unknown";

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
  if (category !== "hvac") return "Unknown";

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


function estimateHeatingEfficiency({
  category,
  equipmentType,
  fuelType,
}: {
  category: string;
  equipmentType: string;
  fuelType: string;
}) {
  const text = `${category} ${equipmentType} ${fuelType}`.toLowerCase();

  if (!text.includes("heat pump")) return "Unknown";

  return "Heat pump heating efficiency varies by model; verify equipment label/manual.";
}

function buildNarrativeEquipmentSummary({
  equipmentType,
  manufacturer,
  model,
  manufactureYear,
  capacity,
  fuelType,
  refrigerant,
  category,
  r22,
  problemPanel,
}: {
  equipmentType: string;
  manufacturer: string;
  model: string;
  manufactureYear: string;
  capacity: string;
  fuelType: string;
  refrigerant: string;
  category: string;
  r22: boolean;
  problemPanel: string;
}) {
  if (problemPanel) {
    return "Electrical panel equipment was documented from the visible data plate. Evaluation by a qualified electrical contractor is recommended due to the panel type/brand observed.";
  }

  const sentences: string[] = [];

  const cleanManufacturer = isKnown(manufacturer) ? manufacturer : "";
  const cleanType = isKnown(equipmentType) ? equipmentType : "Equipment";
  const cleanModel = isKnown(model) ? model : "";
  const cleanYear = isKnown(manufactureYear) ? manufactureYear : "";
  const cleanCapacity = isKnown(capacity) ? capacity : "";
  const cleanFuel = isKnown(fuelType) ? String(fuelType).toLowerCase() : "";
  const cleanRefrigerant = isKnown(refrigerant) ? refrigerant : "";

  const title = [cleanManufacturer, cleanType]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  sentences.push(title ? `${title}.` : "Equipment data plate was documented.");

  if (cleanModel && cleanYear) {
    sentences.push(`Model ${cleanModel}, manufactured in ${cleanYear}.`);
  } else if (cleanModel) {
    sentences.push(`Model ${cleanModel}.`);
  } else if (cleanYear) {
    sentences.push(`Manufactured in ${cleanYear}.`);
  }

  const detailParts: string[] = [];

  if (cleanCapacity && cleanFuel) {
    detailParts.push(`${cleanCapacity} ${cleanFuel} unit`);
  } else if (cleanCapacity) {
    detailParts.push(`${cleanCapacity} capacity`);
  } else if (cleanFuel) {
    detailParts.push(`${cleanFuel} unit`);
  }

  if (cleanRefrigerant && category === "hvac") {
    detailParts.push(`using ${cleanRefrigerant} refrigerant`);
  }

  if (detailParts.length > 0) {
    sentences.push(
      detailParts.join(" and ").replace(/\s+/g, " ").trim() + "."
    );
  }

  if (r22) {
    sentences.push("The system appears to use R-22 refrigerant.");
  } else {
    sentences.push("Unit appeared functional at the time of inspection.");
  }

  return sentences.join("\n\n");
}



function isEquipmentMetadataDump(value: any) {
  const clean = cleanText(value);
  const lower = clean.toLowerCase();

  if (!clean) return false;

  const metadataHits = [
    "equipment type",
    "manufacturer",
    "model number",
    "model:",
    "serial number",
    "serial:",
    "manufacture year",
    "estimated age",
    "typical industry range",
    "estimated seer",
    "estimated afue",
    "estimated btu",
    "equipment status",
    "inspector note",
    "maintenance note",
    "fuel type",
    "capacity",
    "refrigerant",
  ].filter((term) => lower.includes(term)).length;

  return metadataHits >= 3 || clean.length > 450;
}

function buildCleanObservation({
  manufacturer,
  equipmentType,
}: {
  manufacturer: string;
  equipmentType: string;
}) {
  const name = [manufacturer, equipmentType]
    .filter((value) => isKnown(value))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return name ? `${name} data plate was documented.` : "Equipment data plate was documented.";
}

function buildCleanImplication({
  age,
  category,
  equipmentType,
  severity,
  condition,
}: {
  age: number | null;
  category: string;
  equipmentType: string;
  severity: string;
  condition: string;
}) {
  const cleanSeverity = cleanText(severity).toLowerCase();
  const cleanCondition = cleanText(condition).toLowerCase();
  const maxLife = getLifeMax(category, equipmentType);

  if (
    cleanSeverity.includes("major") ||
    cleanSeverity.includes("safety") ||
    cleanCondition.includes("failed") ||
    cleanCondition.includes("not operating")
  ) {
    return "Potential impact to normal operation or safety.";
  }

  if (age !== null && maxLife && age >= maxLife - 2) {
    return `${equipmentType} is approximately ${age} years old and is near the upper end of its typical service-life range.`;
  }

  return "No significant deficiency was determined from the available equipment information.";
}

function buildCleanRecommendation({
  age,
  category,
  equipmentType,
  severity,
  condition,
  r22,
  problemPanel,
}: {
  age: number | null;
  category: string;
  equipmentType: string;
  severity: string;
  condition: string;
  r22: boolean;
  problemPanel: string;
}) {
  const cleanSeverity = cleanText(severity).toLowerCase();
  const cleanCondition = cleanText(condition).toLowerCase();
  const maxLife = getLifeMax(category, equipmentType);

  if (problemPanel) {
    return "Evaluation by a qualified electrical contractor is recommended.";
  }

  if (r22) {
    return "Recommend servicing by a qualified HVAC contractor and budgeting for future replacement due to obsolete refrigerant.";
  }

  if (
    cleanSeverity.includes("major") ||
    cleanSeverity.includes("safety") ||
    cleanCondition.includes("failed") ||
    cleanCondition.includes("not operating") ||
    cleanCondition.includes("repair")
  ) {
    return "Further evaluation, repair, or replacement is recommended by a qualified contractor.";
  }

  if (age !== null && maxLife && age >= maxLife - 2) {
    return "Continue routine maintenance and monitor the equipment as it ages.";
  }

  return "Routine maintenance is recommended in accordance with manufacturer guidelines.";
}

function clampConfidence(value: any, fallback = 50) {
  const number = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function getOcrQualityLabel(parsed: EquipmentAnalysis, imageCount: number) {
  const explicit = cleanText(parsed.ocrQuality);
  if (["Excellent", "Good", "Fair", "Poor"].includes(explicit)) return explicit;

  const knownCoreFields = [
    parsed.manufacturer,
    parsed.model,
    parsed.serial,
    parsed.manufactureYear,
  ].filter(isKnown).length;

  if (knownCoreFields >= 3 && imageCount > 1) return "Good";
  if (knownCoreFields >= 3) return "Good";
  if (knownCoreFields >= 2) return "Fair";
  return "Poor";
}

function getFieldConfidence({
  parsed,
  manufacturer,
  model,
  serial,
  manufactureYear,
  serialYearNumber,
  category,
  imageCount,
}: {
  parsed: EquipmentAnalysis;
  manufacturer: string;
  model: string;
  serial: string;
  manufactureYear: string;
  serialYearNumber: number | null;
  category: string;
  imageCount: number;
}) {
  const provided = parsed.fieldConfidence || {};
  const baseBoost = imageCount > 1 ? 5 : 0;

  const confidence = {
    equipmentType: isKnown(parsed.equipmentType) || category !== "general" ? 82 + baseBoost : 45,
    manufacturer: isKnown(manufacturer) ? 86 + baseBoost : 35,
    model: isKnown(model) && model !== "Unknown" ? 82 + baseBoost : 30,
    serial: isKnown(serial) && serial !== "Unknown" ? 82 + baseBoost : 30,
    manufactureYear: isKnown(manufactureYear) && manufactureYear !== "Unknown" ? (serialYearNumber ? 93 : 78) : 25,
    capacity: isKnown(parsed.capacity) || isKnown(parsed.estimatedBTU) ? 78 + baseBoost : 35,
    refrigerant: isKnown(parsed.refrigerant) ? 76 + baseBoost : 35,
    fuelType: isKnown(parsed.fuelType) ? 76 + baseBoost : 35,
  };

  return Object.fromEntries(
    Object.entries(confidence).map(([key, value]) => [
      key,
      clampConfidence((provided as any)[key], Math.min(100, value)),
    ])
  );
}

function buildEvidence({
  parsed,
  manufacturer,
  model,
  serial,
  manufactureYear,
  serialYearNumber,
  category,
  r22,
  problemPanel,
}: {
  parsed: EquipmentAnalysis;
  manufacturer: string;
  model: string;
  serial: string;
  manufactureYear: string;
  serialYearNumber: number | null;
  category: string;
  r22: boolean;
  problemPanel: string;
}) {
  const evidence: Record<string, string[]> = parsed.evidence || {};

  function add(field: string, value: string) {
    if (!evidence[field]) evidence[field] = [];
    if (value && !evidence[field].includes(value)) evidence[field].push(value);
  }

  if (isKnown(manufacturer)) add("manufacturer", `Manufacturer normalized as ${manufacturer}.`);
  if (isKnown(model) && model !== "Unknown") add("model", `Visible/parsed model value: ${model}.`);
  if (isKnown(serial) && serial !== "Unknown") add("serial", `Visible/parsed serial value: ${serial}.`);
  if (serialYearNumber) add("manufactureYear", `Serial number pattern decoded to ${serialYearNumber}.`);
  if (isKnown(manufactureYear) && manufactureYear !== "Unknown") add("manufactureYear", `Final manufacture year set to ${manufactureYear}.`);
  if (category !== "general") add("equipmentType", `Equipment category inferred as ${category.replaceAll("_", " ")}.`);
  if (r22) add("refrigerant", "R-22/HCFC-22 language was detected.");
  if (problemPanel) add("safety", problemPanel);

  return evidence;
}

function buildCrossChecks({
  manufacturer,
  model,
  serial,
  manufactureYear,
  serialYearNumber,
  category,
  estimatedBTU,
}: {
  manufacturer: string;
  model: string;
  serial: string;
  manufactureYear: string;
  serialYearNumber: number | null;
  category: string;
  estimatedBTU: string;
}) {
  const checks: string[] = [];

  if (isKnown(manufacturer) && isKnown(model)) checks.push("Manufacturer and model were both available for comparison.");
  if (isKnown(serial) && serialYearNumber) checks.push("Serial number supported the decoded manufacture year.");
  if (isKnown(manufactureYear) && serialYearNumber && String(serialYearNumber) !== String(manufactureYear)) {
    checks.push("AI-provided year and serial-decoded year differed; serial-decoded year was preferred.");
  }
  if (category === "hvac" && isKnown(estimatedBTU)) checks.push("HVAC capacity was checked against visible/parsed capacity or model tonnage clues.");
  if (!isKnown(serial) || serial === "Unknown") checks.push("Serial number was not confidently readable; inspector review is recommended.");
  if (!isKnown(model) || model === "Unknown") checks.push("Model number was not confidently readable; inspector review is recommended.");

  return checks;
}

function buildReviewFlags({
  ocrQuality,
  fieldConfidence,
  manufacturer,
  model,
  serial,
  manufactureYear,
  category,
}: {
  ocrQuality: string;
  fieldConfidence: Record<string, number | string>;
  manufacturer: string;
  model: string;
  serial: string;
  manufactureYear: string;
  category: string;
}) {
  const flags: string[] = [];

  if (ocrQuality === "Poor") flags.push("Photo/data plate readability appears poor. Retake closer if possible.");
  if (!isKnown(manufacturer)) flags.push("Manufacturer needs inspector review.");
  if (!isKnown(model) || model === "Unknown") flags.push("Model number needs inspector review.");
  if (!isKnown(serial) || serial === "Unknown") flags.push("Serial number needs inspector review.");
  if (!isKnown(manufactureYear) || manufactureYear === "Unknown") flags.push("Manufacture year could not be confidently confirmed.");
  if (category === "general") flags.push("Equipment category is uncertain.");

  Object.entries(fieldConfidence).forEach(([field, value]) => {
    const score = clampConfidence(value, 0);
    if (score > 0 && score < 60) flags.push(`${field} confidence is low (${score}%).`);
  });

  return Array.from(new Set(flags));
}

function buildAiReasoning({
  manufacturer,
  model,
  serial,
  manufactureYear,
  serialYearNumber,
  category,
  ocrQuality,
  reviewFlags,
}: {
  manufacturer: string;
  model: string;
  serial: string;
  manufactureYear: string;
  serialYearNumber: number | null;
  category: string;
  ocrQuality: string;
  reviewFlags: string[];
}) {
  const reasons: string[] = [];

  reasons.push(`OCR/data plate quality was assessed as ${ocrQuality}.`);
  if (isKnown(manufacturer)) reasons.push(`Manufacturer was normalized to ${manufacturer}.`);
  if (isKnown(model) && model !== "Unknown") reasons.push(`Model was read as ${model}.`);
  if (isKnown(serial) && serial !== "Unknown") reasons.push(`Serial was read as ${serial}.`);
  if (serialYearNumber) reasons.push(`Manufacture year was decoded from the serial number as ${serialYearNumber}.`);
  else if (isKnown(manufactureYear) && manufactureYear !== "Unknown") reasons.push(`Manufacture year was taken from visible/AI-parsed plate information as ${manufactureYear}.`);
  if (category !== "general") reasons.push(`Equipment category was inferred as ${category.replaceAll("_", " ")}.`);
  if (reviewFlags.length) reasons.push(`Inspector review flags: ${reviewFlags.join(" ")}`);

  return reasons.join(" ");
}

function getOverallConfidence(fieldConfidence: Record<string, number | string>, reviewFlags: string[], ocrQuality: string) {
  const values = Object.values(fieldConfidence).map((value) => clampConfidence(value, 0)).filter((value) => value > 0);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 50;
  const ocrPenalty = ocrQuality === "Poor" ? 18 : ocrQuality === "Fair" ? 8 : 0;
  const reviewPenalty = Math.min(25, reviewFlags.length * 4);
  return clampConfidence(average - ocrPenalty - reviewPenalty, 50);
}


function getServiceLifeRange(value: string) {
  const numbers = String(value || "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite) || [];

  if (!numbers.length) return null;
  const min = Math.max(1, numbers[0]);
  const max = Math.max(min, numbers[numbers.length - 1]);
  return { min, max };
}

function getLifeExpectancyPercent(age: number | null, expectedServiceLife: string) {
  if (age === null || !Number.isFinite(age)) return 0;
  const range = getServiceLifeRange(expectedServiceLife);
  if (!range) return 0;
  return Math.max(0, Math.min(150, Math.round((age / range.max) * 100)));
}

function getMaintenanceSchedule(category: string, equipmentType: string) {
  const text = `${category} ${equipmentType}`.toLowerCase();

  if (text.includes("water heater")) {
    return "Inspect annually for leakage/corrosion; follow manufacturer guidance for flushing, anode-rod service, and TPR-valve maintenance.";
  }

  if (text.includes("hvac") || text.includes("furnace") || text.includes("heat pump") || text.includes("air conditioner") || text.includes("condenser") || text.includes("boiler")) {
    return "Professional service is commonly performed annually; replace or clean filters at the interval recommended for the installed filter and household conditions.";
  }

  if (text.includes("electrical")) {
    return "Keep the equipment accessible and dry; have a qualified electrician evaluate visible overheating, corrosion, loose components, nuisance tripping, or other changes.";
  }

  if (text.includes("appliance")) {
    return "Follow the manufacturer maintenance schedule; keep vents, filters, drains, and safety clearances clean and unobstructed.";
  }

  return "Follow the manufacturer maintenance schedule and have the equipment serviced when performance, leakage, noise, corrosion, or other conditions change.";
}

function getKnownFailurePatterns(category: string, equipmentType: string, refrigerant: string) {
  const text = `${category} ${equipmentType}`.toLowerCase();
  const patterns: string[] = [];

  if (text.includes("water heater")) {
    patterns.push("Tank leakage/corrosion", "TPR discharge defects", "venting or combustion concerns where fuel-fired");
  } else if (text.includes("heat pump") || text.includes("air conditioner") || text.includes("condenser") || text.includes("hvac")) {
    patterns.push("Capacitor/contact failure", "refrigerant leakage", "coil fouling or airflow restriction", "condensate drainage defects");
  } else if (text.includes("furnace") || text.includes("boiler")) {
    patterns.push("Ignition or control failure", "venting/combustion defects", "circulator or blower wear", "heat-exchanger or vessel concerns requiring specialist evaluation");
  } else if (text.includes("electrical")) {
    patterns.push("Loose or overheated connections", "corrosion/moisture damage", "breaker or bus damage", "improper grounding/bonding");
  } else if (text.includes("appliance")) {
    patterns.push("Control or sensor failure", "drainage/leakage", "heating-element or motor wear", "door/gasket deterioration");
  }

  if (String(refrigerant || "").toUpperCase().includes("R-22")) {
    patterns.push("R-22 service availability and cost constraints");
  }

  return Array.from(new Set(patterns)).slice(0, 5);
}

function getReplacementCostEstimate(category: string, equipmentType: string) {
  const text = `${category} ${equipmentType}`.toLowerCase();

  if (text.includes("water heater")) return "$1,500–$5,000 planning range; specialty, high-efficiency, fuel conversion, venting, and local labor can materially change cost.";
  if (text.includes("heat pump") || text.includes("air conditioner") || text.includes("condenser") || text.includes("hvac")) return "$5,000–$18,000 planning range for common residential systems; ductwork, electrical, efficiency level, refrigerant transition, and local labor can materially change cost.";
  if (text.includes("furnace") || text.includes("boiler")) return "$4,000–$15,000 planning range; boiler, chimney/venting, fuel conversion, controls, and distribution work can materially change cost.";
  if (text.includes("electrical panel") || text.includes("panelboard")) return "$2,000–$8,000 planning range; service upgrades, utility work, grounding, permits, and local labor can materially change cost.";
  if (text.includes("appliance")) return "$800–$4,000 planning range depending on appliance type, capacity, finish, installation, and required utility modifications.";

  return "Obtain local replacement quotes. The available photos and label data are not sufficient for a reliable dollar estimate.";
}

function getRecallAwareness(manufacturer: string, model: string, serial: string) {
  if (!isKnown(manufacturer) || !isKnown(model)) {
    return "Recall status was not checked because manufacturer/model identification was incomplete. Verify the data plate before performing a live manufacturer or CPSC recall search.";
  }

  const serialNote = isKnown(serial)
    ? "Include the serial number when checking applicability."
    : "The serial number should be confirmed because recall applicability may depend on production range.";

  return `No live recall determination was made from image analysis. Verify ${manufacturer} model ${model} against current manufacturer and CPSC recall records. ${serialNote}`;
}

function enhanceAnalysis(parsed: EquipmentAnalysis, imageCount = 1) {
  const category = inferCategory(parsed);
  const manufacturer = normalizeManufacturer(parsed.manufacturer);
  const equipmentType =
    cleanText(parsed.equipmentType) ||
    (category === "hvac"
      ? "HVAC Equipment"
      : category === "water_heater"
      ? "Water Heater"
      : category === "electrical"
      ? "Electrical Equipment"
      : category === "appliance"
      ? "Appliance"
      : category === "plumbing"
      ? "Plumbing Equipment"
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
  const lifeExpectancyPercent = getLifeExpectancyPercent(age, expectedServiceLife);
  const maintenanceSchedule =
    cleanText(parsed.maintenanceSchedule) || getMaintenanceSchedule(category, equipmentType);
  const knownFailurePatterns =
    Array.isArray(parsed.knownFailurePatterns) && parsed.knownFailurePatterns.length
      ? parsed.knownFailurePatterns.map(cleanText).filter(Boolean).slice(0, 5)
      : getKnownFailurePatterns(category, equipmentType, cleanText(parsed.refrigerant));
  const replacementCostEstimate =
    cleanText(parsed.replacementCostEstimate) || getReplacementCostEstimate(category, equipmentType);
  const recallAwareness =
    cleanText(parsed.recallAwareness) || getRecallAwareness(manufacturer, model, serial);
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

  const refrigerantValue = cleanText(parsed.refrigerant) || (r22 ? "R-22" : "Unknown");
  const estimatedBTU =
    cleanText(parsed.capacity) ||
    cleanText(parsed.estimatedBTU) ||
    (category === "hvac" ? parseTonnageFromModel(parsed.model) : "") ||
    "Unknown";

  const estimatedSEER = cleanText(parsed.estimatedSEER) || estimateSEER({
    age,
    refrigerant: refrigerantValue,
    category,
  });

  const estimatedAFUE = cleanText(parsed.estimatedAFUE) || estimateAFUE({
    age,
    category,
    fuelType: cleanText(parsed.fuelType),
  });

  const estimatedHeatingEfficiency =
    cleanText(parsed.estimatedHeatingEfficiency) ||
    estimateHeatingEfficiency({
      category,
      equipmentType,
      fuelType: cleanText(parsed.fuelType),
    });

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

  const clientSummary = buildNarrativeEquipmentSummary({
    equipmentType,
    manufacturer,
    model,
    manufactureYear,
    capacity: estimatedBTU || cleanText(parsed.capacity),
    fuelType: cleanText(parsed.fuelType),
    refrigerant: refrigerantValue,
    category,
    r22,
    problemPanel,
  });

  let observation = cleanText(parsed.observation);
  let implication = cleanText(parsed.implication);

  if (
    !observation ||
    observation.toLowerCase() === "unknown" ||
    isEquipmentMetadataDump(observation)
  ) {
    observation = buildCleanObservation({
      manufacturer,
      equipmentType,
    });
  }

  if (
    !implication ||
    implication.toLowerCase() === "unknown" ||
    isEquipmentMetadataDump(implication)
  ) {
    implication = buildCleanImplication({
      age,
      category,
      equipmentType,
      severity,
      condition,
    });
  }

  const recommendation = buildCleanRecommendation({
    age,
    category,
    equipmentType,
    severity,
    condition,
    r22,
    problemPanel,
  });

  const maintenanceLevel = cleanText(parsed.maintenanceLevel) || getMaintenanceLevel({
    age,
    category,
    condition,
    r22,
    problemPanel,
  });

  const ocrQuality = getOcrQualityLabel(parsed, imageCount);
  const fieldConfidence = getFieldConfidence({
    parsed,
    manufacturer,
    model,
    serial,
    manufactureYear,
    serialYearNumber,
    category,
    imageCount,
  });
  const evidence = buildEvidence({
    parsed,
    manufacturer,
    model,
    serial,
    manufactureYear,
    serialYearNumber,
    category,
    r22,
    problemPanel,
  });
  const crossChecks = buildCrossChecks({
    manufacturer,
    model,
    serial,
    manufactureYear,
    serialYearNumber,
    category,
    estimatedBTU,
  });
  const reviewFlags = buildReviewFlags({
    ocrQuality,
    fieldConfidence,
    manufacturer,
    model,
    serial,
    manufactureYear,
    category,
  });
  const confidenceScore = getOverallConfidence(fieldConfidence, reviewFlags, ocrQuality);
  const reviewRequired = confidenceScore < 75 || reviewFlags.length > 0;
  const aiReasoning = cleanText(parsed.aiReasoning) || buildAiReasoning({
    manufacturer,
    model,
    serial,
    manufactureYear,
    serialYearNumber,
    category,
    ocrQuality,
    reviewFlags,
  });

  return {
    equipmentType,
    manufacturer,
    model,
    serial,
    manufactureYear,
    estimatedAge: age !== null ? `${age} years` : cleanText(parsed.estimatedAge) || "Unknown",
    expectedServiceLife,
    lifeExpectancyPercent,
    maintenanceSchedule,
    knownFailurePatterns,
    replacementCostEstimate,
    recallAwareness,
    estimatedSEER,
    estimatedAFUE,
    estimatedBTU,
    estimatedHeatingEfficiency,
    equipmentCategory,
    budgetPlanning,
    maintenanceLevel,
    equipmentStatus,
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
    ocrQuality,
    confidenceScore,
    reviewRequired,
    aiReasoning,
    fieldConfidence,
    evidence,
    reviewFlags,
    crossChecks,
    aiModel: AI_EQUIPMENT_MODEL,
    aiVersion: AI_EQUIPMENT_VERSION,
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

    const imageInputFiles = [
      ...(formData.getAll("images") as File[]),
      ...((formData.get("image") ? [formData.get("image") as File] : []) as File[]),
    ]
      .filter((file) => file && typeof file.arrayBuffer === "function")
      .filter((file) => !file.type || file.type.startsWith("image/"));

    const seenImageKeys = new Set<string>();
    const imageFiles = imageInputFiles
      .filter((file) => {
        const key = `${file.name || "image"}-${file.size || 0}-${file.lastModified || 0}`;
        if (seenImageKeys.has(key)) return false;
        seenImageKeys.add(key);
        return true;
      })
      .slice(0, 6);

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

    if (imageFiles.length === 0) {
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

    const imageContent = await Promise.all(
      imageFiles.map(async (image, index) => {
        const bytes = await image.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64Image = buffer.toString("base64");
        const mimeType = image.type || "image/jpeg";

        return {
          type: "image_url" as const,
          image_url: {
            url: `data:${mimeType};base64,${base64Image}`,
          },
        };
      })
    );

    const systemPrompt =
      "You are the On Point Inspect Equipment Intelligence Engine, an expert home inspection equipment analyst and data-plate reader. Return ONLY valid JSON. Think in passes: first read all visible text, then identify logos/brand marks, then identify equipment type, model, serial, manufacture date, capacity, fuel/refrigerant, and finally cross-check the result. Be accurate and conservative, but work hard before using Unknown. Carefully read visible labels, model numbers, serial numbers, capacity codes, refrigerant markings, manufacture dates, and brand/manufacturer markings. Use known HVAC, water heater, appliance, and electrical data-plate conventions only when strongly supported by visible evidence. Never invent a serial number, model number, manufacture year, refrigerant, capacity, or fuel type. If a value cannot be confirmed or strongly inferred, use Unknown. Include confidence scores and evidence for inspector review. Keep maintenance recommendations separate from identification notes.";

    const userPrompt = `
Analyze these equipment photos together. Use all provided images as one equipment record. One photo may show the full unit, another may show the data plate, and another may show the serial/model label.

Number of photos provided: ${imageFiles.length}
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
  "maintenanceSchedule": "",
  "knownFailurePatterns": [],
  "replacementCostEstimate": "",
  "recallAwareness": "",
  "lifeExpectancyPercent": 0,
  "estimatedSEER": "",
  "estimatedAFUE": "",
  "estimatedBTU": "",
  "estimatedHeatingEfficiency": "",
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
  "recommendation": "",
  "ocrQuality": "Excellent | Good | Fair | Poor",
  "confidenceScore": 0,
  "reviewRequired": false,
  "aiReasoning": "",
  "fieldConfidence": {
    "equipmentType": 0,
    "manufacturer": 0,
    "model": 0,
    "serial": 0,
    "manufactureYear": 0,
    "capacity": 0,
    "refrigerant": 0,
    "fuelType": 0
  },
  "evidence": {
    "manufacturer": [],
    "model": [],
    "serial": [],
    "manufactureYear": [],
    "capacity": [],
    "refrigerant": [],
    "fuelType": []
  },
  "reviewFlags": [],
  "crossChecks": []
}

Section must be one of:
Exterior, Roof, Basement, Foundation, Crawlspace & Structure, Heating, Cooling, Plumbing, Electrical, Attic, Insulation & Ventilation, Doors, Windows & Interior, Built-in Appliances, Garage, General.

Severity must be one of:
Informational, Monitor, Maintenance, Recommended Repair, Safety Concern, Major Concern.

Rules:
- Carefully extract manufacturer, model, and serial only when visible across any of the provided photos.
- Prefer the clearest data plate or serial label photo when multiple photos disagree.
- If information is not visible, use "Unknown".
- Equipment status should be client-friendly, such as: ✓ No Specific Deficiency Noted, ⚠ Older Equipment – Monitor, ⚠ Service Recommended, or ⚠ Specialist Evaluation Recommended. Age alone should use ⚠ Older Equipment – Monitor, not Service Recommended. Severity should be Monitor for older equipment near or beyond typical service life.
- Do not estimate exact remaining life. Use typical industry service-life ranges only.
- Include estimatedSEER for AC condensers, heat pumps, and mini splits when it can be reasonably estimated or label information is visible.
- Include estimatedAFUE for gas, oil, or propane furnaces/boilers when it applies. Do not provide AFUE for electric heat pumps.
- Include estimatedHeatingEfficiency for heat pumps as label/manual verification language when exact HSPF/HSPF2 is not visible.
- Replacement cost is a planning estimate only. Use a broad range and state that local quotes, scope, permits, efficiency, access, utility work, and labor can materially change cost.
- Do not claim a confirmed recall from image analysis. Recall awareness must direct the inspector to verify the exact manufacturer, model, and serial against current manufacturer and CPSC records.
- Known failure patterns must be general equipment-type patterns, not a diagnosis of the photographed unit.
- Keep identification notes short and narrative, not a database-style list.
- Do not write phrases like "serial number documented", "capacity identified", "fuel type identified", or "observed condition/status" in client-facing summaries.
- Do not repeat routine maintenance language inside identification/client summary text.
- Observation, implication, and recommendation must be short client-facing report text only.
- Do not include equipment metadata lists inside recommendation. Do not include equipment type, manufacturer, model, serial, manufacture year, capacity, fuel type, refrigerant, status, inspector note, or maintenance note in recommendation.
- confidenceScore must be 0-100 and should reflect the full equipment record, not just one field.
- fieldConfidence values must be 0-100. Use lower confidence for blurry plates, partial labels, conflicting photos, or inferred values.
- evidence should explain what visual text, logo, serial pattern, model pattern, or plate marking supports each key value.
- reviewFlags should be empty only when the result is strong enough for normal inspector review without extra caution.
- crossChecks should explain consistency checks, conflicts, or why a decoded value was preferred.
    `;

    const brainResult = await inspectionBrain.run({
      task: "equipment",
      systemPrompt,
      userPrompt,
      images: imageFiles.map((image, index) => {
        const imageUrl = (imageContent[index] as any)?.image_url?.url || "";
        const base64 = imageUrl.split(",")[1] || "";
        return {
          mimeType: image.type || "image/jpeg",
          base64,
        };
      }),
      temperature: 0.1,
      responseFormat: "json_object",
    });

    const text = brainResult.text || "{}";

    let parsed: EquipmentAnalysis;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        error: "AI did not return valid JSON",
        raw: text,
      };
    }

    const enhanced = parsed?.error ? parsed : enhanceAnalysis(parsed || {}, imageFiles.length);

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
        lifeExpectancyPercent: (enhanced as any)?.lifeExpectancyPercent,
        maintenanceSchedule: (enhanced as any)?.maintenanceSchedule,
        replacementCostEstimate: (enhanced as any)?.replacementCostEstimate,
        recallAwareness: (enhanced as any)?.recallAwareness,
        estimatedLifeRemaining: enhanced?.estimatedLifeRemaining,
        refrigerant: enhanced?.refrigerant,
        estimatedSEER: (enhanced as any)?.estimatedSEER,
        estimatedAFUE: (enhanced as any)?.estimatedAFUE,
        estimatedBTU: (enhanced as any)?.estimatedBTU,
        estimatedHeatingEfficiency: (enhanced as any)?.estimatedHeatingEfficiency,
        budgetPlanning: (enhanced as any)?.budgetPlanning,
        maintenanceLevel: (enhanced as any)?.maintenanceLevel,
        equipmentStatus: (enhanced as any)?.equipmentStatus,
        section: enhanced?.section,
        severity: enhanced?.severity,
        confidenceScore: (enhanced as any)?.confidenceScore,
        ocrQuality: (enhanced as any)?.ocrQuality,
        reviewRequired: (enhanced as any)?.reviewRequired,
        reviewFlags: (enhanced as any)?.reviewFlags,
        intelligenceFlags: (enhanced as any)?.intelligenceFlags,
        aiModel: AI_EQUIPMENT_MODEL,
        aiVersion: AI_EQUIPMENT_VERSION,
        photoCount: imageFiles.length,
      },
      tokensUsed: brainResult.usage?.total_tokens ?? null,
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
