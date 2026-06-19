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

  if (brand.includes("carrier") || brand.includes("bryant") || brand.includes("payne")) {
    const ww = Number(cleanSerial.slice(0, 2));
    const yy = Number(cleanSerial.slice(2, 4));
    const year = yearFromTwoDigits(yy);
    if (year && weekIsValid(ww)) return year;
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

  if (brand.includes("york")) {
    const yy = Number(cleanSerial.slice(1, 3));
    const year = yearFromTwoDigits(yy);
    if (year) return year;
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


function enhanceAnalysis(parsed: EquipmentAnalysis) {
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
            "You are an expert home inspection equipment analyst and data-plate reader. Return ONLY valid JSON. Be accurate and conservative, but work hard before using Unknown. Carefully read visible labels, model numbers, serial numbers, capacity codes, refrigerant markings, manufacture dates, and brand/manufacturer markings. Use known HVAC, water heater, appliance, and electrical data-plate conventions when they are strongly supported. Never invent a serial number, model number, manufacture year, refrigerant, capacity, or fuel type. If a value cannot be confirmed or strongly inferred, use Unknown. Keep maintenance recommendations separate from identification notes.",
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
  "recommendation": ""
}

Section must be one of:
Exterior, Roof, Basement, Foundation, Crawlspace & Structure, Heating, Cooling, Plumbing, Electrical, Attic, Insulation & Ventilation, Doors, Windows & Interior, Built-in Appliances, Garage, General.

Severity must be one of:
Informational, Monitor, Maintenance, Recommended Repair, Safety Concern, Major Concern.

Rules:
- Carefully extract manufacturer, model, and serial only when visible.
- If information is not visible, use "Unknown".
- Equipment status should be client-friendly, such as: ✓ No Specific Deficiency Noted, ⚠ Older Equipment – Monitor, ⚠ Service Recommended, or ⚠ Specialist Evaluation Recommended. Age alone should use ⚠ Older Equipment – Monitor, not Service Recommended. Severity should be Monitor for older equipment near or beyond typical service life.
- Do not estimate exact remaining life. Use typical industry service-life ranges only.
- Include estimatedSEER for AC condensers, heat pumps, and mini splits when it can be reasonably estimated or label information is visible.
- Include estimatedAFUE for gas, oil, or propane furnaces/boilers when it applies. Do not provide AFUE for electric heat pumps.
- Include estimatedHeatingEfficiency for heat pumps as label/manual verification language when exact HSPF/HSPF2 is not visible.
- Do not provide dollar amounts or replacement cost ranges.
- Keep identification notes short and narrative, not a database-style list.
- Do not write phrases like "serial number documented", "capacity identified", "fuel type identified", or "observed condition/status" in client-facing summaries.
- Do not repeat routine maintenance language inside identification/client summary text.
- Observation, implication, and recommendation must be short client-facing report text only.
- Do not include equipment metadata lists inside recommendation. Do not include equipment type, manufacturer, model, serial, manufacture year, capacity, fuel type, refrigerant, status, inspector note, or maintenance note in recommendation.
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
        estimatedHeatingEfficiency: (enhanced as any)?.estimatedHeatingEfficiency,
        budgetPlanning: (enhanced as any)?.budgetPlanning,
        maintenanceLevel: (enhanced as any)?.maintenanceLevel,
        equipmentStatus: (enhanced as any)?.equipmentStatus,
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
