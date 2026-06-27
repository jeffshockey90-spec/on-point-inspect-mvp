export type MaterialCategory =
  | "roofing"
  | "siding"
  | "foundation"
  | "flooring"
  | "countertop"
  | "decking"
  | "window"
  | "door"
  | "insulation"
  | "plumbing"
  | "electrical"
  | "hvac"
  | "interior"
  | "exterior";

export type MaterialRecord = {
  name: string;
  category: MaterialCategory;
  aliases: string[];
  commonLocations: string[];
  commonConcerns: string[];
  inspectionNotes: string[];
};

const MATERIALS: MaterialRecord[] = [
  {
    name: "Architectural Asphalt Shingles",
    category: "roofing",
    aliases: ["architectural shingles", "dimensional shingles", "laminated shingles", "asphalt shingles"],
    commonLocations: ["Roof"],
    commonConcerns: [
      "granule loss",
      "curling",
      "cracking",
      "missing shingles",
      "damaged shingles",
      "exposed fasteners",
      "poor flashing details",
    ],
    inspectionNotes: [
      "Evaluate visible wear, flashing, penetrations, drainage, and evidence of prior repairs.",
      "Age and installation quality strongly affect remaining service life.",
    ],
  },
  {
    name: "Three-Tab Asphalt Shingles",
    category: "roofing",
    aliases: ["3 tab shingles", "three tab shingles", "strip shingles"],
    commonLocations: ["Roof"],
    commonConcerns: [
      "curling",
      "lifting tabs",
      "granule loss",
      "missing tabs",
      "wind damage",
    ],
    inspectionNotes: [
      "Older three-tab shingles may have shorter remaining service life than architectural shingles.",
    ],
  },
  {
    name: "Standing Seam Metal Roofing",
    category: "roofing",
    aliases: ["standing seam", "metal roof", "metal roofing"],
    commonLocations: ["Roof"],
    commonConcerns: [
      "loose fasteners",
      "failed sealant",
      "improper flashing",
      "surface corrosion",
      "panel movement",
    ],
    inspectionNotes: [
      "Inspect seams, penetrations, fasteners, transitions, and flashing details.",
    ],
  },
  {
    name: "Vinyl Siding",
    category: "siding",
    aliases: ["vinyl siding", "vinyl cladding"],
    commonLocations: ["Exterior"],
    commonConcerns: [
      "loose siding",
      "cracking",
      "warping",
      "missing trim",
      "improper clearance",
      "open joints",
    ],
    inspectionNotes: [
      "Vinyl siding is cosmetic and weather-resistant, but water management depends on proper flashing and drainage behind the siding.",
    ],
  },
  {
    name: "Fiber Cement Siding",
    category: "siding",
    aliases: ["fiber cement", "hardie", "hardiplank", "cement board siding"],
    commonLocations: ["Exterior"],
    commonConcerns: [
      "improper clearance",
      "failed caulking",
      "cracked boards",
      "loose boards",
      "paint failure",
      "moisture damage",
    ],
    inspectionNotes: [
      "Check clearances from grade, roofs, decks, and horizontal surfaces.",
    ],
  },
  {
    name: "Brick Veneer",
    category: "siding",
    aliases: ["brick veneer", "brick exterior", "masonry veneer"],
    commonLocations: ["Exterior"],
    commonConcerns: [
      "cracking",
      "step cracks",
      "missing weep holes",
      "mortar deterioration",
      "movement",
      "improper flashing",
    ],
    inspectionNotes: [
      "Look for weep holes, lintel corrosion, settlement cracks, and moisture management concerns.",
    ],
  },
  {
    name: "Poured Concrete Foundation",
    category: "foundation",
    aliases: ["poured concrete", "concrete foundation", "concrete wall"],
    commonLocations: ["Basement, Foundation, Crawlspace & Structure"],
    commonConcerns: [
      "vertical cracks",
      "horizontal cracks",
      "settlement",
      "water intrusion",
      "efflorescence",
      "bowing",
    ],
    inspectionNotes: [
      "Crack direction, displacement, width, moisture, and movement indicators affect severity.",
    ],
  },
  {
    name: "Concrete Masonry Unit Foundation",
    category: "foundation",
    aliases: ["cmu", "block foundation", "cinder block", "concrete block"],
    commonLocations: ["Basement, Foundation, Crawlspace & Structure"],
    commonConcerns: [
      "horizontal cracks",
      "stair-step cracks",
      "bowing",
      "efflorescence",
      "water intrusion",
      "mortar deterioration",
    ],
    inspectionNotes: [
      "Horizontal cracking or inward displacement may indicate lateral pressure and should be evaluated carefully.",
    ],
  },
  {
    name: "Laminate Countertop",
    category: "countertop",
    aliases: ["laminate countertop", "formica", "plastic laminate"],
    commonLocations: ["Doors, Windows & Interior", "Built-in Appliances"],
    commonConcerns: [
      "swelling",
      "open seams",
      "burn marks",
      "delamination",
      "water damage",
    ],
    inspectionNotes: [
      "Check seams, sink cutouts, backsplash joints, and swelling near wet areas.",
    ],
  },
  {
    name: "Granite Countertop",
    category: "countertop",
    aliases: ["granite", "stone countertop", "natural stone countertop"],
    commonLocations: ["Doors, Windows & Interior", "Built-in Appliances"],
    commonConcerns: [
      "cracks",
      "loose sections",
      "failed caulking",
      "staining",
      "improper support",
    ],
    inspectionNotes: [
      "Inspect for cracks, support at overhangs, and sealant condition at sinks/walls.",
    ],
  },
  {
    name: "Luxury Vinyl Plank Flooring",
    category: "flooring",
    aliases: ["lvp", "luxury vinyl plank", "vinyl plank"],
    commonLocations: ["Doors, Windows & Interior"],
    commonConcerns: [
      "gapping",
      "buckling",
      "loose planks",
      "uneven substrate",
      "water damage",
    ],
    inspectionNotes: [
      "Flooring defects may be cosmetic or may indicate subfloor moisture or installation issues.",
    ],
  },
  {
    name: "Fiberglass Batt Insulation",
    category: "insulation",
    aliases: ["fiberglass batts", "batt insulation", "pink insulation", "yellow insulation"],
    commonLocations: ["Attic, Insulation & Ventilation"],
    commonConcerns: [
      "compressed insulation",
      "missing insulation",
      "uneven coverage",
      "reversed vapor barrier",
      "rodent disturbance",
    ],
    inspectionNotes: [
      "Evaluate approximate depth, coverage, compression, and ventilation clearances.",
    ],
  },
  {
    name: "Blown Fiberglass Insulation",
    category: "insulation",
    aliases: ["blown fiberglass", "loose fill fiberglass", "loose fiberglass"],
    commonLocations: ["Attic, Insulation & Ventilation"],
    commonConcerns: [
      "low insulation depth",
      "uneven coverage",
      "wind washing",
      "blocked ventilation",
      "disturbed insulation",
    ],
    inspectionNotes: [
      "Measure approximate depth where accessible and note uneven or missing areas.",
    ],
  },
  {
    name: "PEX Water Supply Piping",
    category: "plumbing",
    aliases: ["pex", "cross-linked polyethylene", "plastic water pipe"],
    commonLocations: ["Plumbing"],
    commonConcerns: [
      "unsupported piping",
      "improper fittings",
      "leaks",
      "UV exposure",
      "poor protection at penetrations",
    ],
    inspectionNotes: [
      "Check visible fittings, support, protection, and leaks.",
    ],
  },
  {
    name: "Copper Water Supply Piping",
    category: "plumbing",
    aliases: ["copper pipe", "copper water line", "copper supply"],
    commonLocations: ["Plumbing"],
    commonConcerns: [
      "corrosion",
      "leaks",
      "poor support",
      "improper dielectric transitions",
      "kinked piping",
    ],
    inspectionNotes: [
      "Inspect visible joints, corrosion, support, and signs of leakage.",
    ],
  },
  {
    name: "NM Cable",
    category: "electrical",
    aliases: ["romex", "nm cable", "nonmetallic sheathed cable"],
    commonLocations: ["Electrical", "Attic, Insulation & Ventilation", "Basement, Foundation, Crawlspace & Structure"],
    commonConcerns: [
      "open splices",
      "missing junction box",
      "physical damage",
      "poor support",
      "improper protection",
    ],
    inspectionNotes: [
      "Open splices and exposed conductors are safety concerns and should be corrected by a qualified electrical contractor.",
    ],
  },
];

export class MaterialDatabase {
  find(value?: string) {
    const search = String(value || "").toLowerCase().trim();
    if (!search) return null;

    return (
      MATERIALS.find((material) =>
        material.name.toLowerCase() === search ||
        material.aliases.some((alias) => search.includes(alias))
      ) || null
    );
  }

  searchByCategory(category: MaterialCategory) {
    return MATERIALS.filter((material) => material.category === category);
  }

  searchText(text?: string) {
    const search = String(text || "").toLowerCase();
    if (!search) return [];

    return MATERIALS.filter((material) => {
      return (
        search.includes(material.name.toLowerCase()) ||
        material.aliases.some((alias) => search.includes(alias))
      );
    });
  }

  all() {
    return MATERIALS;
  }
}

export const materialDatabase = new MaterialDatabase();
