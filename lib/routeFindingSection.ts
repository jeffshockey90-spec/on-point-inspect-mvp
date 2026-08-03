const REAL_SECTIONS = [
  "Exterior",
  "Roof",
  "Basement, Foundation, Crawlspace & Structure",
  "Heating",
  "Cooling",
  "Plumbing",
  "Electrical",
  "Fireplace",
  "Attic, Insulation & Ventilation",
  "Doors, Windows & Interior",
  "Built-in Appliances",
  "Garage",
];

export function routeFindingSection(input: {
  section?: string;
  title?: string;
  observation?: string;
  implication?: string;
  recommendation?: string;
}) {
  const text = `
    ${input.section || ""}
    ${input.title || ""}
    ${input.observation || ""}
    ${input.implication || ""}
    ${input.recommendation || ""}
  `.toLowerCase();

  if (
    text.includes("electrical") ||
    text.includes("panel") ||
    text.includes("breaker") ||
    text.includes("gfci") ||
    text.includes("afci") ||
    text.includes("receptacle") ||
    text.includes("outlet") ||
    text.includes("wire") ||
    text.includes("wiring") ||
    text.includes("conductor") ||
    text.includes("junction") ||
    text.includes("open splice") ||
    text.includes("double tapped") ||
    text.includes("neutral") ||
    text.includes("bonding") ||
    text.includes("grounding")
  ) {
    return "Electrical";
  }

  if (
    text.includes("plumbing") ||
    text.includes("pipe") ||
    text.includes("drain") ||
    text.includes("leak") ||
    text.includes("faucet") ||
    text.includes("toilet") ||
    text.includes("sink") ||
    text.includes("water heater") ||
    text.includes("tpr") ||
    text.includes("sump pump") ||
    text.includes("hose bib") ||
    text.includes("sewer") ||
    text.includes("shutoff") ||
    text.includes("supply line") ||
    text.includes("waste line")
  ) {
    return "Plumbing";
  }

  if (
    text.includes("roof") ||
    text.includes("shingle") ||
    text.includes("flashing") ||
    text.includes("gutter") ||
    text.includes("downspout") ||
    text.includes("chimney") ||
    text.includes("ridge") ||
    text.includes("valley") ||
    text.includes("soffit") ||
    text.includes("fascia")
  ) {
    return "Roof";
  }

  if (
    text.includes("furnace") ||
    text.includes("heat") ||
    text.includes("heating") ||
    text.includes("boiler") ||
    text.includes("air handler") ||
    text.includes("gas line") ||
    text.includes("flue")
  ) {
    return "Heating";
  }

  if (
    // Word-boundary match so the "ac" abbreviation doesn't match the letters
    // inside cracked, crawlspace, access, surface, place, etc.
    /\bac\b/.test(text) ||
    /\ba\/c\b/.test(text) ||
    text.includes("cooling") ||
    text.includes("air conditioner") ||
    text.includes("air conditioning") ||
    text.includes("condenser") ||
    text.includes("compressor") ||
    text.includes("evaporator") ||
    text.includes("heat pump") ||
    text.includes("refrigerant")
  ) {
    return "Cooling";
  }

  if (
    text.includes("foundation") ||
    text.includes("crawlspace") ||
    text.includes("crawl space") ||
    text.includes("basement") ||
    text.includes("joist") ||
    text.includes("beam") ||
    text.includes("girder") ||
    text.includes("sill plate") ||
    text.includes("pier") ||
    text.includes("settlement") ||
    text.includes("crack")
  ) {
    return "Basement, Foundation, Crawlspace & Structure";
  }

  if (
    text.includes("attic") ||
    text.includes("insulation") ||
    text.includes("ventilation") ||
    text.includes("baffle") ||
    text.includes("bath fan") ||
    text.includes("exhaust fan")
  ) {
    return "Attic, Insulation & Ventilation";
  }

  if (
    text.includes("garage") ||
    text.includes("garage door") ||
    text.includes("opener") ||
    text.includes("auto reverse") ||
    text.includes("photo eye")
  ) {
    return "Garage";
  }

  if (
    text.includes("fireplace") ||
    text.includes("damper") ||
    text.includes("hearth") ||
    text.includes("firebox")
  ) {
    return "Fireplace";
  }

  if (
    text.includes("dishwasher") ||
    text.includes("range") ||
    text.includes("cooktop") ||
    text.includes("oven") ||
    text.includes("refrigerator") ||
    text.includes("microwave") ||
    text.includes("disposal") ||
    text.includes("appliance")
  ) {
    return "Built-in Appliances";
  }

  if (
    text.includes("door") ||
    text.includes("window") ||
    text.includes("interior") ||
    text.includes("floor") ||
    text.includes("wall") ||
    text.includes("ceiling") ||
    text.includes("stair") ||
    text.includes("handrail") ||
    text.includes("guardrail")
  ) {
    return "Doors, Windows & Interior";
  }

  if (
    text.includes("siding") ||
    text.includes("stucco") ||
    text.includes("trim") ||
    text.includes("grading") ||
    text.includes("walkway") ||
    text.includes("driveway") ||
    text.includes("deck") ||
    text.includes("porch") ||
    text.includes("steps") ||
    text.includes("fence") ||
    text.includes("exterior")
  ) {
    return "Exterior";
  }

  if (input.section && REAL_SECTIONS.includes(input.section)) {
    return input.section;
  }

  return "Exterior";
}

export function normalizeSeverity(input?: string) {
  const value = (input || "").toLowerCase();

  if (value.includes("safety")) return "Safety Concern";
  if (value.includes("major")) return "Major Concern";
  if (value.includes("monitor")) return "Monitor";
  if (value.includes("maintenance")) return "Maintenance";
  if (value.includes("info") || value.includes("general")) return "Informational";

  return "Recommended Repair";
}