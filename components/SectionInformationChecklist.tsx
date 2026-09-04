"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabaseClient";

type ChecklistGroup = {
  title: string;
  type?: "checkbox" | "text";
  unitOptions?: string[];
  options: string[];
};

type SelectionRow = {
  id: string;
  inspection_id: string;
  section: string;
  group_title: string;
  value: string;
  custom_text?: string | null;
};

type OptionOverride = {
  id: string;
  section: string;
  group_title: string;
  option_label: string;
  replacement_label?: string | null;
  hidden?: boolean | null;
};

// A checklist option as rendered. `custom` options are real rows in
// section_checklist_options (identified by overrideId/optionLabel) and can be
// hard-deleted; built-in options live in code and are hidden via an override
// row keyed by their original label (baseOriginal).
type RenderOption = {
  label: string;
  custom: boolean;
  baseOriginal?: string;
  overrideId?: string;
  optionLabel?: string;
};

const CHECKLIST_LIBRARY: Record<string, ChecklistGroup[]> = {
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
      "title": "R-value",
      "type": "text",
      "unitOptions": [
        "null"
      ],
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
  ]
};

function SectionInformationChecklist({
  inspectionId,
  section,
  weatherAddress,
  weatherDate,
  weatherHour,
}: {
  inspectionId: string;
  section: string;
  weatherAddress?: string;
  weatherDate?: string | null;
  weatherHour?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [selections, setSelections] = useState<SelectionRow[]>([]);
  const [optionOverrides, setOptionOverrides] = useState<OptionOverride[]>([]);
  const [otherTextByGroup, setOtherTextByGroup] = useState<Record<string, string>>({});
  const [textValueByGroup, setTextValueByGroup] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editingOption, setEditingOption] = useState<{ groupTitle: string; optionLabel: string; nextLabel: string } | null>(null);
  const [addingOptionGroup, setAddingOptionGroup] = useState("");
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");



  function showMessage(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);
  }

  const baseGroups = useMemo(
    () => CHECKLIST_LIBRARY[section] || [{ title: "Custom Info", options: [] }],
    [section]
  );

  // Only sections that actually have Temperature / Weather Conditions groups
  // (i.e. Inspection Details) get the one-tap weather auto-fill.
  const supportsWeather = baseGroups.some(
    (group) => group.title === "Temperature" || group.title === "Weather Conditions"
  );

  // Fetch the actual weather for the property + inspection date/time and fill
  // the Temperature and Weather Conditions fields. Reuses the same save paths as
  // manual edits so the UI updates immediately and everything persists.
  async function autofillWeather() {
    if (weatherLoading || !supportsWeather) return;
    if (!weatherAddress) {
      showMessage("error", "No property address on file to look up weather.");
      return;
    }

    setWeatherLoading(true);
    try {
      const params = new URLSearchParams({
        mode: weatherDate ? "date" : "current",
        address: weatherAddress,
      });
      if (weatherDate) {
        params.set("date", weatherDate);
        if (weatherHour != null && Number.isFinite(weatherHour)) {
          params.set("hour", String(weatherHour));
        }
      }

      const res = await fetch(`/api/weather?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.weather) {
        throw new Error(json?.error || "Weather lookup failed.");
      }

      const w = json.weather;
      setOpen(true);

      if (w.temperatureF != null) {
        const tempStr = String(w.temperatureF);
        setTextValueByGroup((prev) => ({ ...prev, Temperature: tempStr }));
        await saveTextValue("Temperature", tempStr);
        if (!isSelected("Temperature", "Fahrenheit (F)")) {
          await toggleSelection("Temperature", "Fahrenheit (F)");
        }
      }

      // Set the matching Weather Conditions option. Use conditionSimple
      // ("Clear" | "Cloudy" | "Rain" | "Snow" | "Fog" | "Storm") because those
      // are the actual option labels — the detailed conditionText (e.g. "Partly
      // cloudy") never matches, which is why the condition wasn't auto-filling.
      //
      // Weather Conditions is single-select for auto-fill: FIRST clear any
      // previously-set condition, so re-running actually CORRECTS a stale value
      // (e.g. an old forecast's "Rain") instead of leaving it stuck alongside
      // the new one. Without this, a wrong condition never went away on re-run.
      const conditionBucket = w.conditionSimple || w.conditionText;
      if (conditionBucket) {
        const staleConditions = selections.filter(
          (item) =>
            item.group_title === "Weather Conditions" &&
            item.value !== "__TEXT_VALUE__" &&
            item.value !== conditionBucket,
        );
        if (staleConditions.length > 0) {
          const staleIds = staleConditions.map((s) => s.id);
          setSelections((prev) => prev.filter((item) => !staleIds.includes(item.id)));
          await supabase
            .from("section_checklist_selections")
            .delete()
            .in("id", staleIds);
        }
        if (!isSelected("Weather Conditions", conditionBucket)) {
          await toggleSelection("Weather Conditions", conditionBucket);
        }
      }

      const parts = [
        w.temperatureF != null ? `${w.temperatureF}°F` : "",
        w.conditionText || "",
      ].filter(Boolean);
      const setStr = `Weather set${parts.length ? `: ${parts.join(", ")}` : ""}.`;
      if (json.isForecast) {
        // A future date only has a forecast, which changes day to day. Warn so a
        // stale prediction isn't left in the report — re-run on inspection day.
        showMessage(
          "error",
          `${setStr} Note: this is a forecast for a future date — re-run Auto-fill Weather on the inspection day for actual conditions.`,
        );
      } else {
        showMessage("success", setStr);
      }
    } catch (error: any) {
      showMessage("error", error?.message || "Weather lookup failed.");
    } finally {
      setWeatherLoading(false);
    }
  }

  useEffect(() => {
    async function load() {
      if (!inspectionId || !section) return;

      const [selectedResult, overrideResult] = await Promise.all([
        supabase
          .from("section_checklist_selections")
          .select("*")
          .eq("inspection_id", inspectionId)
          .eq("section", section)
          .order("created_at", { ascending: true }),

        supabase
          .from("section_checklist_options")
          .select("*")
          .eq("section", section)
          .order("created_at", { ascending: true }),
      ]);

      if (!selectedResult.error) {
        const rows = selectedResult.data || [];
        setSelections(rows);

        const textValues: Record<string, string> = {};
        rows.forEach((row: SelectionRow) => {
          if (row.value === "__TEXT_VALUE__") textValues[row.group_title] = row.custom_text || "";
        });
        setTextValueByGroup(textValues);
      }

      if (!overrideResult.error) setOptionOverrides(overrideResult.data || []);
    }

    load();
  }, [inspectionId, section]);

  function getGroupOptions(group: ChecklistGroup): RenderOption[] {
    const overridesForGroup = optionOverrides.filter((item) => item.group_title === group.title);
    const hidden = new Set(
      overridesForGroup.filter((item) => item.hidden).map((item) => item.option_label)
    );
    const renamed = new Map(
      overridesForGroup
        .filter((item) => item.replacement_label && !item.hidden)
        .map((item) => [item.option_label, item.replacement_label as string])
    );

    const base: RenderOption[] = group.options
      .filter((option) => !hidden.has(option))
      .map((option) => ({
        label: renamed.get(option) || option,
        baseOriginal: option,
        custom: false,
      }));

    const customAdded: RenderOption[] = overridesForGroup
      .filter((item) => !item.hidden && item.option_label.startsWith("__CUSTOM__:"))
      .map((item) => ({
        label: item.replacement_label || item.option_label.replace("__CUSTOM__:", ""),
        custom: true,
        overrideId: item.id,
        optionLabel: item.option_label,
      }));

    return [...base, ...customAdded];
  }

  // Unit options (e.g. Fahrenheit/Celsius, SEER, gallons) were rendered from the
  // raw list, so Edit/Delete wrote override rows that were never consulted —
  // a silent no-op. Run them through the same hide/rename override pipeline.
  function getGroupUnitOptions(group: ChecklistGroup): RenderOption[] {
    if (!group.unitOptions) return [];
    const overridesForGroup = optionOverrides.filter((item) => item.group_title === group.title);
    const hidden = new Set(
      overridesForGroup.filter((item) => item.hidden).map((item) => item.option_label),
    );
    const renamed = new Map(
      overridesForGroup
        .filter((item) => item.replacement_label && !item.hidden)
        .map((item) => [item.option_label, item.replacement_label as string]),
    );
    return group.unitOptions
      .filter((unit) => !hidden.has(unit))
      .map((unit) => ({ label: renamed.get(unit) || unit, baseOriginal: unit, custom: false }));
  }

  function isSelected(groupTitle: string, value: string) {
    return selections.some((item) => item.group_title === groupTitle && item.value === value);
  }

  async function toggleSelection(groupTitle: string, value: string) {
    if (!inspectionId || !section) return;

    const existing = selections.find(
      (item) => item.group_title === groupTitle && item.value === value
    );

    // Optimistic update: reflect the toggle in the UI immediately and persist in
    // the background. Previously every click awaited a network round-trip while a
    // single `saving` flag disabled the entire checklist, which made clicking
    // through options feel slow and laggy on large reports.
    if (existing) {
      setSelections((prev) => prev.filter((item) => item.id !== existing.id));
      const { error } = await supabase
        .from("section_checklist_selections")
        .delete()
        .eq("id", existing.id);
      if (error) {
        // Roll back on failure.
        setSelections((prev) => [...prev, existing]);
        showMessage("error", error?.message || "Failed to update checklist selection.");
      }
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const optimistic: SelectionRow = {
      id: tempId,
      inspection_id: inspectionId,
      section,
      group_title: groupTitle,
      value,
    };
    setSelections((prev) => [...prev, optimistic]);

    const { data, error } = await supabase
      .from("section_checklist_selections")
      .insert({ inspection_id: inspectionId, section, group_title: groupTitle, value })
      .select("*")
      .single();

    if (error || !data) {
      setSelections((prev) => prev.filter((item) => item.id !== tempId));
      showMessage("error", error?.message || "Failed to save checklist selection.");
      return;
    }

    // Swap the optimistic row for the real one from the database.
    setSelections((prev) => prev.map((item) => (item.id === tempId ? data : item)));
  }

  async function saveTextValue(groupTitle: string, value: string) {
    if (saving || !inspectionId || !section) return;
    setSaving(true);

    try {
      const existing = selections.find((item) => item.group_title === groupTitle && item.value === "__TEXT_VALUE__");

      if (existing) {
        const { data, error } = await supabase
          .from("section_checklist_selections")
          .update({ custom_text: value })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        setSelections((prev) => prev.map((item) => (item.id === existing.id ? data : item)));
      } else {
        const { data, error } = await supabase
          .from("section_checklist_selections")
          .insert({ inspection_id: inspectionId, section, group_title: groupTitle, value: "__TEXT_VALUE__", custom_text: value })
          .select("*")
          .single();
        if (error) throw error;
        if (data) setSelections((prev) => [...prev, data]);
      }
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to save checklist value.");
    } finally {
      setSaving(false);
    }
  }

  async function addOther(groupTitle: string) {
    const clean = (otherTextByGroup[groupTitle] || "").trim();
    if (!clean || saving) return;
    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("section_checklist_selections")
        .insert({ inspection_id: inspectionId, section, group_title: groupTitle, value: "OTHER", custom_text: clean })
        .select("*")
        .single();
      if (error) throw error;
      if (data) setSelections((prev) => [...prev, data]);
      setOtherTextByGroup((prev) => ({ ...prev, [groupTitle]: "" }));
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to add OTHER item.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelection(id: string) {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("section_checklist_selections").delete().eq("id", id);
      if (error) throw error;
      setSelections((prev) => prev.filter((item) => item.id !== id));
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to remove checklist item.");
    } finally {
      setSaving(false);
    }
  }

  async function addOption(groupTitle: string) {
    const clean = newOptionLabel.trim();
    if (!clean || saving) return;

    // Don't create an option that already exists (case-insensitive) — either a
    // built-in option for this group or a custom one already added. This is what
    // produced duplicate "Rain"/"Clear" chips. If it already exists, just close
    // the add box instead of inserting a duplicate row.
    const existingLabels = getGroupOptions(
      baseGroups.find((g) => g.title === groupTitle) || { title: groupTitle, options: [] },
    ).map((o) => o.label.trim().toLowerCase());
    if (existingLabels.includes(clean.toLowerCase())) {
      showMessage("error", `"${clean}" is already an option here.`);
      setNewOptionLabel("");
      setAddingOptionGroup("");
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("section_checklist_options")
        .insert({ section, group_title: groupTitle, option_label: `__CUSTOM__:${clean}`, replacement_label: clean, hidden: false })
        .select("*")
        .single();
      if (error) throw error;
      if (data) setOptionOverrides((prev) => [...prev, data]);
      setNewOptionLabel("");
      setAddingOptionGroup("");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to add checklist option.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOptionEdit() {
    if (!editingOption || saving) return;
    const clean = editingOption.nextLabel.trim();
    if (!clean) return;
    setSaving(true);

    try {
      const existing = optionOverrides.find((item) => item.group_title === editingOption.groupTitle && item.option_label === editingOption.optionLabel);

      if (existing) {
        const { data, error } = await supabase
          .from("section_checklist_options")
          .update({ replacement_label: clean, hidden: false })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        setOptionOverrides((prev) => prev.map((item) => (item.id === existing.id ? data : item)));
      } else {
        const { data, error } = await supabase
          .from("section_checklist_options")
          .insert({ section, group_title: editingOption.groupTitle, option_label: editingOption.optionLabel, replacement_label: clean, hidden: false })
          .select("*")
          .single();
        if (error) throw error;
        if (data) setOptionOverrides((prev) => [...prev, data]);
      }

      // Migrate any already-saved selections from the OLD display label to the
      // new one. Selections are stored by the label shown at click time, so
      // without this a renamed-after-checked option would render unchecked and
      // re-clicking would insert a duplicate row. Only touches this rename.
      const oldDisplayLabel =
        existing?.replacement_label ||
        editingOption.optionLabel.replace(/^__CUSTOM__:/, "");
      if (oldDisplayLabel && oldDisplayLabel !== clean) {
        const { error: migrateError } = await supabase
          .from("section_checklist_selections")
          .update({ value: clean })
          .eq("inspection_id", inspectionId)
          .eq("section", section)
          .eq("group_title", editingOption.groupTitle)
          .eq("value", oldDisplayLabel);
        if (!migrateError) {
          setSelections((prev) =>
            prev.map((item) =>
              item.group_title === editingOption.groupTitle && item.value === oldDisplayLabel
                ? { ...item, value: clean }
                : item,
            ),
          );
        }
      }

      setEditingOption(null);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to edit checklist option.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOption(groupTitle: string, option: RenderOption) {
    if (saving) return;
    if (!window.confirm(`Delete "${option.label}" from this checklist group?`)) return;
    setSaving(true);

    try {
      if (option.custom && option.overrideId) {
        // Custom options are real rows in section_checklist_options -- hard-delete
        // so they actually disappear. (The old code inserted a hidden row keyed by
        // the display label, which never matched the "__CUSTOM__:" row, so custom
        // options could never be deleted.)
        const { error } = await supabase
          .from("section_checklist_options")
          .delete()
          .eq("id", option.overrideId);
        if (error) throw error;
        setOptionOverrides((prev) => prev.filter((item) => item.id !== option.overrideId));
      } else {
        // Built-in options live in code, so hide them with an override row keyed by
        // their ORIGINAL label (what getGroupOptions filters on). Reuse an existing
        // override row for this option if one is already present (e.g. a rename).
        const originalLabel = option.baseOriginal || option.label;
        const existing = optionOverrides.find(
          (item) => item.group_title === groupTitle && item.option_label === originalLabel
        );

        if (existing) {
          const { data, error } = await supabase
            .from("section_checklist_options")
            .update({ hidden: true })
            .eq("id", existing.id)
            .select("*")
            .single();
          if (error) throw error;
          if (data) setOptionOverrides((prev) => prev.map((item) => (item.id === existing.id ? data : item)));
        } else {
          const { data, error } = await supabase
            .from("section_checklist_options")
            .insert({ section, group_title: groupTitle, option_label: originalLabel, hidden: true })
            .select("*")
            .single();
          if (error) throw error;
          if (data) setOptionOverrides((prev) => [...prev, data]);
        }
      }
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to delete checklist option.");
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = selections.filter((item) => item.value !== "__TEXT_VALUE__").length;

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[var(--fl-raised)]"
      >
        <div>
          <h3 className="text-xl font-semibold text-[var(--fl-accent-text)]">Information</h3>
          <p className="mt-1 text-sm text-[var(--fl-muted)]">
            {selectedCount > 0 ? `${selectedCount} item${selectedCount === 1 ? "" : "s"} selected` : "No information selected"}
          </p>
        </div>
        <span className="rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)]">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {supportsWeather && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--fl-line)] px-5 py-3">
          <button
            type="button"
            onClick={autofillWeather}
            disabled={weatherLoading}
            aria-busy={weatherLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-500 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-[var(--fl-info-text)] transition hover:bg-sky-500/20 disabled:cursor-wait disabled:opacity-60"
          >
            {weatherLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Getting weather…
              </>
            ) : (
              <>🌤 Auto-fill Weather</>
            )}
          </button>
          <span className="text-xs text-[var(--fl-muted)]">
            Fills Temperature &amp; Weather Conditions from the inspection date &amp; property location.
          </span>
        </div>
      )}

      {message && (
        <div
          className={`border-t border-[var(--fl-line)] px-5 py-3 text-sm font-bold ${
            messageType === "success"
              ? "bg-emerald-500/10 text-[var(--fl-good-text)]"
              : "bg-red-500/10 text-[var(--fl-crit-text)]"
          }`}
        >
          {message}
        </div>
      )}

      {selectedCount > 0 && (
        <div className="border-t border-[var(--fl-line)] px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {selections.filter((item) => item.value !== "__TEXT_VALUE__").map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => removeSelection(item.id)}
                className="rounded-full border border-teal-500/60 bg-teal-500/10 px-3 py-1 text-sm font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/20"
              >
                {item.group_title}: {item.custom_text || item.value} ×
              </button>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-5 border-t border-[var(--fl-line)] p-5">
          {baseGroups.map((group) => {
            const options = getGroupOptions(group);
            const textValue = textValueByGroup[group.title] || "";
            const otherRows = selections.filter((item) => item.group_title === group.title && item.value === "OTHER");

            return (
              <div key={group.title} className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold text-[var(--fl-text)]">{group.title}</h4>
                  <button
                    type="button"
                    onClick={() => { setAddingOptionGroup(group.title); setNewOptionLabel(""); }}
                    className="rounded-lg border border-teal-500 px-3 py-1 text-xs font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
                  >
                    + Add Option
                  </button>
                </div>

                {group.type === "text" && (
                  <div className="mb-4">
                    <input
                      value={textValue}
                      onChange={(event) => setTextValueByGroup((prev) => ({ ...prev, [group.title]: event.target.value }))}
                      onBlur={() => saveTextValue(group.title, textValueByGroup[group.title] || "")}
                      placeholder="#"
                      className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                    />
                    {group.unitOptions && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {getGroupUnitOptions(group).map((u) => (
                          <ChecklistOptionButton
                            key={u.baseOriginal || u.label}
                            label={u.label}
                            selected={isSelected(group.title, u.label)}
                            saving={saving}
                            onClick={() => toggleSelection(group.title, u.label)}
                            onEdit={() =>
                              setEditingOption({
                                groupTitle: group.title,
                                optionLabel: u.baseOriginal || u.label,
                                nextLabel: u.label,
                              })
                            }
                            onDelete={() => deleteOption(group.title, u)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {options.map((option) => (
                    <ChecklistOptionButton
                      key={option.custom ? `custom-${option.overrideId}` : `base-${option.baseOriginal}`}
                      label={option.label}
                      selected={isSelected(group.title, option.label)}
                      saving={saving}
                      onClick={() => toggleSelection(group.title, option.label)}
                      onEdit={() =>
                        setEditingOption({
                          groupTitle: group.title,
                          optionLabel: option.custom
                            ? option.optionLabel || option.label
                            : option.baseOriginal || option.label,
                          nextLabel: option.label,
                        })
                      }
                      onDelete={() => deleteOption(group.title, option)}
                    />
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--fl-muted)]">+ OTHER</p>
                  <div className="flex flex-col gap-2 md:flex-row">
                    <input
                      value={otherTextByGroup[group.title] || ""}
                      onChange={(event) => setOtherTextByGroup((prev) => ({ ...prev, [group.title]: event.target.value }))}
                      placeholder="Add custom item..."
                      className="min-w-0 flex-1 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-[var(--fl-text)] outline-none focus:border-teal-400"
                    />
                    <button
                      type="button"
                      onClick={() => addOther(group.title)}
                      disabled={saving || !(otherTextByGroup[group.title] || "").trim()}
                      className="rounded-lg border border-teal-500 px-4 py-2 text-sm font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  {otherRows.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {otherRows.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => removeSelection(item.id)}
                          className="rounded-full border border-yellow-500/60 bg-yellow-500/10 px-3 py-1 text-xs font-bold text-[var(--fl-warn-text)] hover:bg-yellow-500/20"
                        >
                          {item.custom_text} ×
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingOption && (
        <Modal title="Edit Checklist Option" subtitle={editingOption.groupTitle} onClose={() => setEditingOption(null)}>
          <input
            value={editingOption.nextLabel}
            onChange={(event) => setEditingOption((prev) => prev ? { ...prev, nextLabel: event.target.value } : prev)}
            className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
          />
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setEditingOption(null)} className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]">Cancel</button>
            <button type="button" onClick={saveOptionEdit} disabled={saving} className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50">Save Option</button>
          </div>
        </Modal>
      )}

      {addingOptionGroup && (
        <Modal title="Add Checklist Option" subtitle={addingOptionGroup} onClose={() => setAddingOptionGroup("")}>
          <input
            value={newOptionLabel}
            onChange={(event) => setNewOptionLabel(event.target.value)}
            placeholder="New option label..."
            className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
          />
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setAddingOptionGroup("")} className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]">Cancel</button>
            <button type="button" onClick={() => addOption(addingOptionGroup)} disabled={saving || !newOptionLabel.trim()} className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50">Add Option</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ChecklistOptionButton({
  label,
  selected,
  saving,
  onClick,
  onEdit,
  onDelete,
}: {
  label: string;
  selected: boolean;
  saving: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`rounded-xl border transition ${selected ? "border-teal-400 bg-teal-500/15 text-[var(--fl-accent-text)]" : "border-[var(--fl-line)] bg-[var(--fl-ground)] text-[var(--fl-text)] hover:border-teal-400"}`}>
      <button type="button" onClick={onClick} disabled={saving} className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${selected ? "border-teal-300 bg-teal-400 text-slate-950" : "border-white"}`}>
          {selected ? "✓" : ""}
        </span>
        <span className="min-w-0 flex-1 font-bold">{label}</span>
      </button>
      <div className="flex border-t border-[var(--fl-line)]">
        <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(); }} className="flex-1 px-3 py-2 text-xs font-bold text-[var(--fl-muted)] hover:bg-[var(--fl-raised)] hover:text-[var(--fl-accent-text)]">Edit</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(); }} className="flex-1 border-l border-[var(--fl-line)] px-3 py-2 text-xs font-bold text-[var(--fl-muted)] hover:bg-red-500/10 hover:text-[var(--fl-crit-text)]">Delete</button>
      </div>
    </div>
  );
}

function Modal({ title, subtitle, children, onClose }: any) {
  if (typeof document === "undefined") return null;

  // Portal to <body> so `position: fixed` centers to the viewport and can't be
  // thrown off (or hidden behind content) by a transformed ancestor in the
  // report editor. This is what makes it "pop up right on the screen".
  return createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5 text-[var(--fl-text)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-2xl font-semibold text-[var(--fl-accent-text)]">{title}</h3>
        {subtitle && <p className="mt-2 text-sm text-[var(--fl-muted)]">{subtitle}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default memo(SectionInformationChecklist);
