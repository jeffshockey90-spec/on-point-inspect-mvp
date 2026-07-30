"use client";

import { memo, useEffect, useMemo, useState } from "react";
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
        "Snow",
        "Cloudy",
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
        "Batt",
        "None",
        "Foam",
        "Reflective",
        "Unknown",
        "Faced",
        "Fiberglass",
        "Loose Fill",
        "Unfaced"
      ]
    },
    {
      "title": "Insulation Type",
      "options": [
        "Batt",
        "Foam-board",
        "Fiberglass",
        "Cellulose",
        "None",
        "Vermiculite",
        "Blown",
        "Foiled-faced",
        "Loose-fill",
        "Mineral Wool",
        "Spray Foam",
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
}: {
  inspectionId: string;
  section: string;
}) {
  const [open, setOpen] = useState(false);
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

  function getGroupOptions(group: ChecklistGroup) {
    const hidden = new Set(optionOverrides.filter((item) => item.group_title === group.title && item.hidden).map((item) => item.option_label));
    const renamed = new Map(optionOverrides.filter((item) => item.group_title === group.title && item.replacement_label && !item.hidden).map((item) => [item.option_label, item.replacement_label || item.option_label]));
    const customAdded = optionOverrides
      .filter((item) => item.group_title === group.title && !item.hidden && item.option_label.startsWith("__CUSTOM__:"))
      .map((item) => item.replacement_label || item.option_label.replace("__CUSTOM__:", ""));
    const base = group.options.filter((option) => !hidden.has(option)).map((option) => renamed.get(option) || option);
    return [...base, ...customAdded];
  }

  function isSelected(groupTitle: string, value: string) {
    return selections.some((item) => item.group_title === groupTitle && item.value === value);
  }

  async function toggleSelection(groupTitle: string, value: string) {
    if (saving || !inspectionId || !section) return;
    setSaving(true);

    try {
      const existing = selections.find((item) => item.group_title === groupTitle && item.value === value);

      if (existing) {
        const { error } = await supabase.from("section_checklist_selections").delete().eq("id", existing.id);
        if (error) throw error;
        setSelections((prev) => prev.filter((item) => item.id !== existing.id));
        return;
      }

      const { data, error } = await supabase
        .from("section_checklist_selections")
        .insert({ inspection_id: inspectionId, section, group_title: groupTitle, value })
        .select("*")
        .single();

      if (error) throw error;
      if (data) setSelections((prev) => [...prev, data]);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to save checklist selection.");
    } finally {
      setSaving(false);
    }
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
      setEditingOption(null);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to edit checklist option.");
    } finally {
      setSaving(false);
    }
  }

  async function hideOption(groupTitle: string, optionLabel: string) {
    if (saving) return;
    if (!window.confirm(`Delete "${optionLabel}" from this checklist group?`)) return;
    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("section_checklist_options")
        .insert({ section, group_title: groupTitle, option_label: optionLabel, hidden: true })
        .select("*")
        .single();
      if (error) throw error;
      if (data) setOptionOverrides((prev) => [...prev, data]);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to delete checklist option.");
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = selections.filter((item) => item.value !== "__TEXT_VALUE__").length;

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#071224]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-800/50"
      >
        <div>
          <h3 className="text-xl font-black text-teal-300">Information</h3>
          <p className="mt-1 text-sm text-slate-400">
            {selectedCount > 0 ? `${selectedCount} item${selectedCount === 1 ? "" : "s"} selected` : "No information selected"}
          </p>
        </div>
        <span className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-200">
          {open ? "Hide" : "Show"}
        </span>
      </button>



      {message && (
        <div
          className={`border-t border-slate-700 px-5 py-3 text-sm font-bold ${
            messageType === "success"
              ? "bg-emerald-950/30 text-emerald-300"
              : "bg-red-950/30 text-red-300"
          }`}
        >
          {message}
        </div>
      )}

      {selectedCount > 0 && (
        <div className="border-t border-slate-700 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {selections.filter((item) => item.value !== "__TEXT_VALUE__").map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => removeSelection(item.id)}
                className="rounded-full border border-teal-500/60 bg-teal-500/10 px-3 py-1 text-sm font-bold text-teal-200 hover:bg-teal-500/20"
              >
                {item.group_title}: {item.custom_text || item.value} ×
              </button>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-5 border-t border-slate-700 p-5">
          {baseGroups.map((group) => {
            const options = getGroupOptions(group);
            const textValue = textValueByGroup[group.title] || "";
            const otherRows = selections.filter((item) => item.group_title === group.title && item.value === "OTHER");

            return (
              <div key={group.title} className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-lg font-black text-white">{group.title}</h4>
                  <button
                    type="button"
                    onClick={() => { setAddingOptionGroup(group.title); setNewOptionLabel(""); }}
                    className="rounded-lg border border-teal-500 px-3 py-1 text-xs font-black text-teal-300 hover:bg-teal-500/10"
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
                      className="w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-teal-400"
                    />
                    {group.unitOptions && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.unitOptions.map((unit) => (
                          <ChecklistOptionButton
                            key={unit}
                            label={unit}
                            selected={isSelected(group.title, unit)}
                            saving={saving}
                            onClick={() => toggleSelection(group.title, unit)}
                            onEdit={() => setEditingOption({ groupTitle: group.title, optionLabel: unit, nextLabel: unit })}
                            onDelete={() => hideOption(group.title, unit)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {options.map((option) => (
                    <ChecklistOptionButton
                      key={option}
                      label={option}
                      selected={isSelected(group.title, option)}
                      saving={saving}
                      onClick={() => toggleSelection(group.title, option)}
                      onEdit={() => setEditingOption({ groupTitle: group.title, optionLabel: option, nextLabel: option })}
                      onDelete={() => hideOption(group.title, option)}
                    />
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-slate-700 bg-[#020617] p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">+ OTHER</p>
                  <div className="flex flex-col gap-2 md:flex-row">
                    <input
                      value={otherTextByGroup[group.title] || ""}
                      onChange={(event) => setOtherTextByGroup((prev) => ({ ...prev, [group.title]: event.target.value }))}
                      placeholder="Add custom item..."
                      className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#020617] px-3 py-2 text-white outline-none focus:border-teal-400"
                    />
                    <button
                      type="button"
                      onClick={() => addOther(group.title)}
                      disabled={saving || !(otherTextByGroup[group.title] || "").trim()}
                      className="rounded-lg border border-teal-500 px-4 py-2 text-sm font-black text-teal-300 hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50"
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
                          className="rounded-full border border-yellow-500/60 bg-yellow-500/10 px-3 py-1 text-xs font-bold text-yellow-200 hover:bg-yellow-500/20"
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
            className="mt-4 w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-teal-400"
          />
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setEditingOption(null)} className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-slate-200 hover:bg-slate-800">Cancel</button>
            <button type="button" onClick={saveOptionEdit} disabled={saving} className="rounded-xl bg-teal-500 px-5 py-3 font-black text-slate-950 hover:bg-teal-400 disabled:opacity-50">Save Option</button>
          </div>
        </Modal>
      )}

      {addingOptionGroup && (
        <Modal title="Add Checklist Option" subtitle={addingOptionGroup} onClose={() => setAddingOptionGroup("")}>
          <input
            value={newOptionLabel}
            onChange={(event) => setNewOptionLabel(event.target.value)}
            placeholder="New option label..."
            className="mt-4 w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-white outline-none focus:border-teal-400"
          />
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setAddingOptionGroup("")} className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-slate-200 hover:bg-slate-800">Cancel</button>
            <button type="button" onClick={() => addOption(addingOptionGroup)} disabled={saving || !newOptionLabel.trim()} className="rounded-xl bg-teal-500 px-5 py-3 font-black text-slate-950 hover:bg-teal-400 disabled:opacity-50">Add Option</button>
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
    <div className={`rounded-xl border transition ${selected ? "border-teal-400 bg-teal-500/15 text-teal-100" : "border-slate-600 bg-[#020617] text-white hover:border-teal-400"}`}>
      <button type="button" onClick={onClick} disabled={saving} className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${selected ? "border-teal-300 bg-teal-400 text-slate-950" : "border-white"}`}>
          {selected ? "✓" : ""}
        </span>
        <span className="min-w-0 flex-1 font-bold">{label}</span>
      </button>
      <div className="flex border-t border-slate-700">
        <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(); }} className="flex-1 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-teal-300">Edit</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(); }} className="flex-1 border-l border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-red-500/10 hover:text-red-300">Delete</button>
      </div>
    </div>
  );
}

function Modal({ title, subtitle, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#0f172a] p-5 text-white shadow-2xl">
        <h3 className="text-2xl font-black text-teal-300">{title}</h3>
        {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export default memo(SectionInformationChecklist);
