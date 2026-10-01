// Shared checklist definition — the single source of truth for section-info
// groups/options. Imported by the report builder's SectionInformationChecklist
// AND by server routes (e.g. voice/photo autofill) that need the vocabulary.

export type ChecklistGroup = {
  title: string;
  type?: "checkbox" | "text";
  unitOptions?: string[];
  options: string[];
};

export const CHECKLIST_LIBRARY: Record<string, ChecklistGroup[]> = {
  "Inspection Details": [
    {
      "title": "In Attendance",
      "options": [
        "Client",
        "Home Owner",
        "Inspector",
        "Listing Agent",
        "Client's Agent"
      ]
    },
    {
      "title": "Occupancy",
      "options": [
        "Furnished",
        "Vacant",
        "Occupied",
        "Utilities Off"
      ]
    },
    {
      "title": "Style",
      "options": [
        "Manufactured",
        "Modular",
        "Modern",
        "Bungalow",
        "Victorian",
        "Row House",
        "Raised Ranch",
        "Rambler",
        "Ranch",
        "Multi-level",
        "Contemporary",
        "Colonial",
        "Townhouse"
      ]
    },
    {
      "title": "Temperature",
      "type": "text",
      "unitOptions": [
        "Fahrenheit (F)",
        "Celsius (C)"
      ],
      "options": []
    },
    {
      "title": "Type of Building",
      "options": [
        "Multi-Family",
        "Single Family",
        "Detached",
        "Attached",
        "Condominium / Townhouse"
      ]
    },
    {
      "title": "Weather Conditions",
      "options": [
        "Clear",
        "Cloudy",
        "Rain",
        "Snow",
        "Fog",
        "Storm",
        "Dry",
        "Hot"
      ]
    }
  ],
  "Exterior": [
    {
      "title": "Inspection Method",
      "options": [
        "Visual",
        "Infrared",
        "Attic Access",
        "Crawlspace Access"
      ]
    },
    {
      "title": "Siding Material",
      "options": [
        "Brick Veneer",
        "Plastic",
        "Logs",
        "Stone Veneer",
        "Concrete",
        "Stucco",
        "Fiber Cement",
        "Stone",
        "Wood",
        "Vinyl",
        "Shingles",
        "Brick",
        "Engineered Wood",
        "Masonry",
        "Asphalt",
        "Metal"
      ]
    },
    {
      "title": "Exterior Entry Door",
      "options": [
        "Wood",
        "Steel",
        "Single Pane",
        "Glass",
        "Hollow Core",
        "Fiberglass"
      ]
    },
    {
      "title": "Appurtenance",
      "options": [
        "Front Porch",
        "Deck",
        "Sunroom",
        "Hot Tub",
        "Shed",
        "Patio",
        "Pool",
        "Covered Porch",
        "Sidewalk",
        "Retaining Wall",
        "Deck with Steps",
        "Balcony"
      ]
    },
    {
      "title": "Appurtenance Material",
      "options": [
        "Composite",
        "Wood",
        "Concrete",
        "Masonry"
      ]
    },
    {
      "title": "Driveway Material",
      "options": [
        "Concrete",
        "Asphalt",
        "Cobblestone",
        "Pavers",
        "Gravel",
        "Brick",
        "Street Parking",
        "Dirt"
      ]
    },
    {
      "title": "Walkway Material",
      "options": [
        "Concrete",
        "Stamped Concrete",
        "Pavers",
        "Brick",
        "Asphalt",
        "Gravel",
        "Stone",
        "Flagstone",
        "Dirt",
        "None"
      ]
    }
  ],
  "Roof": [
    {
      "title": "Inspection Method",
      "options": [
        "Binoculars",
        "Ground",
        "Drone",
        "Ladder",
        "Roof"
      ]
    },
    {
      "title": "Roof Type/Style",
      "options": [
        "Gambrel",
        "Combination",
        "Hip",
        "Mansard",
        "Shed",
        "Gable",
        "Flat"
      ]
    },
    {
      "title": "Roof Covering Material",
      "options": [
        "Solar",
        "Ceramic",
        "Asbestos",
        "Tile",
        "Metal",
        "Concrete",
        "Fiberglass",
        "Slate",
        "Asphalt",
        "Wood"
      ]
    },
    {
      "title": "Gutter Material",
      "options": [
        "Aluminum",
        "Copper",
        "Vinyl",
        "Steel",
        "Seamless Aluminum",
        "None"
      ]
    },
    {
      "title": "Flashing Material",
      "options": [
        "Aluminum",
        "Lead",
        "Foam",
        "Asphalt",
        "Copper",
        "Rubber"
      ]
    },
    {
      "title": "Chimney",
      "options": [
        "Present",
        "Not Present",
        "Masonry",
        "Metal",
        "Viewed From Ground",
        "Not Fully Visible"
      ]
    }
  ],
  "Basement, Foundation, Crawlspace & Structure": [
    {
      "title": "Under-Floor Access Location",
      "options": [
        "Interior Closet",
        "Hallway",
        "Garage",
        "Exterior",
        "Basement",
        "Under Stairs",
        "Bedroom Closet",
        "Front",
        "Rear",
        "North",
        "South",
        "East",
        "West",
        "None Found",
        "Unknown"
      ]
    },
    {
      "title": "Inspection Method",
      "options": [
        "Infrared",
        "Attic Access",
        "Visual",
        "Crawlspace Access"
      ]
    },
    {
      "title": "Foundation Material",
      "options": [
        "Brick",
        "Concrete",
        "Rock",
        "Pier and Beam",
        "Stone",
        "Masonry Block",
        "Slab on Grade"
      ]
    },
    {
      "title": "Basement/Crawlspace Floor",
      "options": [
        "Concrete",
        "Wood",
        "Vapor Barrier",
        "Dirt",
        "Gravel"
      ]
    },
    {
      "title": "Structure Material",
      "options": [
        "Wood Beams",
        "Slab",
        "Wood I-Joists",
        "Steel I-Beams",
        "CMU",
        "Concrete",
        "Steel Joists",
        "Engineered Floor Trusses",
        "Inaccessible"
      ]
    },
    {
      "title": "Sub-Floor",
      "options": [
        "Inaccessible",
        "Plank",
        "OSB",
        "Plywood"
      ]
    }
  ],
  "Heating": [
    {
      "title": "Thermostat Location",
      "options": [
        "Hallway",
        "Living Room",
        "Living Area",
        "Kitchen",
        "Main Level",
        "Upper Level",
        "Basement",
        "Bedroom",
        "Foyer/Entry",
        "Front",
        "Rear",
        "Unknown"
      ]
    },
    {
      "title": "Brand",
      "options": [
        "Rheem",
        "American Standard",
        "York",
        "Trane",
        "Payne",
        "Coleman",
        "Carrier",
        "Bryant",
        "Lennox",
        "Goodman",
        "Amana"
      ]
    },
    {
      "title": "Energy Source",
      "options": [
        "Coal",
        "Gas",
        "Oil",
        "Solar",
        "Natural Gas",
        "Corn",
        "Kerosene",
        "Propane",
        "Electric",
        "Wood"
      ]
    },
    {
      "title": "Heat Type",
      "options": [
        "Radiant Heat",
        "Electric Baseboard",
        "Space Heater",
        "Forced Air",
        "Hydronic",
        "Electric Wall Heater",
        "Steam Boiler",
        "Heat Pump",
        "Gas-Fired Heat",
        "None"
      ]
    },
    {
      "title": "Responds To Normal Operating Controls",
      "options": [
        "Yes",
        "No"
      ]
    },
    {
      "title": "Ductwork",
      "options": [
        "Insulated",
        "Non-insulated"
      ]
    },
    {
      "title": "Presence of Installed Heat Source in Each Room",
      "options": [
        "Yes",
        "No"
      ]
    }
  ],
  "Cooling": [
    {
      "title": "Thermostat Location",
      "options": [
        "Hallway",
        "Living Room",
        "Living Area",
        "Kitchen",
        "Main Level",
        "Upper Level",
        "Basement",
        "Bedroom",
        "Foyer/Entry",
        "Front",
        "Rear",
        "Unknown"
      ]
    },
    {
      "title": "Brand",
      "options": [
        "Amana",
        "Frigidaire",
        "Carrier",
        "Coleman",
        "Goodman",
        "Lennox",
        "Rheem",
        "York",
        "Trane",
        "Bryant",
        "Maytag",
        "General Electric",
        "Luxaire",
        "Armstrong",
        "Unknown"
      ]
    },
    {
      "title": "Energy Source/Type",
      "options": [
        "Ceiling Fan",
        "Whole House Fan",
        "Window AC",
        "Heat Pump",
        "Oil",
        "Gas",
        "Electric",
        "Central Air Conditioner",
        "Swamp Cooler",
        "Attic Fan"
      ]
    },
    {
      "title": "Location",
      "options": [
        "Exterior East",
        "Exterior North",
        "Patio Area",
        "Rear",
        "Exterior West",
        "Exterior South",
        "Roof",
        "Left of Front"
      ]
    },
    {
      "title": "SEER Rating",
      "type": "text",
      "unitOptions": [
        "SEER"
      ],
      "options": []
    },
    {
      "title": "Responds To Normal Controls",
      "options": [
        "Yes",
        "No"
      ]
    },
    {
      "title": "Configuration",
      "options": [
        "Central",
        "Window Unit",
        "Split"
      ]
    },
    {
      "title": "Presence of Installed Cooling in Each Room",
      "options": [
        "Yes",
        "No"
      ]
    }
  ],
  "Plumbing": [
    {
      "title": "Filters",
      "options": [
        "None",
        "Sediment Filter",
        "Whole House Conditioner",
        "Unknown",
        "System Flush"
      ]
    },
    {
      "title": "Water Source",
      "options": [
        "Public",
        "Unknown",
        "Spring",
        "Well"
      ]
    },
    {
      "title": "Main Water Shutoff Location",
      "options": [
        "Basement",
        "Crawlspace",
        "Garage",
        "Utility/Mechanical Room",
        "Under Kitchen Sink",
        "Exterior / Meter Pit",
        "Front",
        "Rear",
        "North",
        "South",
        "East",
        "West",
        "Not Located",
        "Unknown"
      ]
    },
    {
      "title": "Main Fuel/Gas Shutoff Location",
      "options": [
        "None (All-Electric)",
        "Basement",
        "Crawlspace",
        "Garage",
        "Utility/Mechanical Room",
        "Exterior - At Meter",
        "At Furnace",
        "At Water Heater",
        "Front",
        "Rear",
        "North",
        "South",
        "East",
        "West",
        "Not Located",
        "Unknown"
      ]
    },
    {
      "title": "Fuel Storage Location",
      "options": [
        "None Observed",
        "Basement",
        "Garage",
        "Utility/Mechanical Room",
        "Exterior - Above Ground Tank",
        "Exterior - Underground Tank",
        "Unknown"
      ]
    },
    {
      "title": "Drain Location",
      "options": [
        "Basement",
        "East",
        "North",
        "Inaccessible",
        "Crawlspace",
        "West",
        "South",
        "Unknown"
      ]
    },
    {
      "title": "Drain Size",
      "options": [
        "1 1/2 inch",
        "Unknown",
        "2 inch",
        "Drain Not Present"
      ]
    },
    {
      "title": "Drain Material",
      "options": [
        "ABS",
        "Copper",
        "PVC",
        "Lead",
        "Iron",
        "Unknown"
      ]
    },
    {
      "title": "Distribution Material",
      "options": [
        "Copper",
        "Galvanized",
        "Pex",
        "Unknown",
        "PVC",
        "Hose",
        "Poly"
      ]
    },
    {
      "title": "Water Supply Material",
      "options": [
        "Copper",
        "PVC",
        "Hose",
        "Poly",
        "Galvanized",
        "Unknown",
        "Pex"
      ]
    },
    {
      "title": "Water Heater Capacity",
      "type": "text",
      "unitOptions": [
        "gallons"
      ],
      "options": []
    },
    {
      "title": "Water Heater Location",
      "options": [
        "Attic",
        "Basement",
        "Main Floor",
        "Kitchen Pantry",
        "Washer/Dryer Area",
        "Crawlspace",
        "Utility Room",
        "Closet"
      ]
    },
    {
      "title": "Water Heater Manufacturer",
      "options": [
        "Ecosmart",
        "Heat Pump",
        "Rinnai",
        "GE",
        "State",
        "Whirlpool",
        "AO Smith",
        "Kenmore",
        "Rheem",
        "Bradford & White",
        "Unknown",
        "MayTag"
      ]
    },
    {
      "title": "Water Heater Power Source/Type",
      "options": [
        "Electric",
        "Solar",
        "Indirect",
        "Gas",
        "Propane",
        "Tankless"
      ]
    }
  ],
  "Electrical": [
    {
      "title": "Electrical Service Conductors",
      "options": [
        "Below Ground",
        "220 Volts",
        "Copper",
        "Overhead",
        "Aluminum",
        "120 Volts"
      ]
    },
    {
      "title": "Main Panel Location",
      "options": [
        "Left",
        "Hallway",
        "Right",
        "Back",
        "Laundry Area",
        "Basement",
        "Garage",
        "Front",
        "Kitchen",
        "Bedroom Closet"
      ]
    },
    {
      "title": "Panel Capacity",
      "options": [
        "100 AMP",
        "125 AMP",
        "200 AMP",
        "60 AMP",
        "Insufficient",
        "225 AMP",
        "150 AMP",
        "400 AMP",
        "800 AMP",
        "Unknown"
      ]
    },
    {
      "title": "Panel Manufacturer",
      "options": [
        "Challenger",
        "Federal Pioneer",
        "Cutler Hammer",
        "Unknown",
        "Gould",
        "Murray",
        "Siemens",
        "T&B",
        "Westinghouse",
        "Bryant",
        "Crouse-Hinds",
        "General Switch",
        "Federal Pacific",
        "ITE",
        "Square D",
        "General Electric",
        "Walker"
      ]
    },
    {
      "title": "Panel Type",
      "options": [
        "Circuit Breaker",
        "Fuses"
      ]
    },
    {
      "title": "Sub Panel Location",
      "options": [
        "Kitchen",
        "Back",
        "Right",
        "Garage",
        "Interior",
        "Upstairs Closet",
        "Bedroom Closet",
        "Hallway",
        "Left",
        "Front",
        "Exterior",
        "Basement",
        "Rear"
      ]
    },
    {
      "title": "Branch Wire 15 and 20 AMP",
      "options": [
        "Aluminum",
        "Copper"
      ]
    },
    {
      "title": "Wiring Method",
      "options": [
        "Conduit",
        "Not Visible",
        "Surface Mounted Distribution",
        "Knob & Tube",
        "Romex"
      ]
    },
    {
      "title": "Exterior Lighting",
      "options": [
        "Yes",
        "No"
      ]
    },
    {
      "title": "Interior Lighting Fixtures",
      "options": [
        "Yes",
        "No"
      ]
    },
    {
      "title": "Smoke Detector Present",
      "options": [
        "Yes",
        "No"
      ]
    },
    {
      "title": "Smoke Detector Tested",
      "options": [
        "Yes",
        "No"
      ]
    },
    {
      "title": "Carbon Monoxide Detector Present",
      "options": [
        "Yes",
        "No"
      ]
    },
    {
      "title": "Carbon Monoxide Detector Tested",
      "options": [
        "Yes",
        "No"
      ]
    }
  ],
  "Fireplace": [
    {
      "title": "Fireplace Type",
      "options": [
        "Gas",
        "Electric",
        "None",
        "Wood",
        "Ethanol"
      ]
    },
    {
      "title": "Fireplace Present",
      "options": [
        "Yes",
        "No"
      ]
    }
  ],
  "Attic, Insulation & Ventilation": [
    {
      "title": "Dryer Power Source",
      "options": [
        "110 Volt",
        "Gas",
        "220 Electric",
        "Propane"
      ]
    },
    {
      "title": "Dryer Vent",
      "options": [
        "Metal",
        "None Found",
        "Rigid PVC",
        "Plastic (Flex)",
        "Metal (Flex)",
        "Unknown",
        "Vinyl (Flex)"
      ]
    },
    {
      "title": "Flooring Insulation",
      "options": [
        "Present",
        "Partial / Spotty",
        "None",
        "Not Visible / Inaccessible",
        "Unknown"
      ]
    },
    {
      "title": "Insulation Type",
      "options": [
        "Batt",
        "Blown-in",
        "Loose-fill",
        "Fiberglass",
        "Cellulose",
        "Mineral Wool",
        "Spray Foam",
        "Foam Board",
        "Vermiculite",
        "None",
        "Unknown"
      ]
    },
    {
      "title": "Insulation Facing",
      "options": [
        "Faced",
        "Unfaced",
        "Foiled-faced",
        "Not Applicable",
        "Unknown"
      ]
    },
    {
      "title": "Insulation Depth",
      "type": "text",
      "unitOptions": [
        "inches"
      ],
      "options": []
    },
    {
      "title": "R-value",
      "type": "text",
      "options": []
    },
    {
      "title": "Ventilation Type",
      "options": [
        "Gable Vents",
        "Passive",
        "Soffit Vents",
        "Turbines",
        "Attic Fan",
        "None Found",
        "Ridge Vents",
        "Thermostatically Controlled Fan",
        "Whole House Fan"
      ]
    },
    {
      "title": "Exhaust Fans",
      "options": [
        "Fan Only",
        "Fan/Heat/Light",
        "Fan with Light",
        "None"
      ]
    }
  ],
  "Doors, Windows & Interior": [
    {
      "title": "Interior Doors",
      "options": [
        "Wood",
        "Hollow Core",
        "Metal"
      ]
    },
    {
      "title": "Window Manufacturer",
      "options": [
        "Andersen",
        "Marvin",
        "Unknown",
        "JELD-WEN",
        "Milgard",
        "Pella"
      ]
    },
    {
      "title": "Window Type",
      "options": [
        "Casement",
        "Single Pane",
        "Sliders",
        "Storm",
        "Drop-down",
        "Single-hung",
        "Double-hung",
        "Thermal"
      ]
    },
    {
      "title": "Floor Coverings",
      "options": [
        "Bamboo",
        "Carpet",
        "Engineered Wood",
        "Laminate",
        "Tile",
        "Brick",
        "Concrete",
        "Hardwood",
        "Linoleum",
        "Vinyl"
      ]
    },
    {
      "title": "Wall Material",
      "options": [
        "Brick",
        "Paneling",
        "Wood",
        "Tile",
        "Compressed Board",
        "Drywall",
        "Plaster",
        "Gypsum Board",
        "Unfinished",
        "Wallpaper"
      ]
    },
    {
      "title": "Ceiling Material",
      "options": [
        "Ceiling Tiles",
        "Gypsum Board",
        "Popcorn",
        "Unfinished",
        "Wood",
        "Compressed Board",
        "Plaster",
        "Suspended Ceiling Panels",
        "Wallpaper",
        "Drywall"
      ]
    },
    {
      "title": "Cabinetry",
      "options": [
        "Laminate",
        "Plastic",
        "Metal",
        "Wood"
      ]
    },
    {
      "title": "Countertop Material",
      "options": [
        "Composite",
        "Concrete",
        "Granite",
        "Metal",
        "Quartz",
        "Stainless Steel",
        "Wood Butcher Block",
        "Laminate",
        "Corian",
        "Marble",
        "Porcelain",
        "Recycled Glass",
        "Tile"
      ]
    }
  ],
  "Built-in Appliances": [
    {
      "title": "Dishwasher Brand",
      "options": [
        "Kenmore",
        "Bosch",
        "Electrolux",
        "GE",
        "Miele",
        "Unknown",
        "Whirlpool",
        "Asko",
        "Maytag",
        "Frigidaire",
        "KitchenAid",
        "Samsung",
        "LG"
      ]
    },
    {
      "title": "Dishwasher Model",
      "type": "text",
      "options": []
    },
    {
      "title": "Refrigerator Brand",
      "options": [
        "Frigidaire",
        "Whirlpool",
        "Kenmore",
        "Unknown",
        "Samsung",
        "GE",
        "Thermador",
        "LG",
        "Maytag"
      ]
    },
    {
      "title": "Refrigerator Model",
      "type": "text",
      "options": []
    },
    {
      "title": "Exhaust Hood Type",
      "options": [
        "None",
        "Vented",
        "Re-circulate"
      ]
    },
    {
      "title": "Range/Oven Brand",
      "options": [
        "Amana",
        "Brown",
        "KitchenAid",
        "Frigidaire",
        "Bosch",
        "Jenn-Air",
        "Maytag",
        "Thermador",
        "Viking",
        "GE",
        "American",
        "Caldera",
        "Caloric",
        "Hotpoint",
        "LG",
        "Kenmore",
        "Samsung",
        "Unknown",
        "Whirlpool"
      ]
    },
    {
      "title": "Range/Oven Model",
      "type": "text",
      "options": []
    },
    {
      "title": "Range/Oven Energy Source",
      "options": [
        "Coal",
        "Gas",
        "Electric",
        "Wood"
      ]
    },
    {
      "title": "Garbage Disposal",
      "options": [
        "Yes",
        "No"
      ]
    }
  ],
  "Garage": [
    {
      "title": "Garage Door Material",
      "options": [
        "Aluminum",
        "Wood Composite",
        "Vinyl",
        "Insulated",
        "Steel",
        "Wood",
        "Fiberglass",
        "Glass"
      ]
    },
    {
      "title": "Garage Door Type",
      "options": [
        "Sliding",
        "Up-and-Over",
        "Automatic",
        "Folding",
        "Roll-Up",
        "Sectional"
      ]
    }
  ],
  // --- Pre-Drywall (framing-stage) sections. These document what was PRESENT
  // and REVIEWED at the framing stage; actual defects still become findings.
  // The last option in the review groups ("Not Installed…"/"Not Applicable")
  // lets an inspector record a component that isn't there yet without leaving
  // the report ambiguous.
  "Structural Framing": [
    {
      "title": "Framing Observed",
      "options": [
        "Wall Framing",
        "Roof / Truss Framing",
        "Headers / Lintels",
        "Beams / Girders",
        "Posts / Columns",
        "Floor Joists",
        "Blocking / Bracing",
        "Connectors / Hangers",
        "Framing Penetrations",
        "Exterior Wall Sheathing",
        "Subfloor / Decking"
      ]
    },
    {
      "title": "Framing Material",
      "options": [
        "Dimensional Lumber",
        "Engineered Lumber (LVL / LSL / PSL)",
        "Wood I-Joists",
        "Floor Trusses",
        "Roof Trusses",
        "Steel",
        "Not Visible"
      ]
    },
    {
      "title": "Fasteners / Connectors Observed",
      "options": [
        "Nails",
        "Structural Screws",
        "Joist Hangers",
        "Hurricane / Seismic Ties",
        "Anchor Bolts",
        "Hold-downs",
        "Not Visible"
      ]
    }
  ],
  "Fire & Draft Stopping": [
    {
      "title": "Penetrations Reviewed",
      "options": [
        "Top Plate Penetrations",
        "Bottom Plate Penetrations",
        "Plumbing Penetrations",
        "Electrical Penetrations",
        "HVAC / Mechanical Penetrations",
        "Concealed Chases / Soffits",
        "Garage / Dwelling Separation"
      ]
    },
    {
      "title": "Fire / Draft Stopping",
      "options": [
        "Present Where Observed",
        "Fire Caulk / Sealant",
        "Mineral Wool / Batt",
        "Fire-rated Foam",
        "Not Installed at Time of Inspection",
        "Not Applicable"
      ]
    }
  ]
};
