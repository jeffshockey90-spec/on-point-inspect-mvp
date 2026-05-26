"use client";

import { useEffect, useMemo, useState } from "react";
import EditableFinding from "../../../components/EditableFinding";

const SECTION_CHECKLISTS: Record<string, any[]> = {
  "Inspection Details": [
    {
      title: "In Attendance",
      type: "checkbox",
      options: ["Client", "Listing Agent", "Home Owner", "Client's Agent", "Inspector"],
      defaults: [],
    },
    {
      title: "Occupancy",
      type: "checkbox",
      options: ["Furnished", "Occupied", "Vacant", "Utilities Off"],
      defaults: [],
    },
    {
      title: "Style",
      type: "checkbox",
      options: [
        "Manufactured",
        "Rambler",
        "Modular",
        "Ranch",
        "Modern",
        "Multi-level",
        "Bungalow",
        "Contemporary",
        "Victorian",
        "Colonial",
        "Row House",
        "Townhouse",
      ],
      defaults: [],
    },
    {
      title: "Temperature",
      type: "temperature",
      options: ["Fahrenheit (F)"],
      defaults: [],
    },
    {
      title: "Type of Building",
      type: "checkbox",
      options: ["Multi-Family", "Attached", "Single Family", "Condominium / Townhouse", "Detached"],
      defaults: [],
    },
    {
      title: "Weather Conditions",
      type: "checkbox",
      options: ["Snow", "Dry", "Cloudy", "Hot", "Heavy Rain", "Clear", "Light Rain", "Humid", "Recent Rain"],
      defaults: [],
    },
  ],

  Exterior: [
    {
      title: "Inspection Method",
      type: "checkbox",
      options: ["Visual", "Infrared", "Attic Access", "Crawlspace Access"],
      defaults: [],
    },
    {
      title: "Exterior Wall Covering",
      type: "checkbox",
      options: ["Brick Veneer", "Stone Veneer", "Stucco", "Vinyl Siding", "Wood Siding", "Fiber Cement Siding", "Aluminum Siding"],
      defaults: [],
    },
    {
      title: "Driveway",
      type: "checkbox",
      options: ["Concrete", "Asphalt", "Gravel", "Pavers"],
      defaults: [],
    },
    {
      title: "Walkways",
      type: "checkbox",
      options: ["Concrete", "Pavers", "Brick", "Flagstone", "Gravel"],
      defaults: [],
    },
    {
      title: "Patio / Deck",
      type: "checkbox",
      options: ["Wood", "Composite", "Concrete", "Pavers", "Brick"],
      defaults: [],
    },
    {
      title: "Fencing",
      type: "checkbox",
      options: ["Wood", "Vinyl", "Chain Link", "Wrought Iron", "None"],
      defaults: [],
    },
  ],

  Roof: [
    {
      title: "Inspection Method",
      type: "checkbox",
      options: ["Walked Roof", "From Ground", "From Ladder", "Drone", "Binoculars", "Limited Visibility"],
      defaults: [],
    },
    {
      title: "Roof Covering",
      type: "checkbox",
      options: ["Asphalt Shingles", "Architectural Shingles", "3-Tab Shingles", "Metal", "Standing Seam Metal", "Rubber / EPDM", "Rolled Roofing", "Slate", "Tile", "Wood Shakes"],
      defaults: [],
    },
    {
      title: "Roof Style",
      type: "checkbox",
      options: ["Gable", "Hip", "Flat / Low Slope", "Mansard", "Gambrel", "Shed", "Combination"],
      defaults: [],
    },
    {
      title: "Roof Drainage",
      type: "checkbox",
      options: ["Gutters Present", "Downspouts Present", "No Gutters", "Underground Drains", "Splash Blocks", "Extensions Present"],
      defaults: [],
    },
    {
      title: "Flashing / Penetrations",
      type: "checkbox",
      options: ["Plumbing Vent Boots", "Chimney Flashing", "Wall Flashing", "Skylight Flashing", "Roof Vents", "Satellite / Antenna Mounts"],
      defaults: [],
    },
    {
      title: "Roof Limitations",
      type: "checkbox",
      options: ["Steep Roof", "Wet Roof", "Snow Covered", "Height Limitation", "Unsafe Access", "Viewed From Ground Only", "Drone Only"],
      defaults: [],
    },
  ],

  "Basement, Foundation, Crawlspace & Structure": [
    {
      title: "Foundation Type",
      type: "checkbox",
      options: ["Basement", "Crawlspace", "Slab on Grade", "Pier and Beam", "Combination", "Not Visible"],
      defaults: [],
    },
    {
      title: "Foundation Material",
      type: "checkbox",
      options: ["Poured Concrete", "Concrete Block", "Stone", "Brick", "Wood", "Not Visible"],
      defaults: [],
    },
    {
      title: "Floor Structure",
      type: "checkbox",
      options: ["Wood Joists", "Engineered Joists", "Trusses", "Steel Framing", "Concrete", "Not Visible"],
      defaults: [],
    },
    {
      title: "Wall Structure",
      type: "checkbox",
      options: ["Wood Framing", "Masonry", "Steel Framing", "Concrete", "Not Visible"],
      defaults: [],
    },
    {
      title: "Crawlspace Conditions",
      type: "checkbox",
      options: ["Accessible", "Limited Access", "Vapor Barrier Present", "No Vapor Barrier", "Insulated", "Ventilated", "Conditioned Crawlspace"],
      defaults: [],
    },
    {
      title: "Limitations",
      type: "checkbox",
      options: ["Finished Areas", "Stored Belongings", "Limited Access", "Low Clearance", "Unsafe Access", "Not Accessible"],
      defaults: [],
    },
  ],

  Heating: [
    {
      title: "Heating System Type",
      type: "checkbox",
      options: ["Forced Air Furnace", "Heat Pump", "Boiler", "Electric Baseboard", "Radiant Heat", "Mini Split", "None Observed"],
      defaults: [],
    },
    {
      title: "Energy Source",
      type: "checkbox",
      options: ["Natural Gas", "Propane", "Oil", "Electric", "Wood", "Solar", "Unknown"],
      defaults: [],
    },
    {
      title: "Distribution",
      type: "checkbox",
      options: ["Ductwork", "Radiators", "Baseboards", "Radiant Floor", "Wall Units", "Not Visible"],
      defaults: [],
    },
    {
      title: "Thermostat",
      type: "checkbox",
      options: ["Present", "Digital", "Programmable", "Smart Thermostat", "Not Operated", "Not Located"],
      defaults: [],
    },
    {
      title: "Filter",
      type: "checkbox",
      options: ["Disposable", "Reusable", "Electronic Air Cleaner", "Not Located", "Dirty", "Clean"],
      defaults: [],
    },
    {
      title: "Limitations",
      type: "checkbox",
      options: ["System Not Operated", "Temperature Restrictions", "Access Limited", "Panel Restricted", "Stored Belongings"],
      defaults: [],
    },
  ],

  Cooling: [
    {
      title: "Cooling System Type",
      type: "checkbox",
      options: ["Central AC", "Heat Pump", "Mini Split", "Window Unit", "Evaporative Cooler", "None Observed"],
      defaults: [],
    },
    {
      title: "Condenser Location",
      type: "checkbox",
      options: ["Exterior Ground", "Roof Mounted", "Wall Mounted", "Not Located", "Multiple Units"],
      defaults: [],
    },
    {
      title: "Distribution",
      type: "checkbox",
      options: ["Ductwork", "Ductless Heads", "Window Unit", "Not Visible"],
      defaults: [],
    },
    {
      title: "Thermostat",
      type: "checkbox",
      options: ["Present", "Digital", "Programmable", "Smart Thermostat", "Not Operated", "Not Located"],
      defaults: [],
    },
    {
      title: "Condensate",
      type: "checkbox",
      options: ["Gravity Drain", "Condensate Pump", "Secondary Drain Pan", "Not Visible", "Not Applicable"],
      defaults: [],
    },
    {
      title: "Limitations",
      type: "checkbox",
      options: ["Low Outdoor Temperature", "System Not Operated", "Access Limited", "Panel Restricted", "Stored Belongings"],
      defaults: [],
    },
  ],

  Plumbing: [
    {
      title: "Water Supply",
      type: "checkbox",
      options: ["Public", "Private Well", "Shared Well", "Unknown", "Water Off"],
      defaults: [],
    },
    {
      title: "Supply Piping",
      type: "checkbox",
      options: ["Copper", "PEX", "CPVC", "Galvanized", "Polybutylene", "Not Visible", "Mixed Materials"],
      defaults: [],
    },
    {
      title: "Drain / Waste / Vent",
      type: "checkbox",
      options: ["PVC", "ABS", "Cast Iron", "Galvanized", "Copper", "Not Visible", "Mixed Materials"],
      defaults: [],
    },
    {
      title: "Water Heater Type",
      type: "checkbox",
      options: ["Tank", "Tankless", "Electric", "Gas", "Oil", "Heat Pump Water Heater", "Not Located"],
      defaults: [],
    },
    {
      title: "Fuel Shutoffs / Main Shutoff",
      type: "checkbox",
      options: ["Main Water Shutoff Located", "Gas Shutoff Located", "Not Located", "Limited Access"],
      defaults: [],
    },
    {
      title: "Limitations",
      type: "checkbox",
      options: ["Water Off", "Fixtures Not Operated", "Access Limited", "Stored Belongings", "Finished Areas"],
      defaults: [],
    },
  ],

  Electrical: [
    {
      title: "Service Type",
      type: "checkbox",
      options: ["Overhead Service", "Underground Service", "Not Visible", "Unknown"],
      defaults: [],
    },
    {
      title: "Main Panel",
      type: "checkbox",
      options: ["Breaker Panel", "Fuse Panel", "Subpanel", "Main Disconnect Present", "Panel Not Accessible"],
      defaults: [],
    },
    {
      title: "Service Amperage",
      type: "checkbox",
      options: ["60 Amp", "100 Amp", "150 Amp", "200 Amp", "400 Amp", "Unable to Determine"],
      defaults: [],
    },
    {
      title: "Branch Wiring",
      type: "checkbox",
      options: ["Copper", "Aluminum", "Knob and Tube", "Cloth Wiring", "NM Cable", "Conduit", "Not Visible"],
      defaults: [],
    },
    {
      title: "Safety Devices",
      type: "checkbox",
      options: ["GFCI Present", "AFCI Present", "Smoke Alarms Present", "CO Alarms Present", "Surge Protection Present"],
      defaults: [],
    },
    {
      title: "Limitations",
      type: "checkbox",
      options: ["Panel Blocked", "Panel Cover Not Removed", "Limited Access", "Power Off", "Stored Belongings"],
      defaults: [],
    },
  ],

  "Attic, Insulation & Ventilation": [
    {
      title: "Attic Access",
      type: "checkbox",
      options: ["Scuttle Access", "Pull Down Stairs", "Walk-Up", "No Access", "Limited Access"],
      defaults: [],
    },
    {
      title: "Inspection Method",
      type: "checkbox",
      options: ["Entered Attic", "Viewed From Access", "Drone / Camera Pole", "Not Accessible", "Limited Visibility"],
      defaults: [],
    },
    {
      title: "Insulation Type",
      type: "checkbox",
      options: ["Fiberglass Batt", "Blown Fiberglass", "Cellulose", "Spray Foam", "Mineral Wool", "None Observed", "Not Visible"],
      defaults: [],
    },
    {
      title: "Ventilation",
      type: "checkbox",
      options: ["Soffit Vents", "Ridge Vent", "Gable Vents", "Box Vents", "Powered Fan", "No Visible Ventilation"],
      defaults: [],
    },
    {
      title: "Exhaust Venting",
      type: "checkbox",
      options: ["Bathroom Fan Vented Exterior", "Kitchen Exhaust Vented Exterior", "Dryer Vent Visible", "Not Visible"],
      defaults: [],
    },
    {
      title: "Limitations",
      type: "checkbox",
      options: ["No Flooring", "Limited Access", "Stored Belongings", "Low Clearance", "Unsafe Access", "Insulation Covered Components"],
      defaults: [],
    },
  ],

  "Doors, Windows & Interior": [
    {
      title: "Interior Rooms",
      type: "checkbox",
      options: ["Bedrooms", "Bathrooms", "Kitchen", "Living Areas", "Laundry", "Basement", "Finished Areas"],
      defaults: [],
    },
    {
      title: "Wall / Ceiling Finishes",
      type: "checkbox",
      options: ["Drywall", "Plaster", "Paneling", "Tile", "Wood", "Not Visible"],
      defaults: [],
    },
    {
      title: "Floor Coverings",
      type: "checkbox",
      options: ["Carpet", "Hardwood", "Laminate", "Vinyl", "Tile", "Concrete", "Mixed"],
      defaults: [],
    },
    {
      title: "Windows",
      type: "checkbox",
      options: ["Single Hung", "Double Hung", "Casement", "Sliding", "Fixed", "Vinyl", "Wood", "Aluminum"],
      defaults: [],
    },
    {
      title: "Doors",
      type: "checkbox",
      options: ["Hinged Doors", "Sliding Doors", "French Doors", "Pocket Doors", "Storm Doors", "Exterior Doors"],
      defaults: [],
    },
    {
      title: "Limitations",
      type: "checkbox",
      options: ["Occupied Home", "Furnished Areas", "Stored Belongings", "Window Treatments", "Limited Access", "Personal Items"],
      defaults: [],
    },
  ],

  "Built-in Appliances": [
    {
      title: "Appliances Present",
      type: "checkbox",
      options: ["Range / Oven", "Cooktop", "Dishwasher", "Microwave", "Garbage Disposal", "Refrigerator", "Washer", "Dryer"],
      defaults: [],
    },
    {
      title: "Range / Oven Energy",
      type: "checkbox",
      options: ["Electric", "Gas", "Propane", "Not Determined", "Not Present"],
      defaults: [],
    },
    {
      title: "Dishwasher",
      type: "checkbox",
      options: ["Present", "Operated", "Not Operated", "Not Present", "Limited Access"],
      defaults: [],
    },
    {
      title: "Microwave",
      type: "checkbox",
      options: ["Built-in", "Over-the-Range", "Countertop", "Not Present", "Operated"],
      defaults: [],
    },
    {
      title: "Laundry Appliances",
      type: "checkbox",
      options: ["Washer Present", "Dryer Present", "Gas Dryer", "Electric Dryer", "Not Operated", "Not Present"],
      defaults: [],
    },
    {
      title: "Limitations",
      type: "checkbox",
      options: ["Appliances Not Moved", "Personal Property Present", "Not Operated", "Utilities Off", "Limited Access"],
      defaults: [],
    },
  ],

  Disclaimers: [
    {
      title: "General Disclaimers",
      type: "disclaimer",
      options: [],
      defaults: [],
    },
    {
      title: "AI Notes",
      type: "ai-notes",
      options: [],
      defaults: [],
    },
  ],

  Garage: [
    {
      title: "Material",
      type: "checkbox",
      options: [
        "Metal",
        "Insulated",
        "Non-insulated",
        "Steel",
        "Aluminum",
        "Wood",
        "Wood Composite",
        "Fiberglass",
        "Vinyl",
        "Glass",
      ],
      defaults: [],
    },
    {
      title: "Type",
      type: "checkbox",
      options: [
        "Sliding",
        "Folding",
        "Up-and-Over",
        "Roll-Up",
        "Automatic",
        "Sectional",
      ],
      defaults: [],
    },
  ],
};

const SECTION_ORDER = [
  "Inspection Details",
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
  "Disclaimers",
  "Garage",
];

export default function ReportFindingsSortable({
  groupedFindings,
  inspectionId,
}: any) {
  const hiddenSectionsKey = `hidden-sections-${inspectionId}`;
  const renamedSectionsKey = `renamed-sections-${inspectionId}`;
  const sectionOrderKey = "saved-report-section-order-v1";

  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [renamedSections, setRenamedSections] = useState<Record<string, string>>(
    {}
  );
  const [sectionOrder, setSectionOrder] = useState<string[]>(SECTION_ORDER);
  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const [customSections, setCustomSections] = useState<any[]>([]);

  useEffect(() => {
    const savedHidden = localStorage.getItem(hiddenSectionsKey);
    const savedRenamed = localStorage.getItem(renamedSectionsKey);
    const savedSectionOrder = localStorage.getItem(sectionOrderKey);

    if (savedHidden) setHiddenSections(JSON.parse(savedHidden));
    if (savedRenamed) setRenamedSections(JSON.parse(savedRenamed));

    if (savedSectionOrder) {
      const parsed = JSON.parse(savedSectionOrder);
      const merged = [
        ...parsed.filter((section: string) => SECTION_ORDER.includes(section)),
        ...SECTION_ORDER.filter((section) => !parsed.includes(section)),
      ];

      setSectionOrder(merged);
    }
  }, [hiddenSectionsKey, renamedSectionsKey, sectionOrderKey]);

  function hideSection(section: string) {
    const confirmed = confirm(
      `Hide "${renamedSections[section] || section}" from this report view? This will not delete your findings.`
    );

    if (!confirmed) return;

    const updated = [...hiddenSections, section].filter(
      (item, index, array) => array.indexOf(item) === index
    );

    setHiddenSections(updated);
    localStorage.setItem(hiddenSectionsKey, JSON.stringify(updated));
  }

  function renameSection(section: string, newName: string) {
    const updated = {
      ...renamedSections,
      [section]: newName,
    };

    setRenamedSections(updated);
    localStorage.setItem(renamedSectionsKey, JSON.stringify(updated));
  }

  function moveSection(fromSection: string, toSection: string) {
    if (!fromSection || fromSection === toSection) return;

    const updated = [...sectionOrder];

    const fromIndex = updated.indexOf(fromSection);
    const toIndex = updated.indexOf(toSection);

    if (fromIndex === -1 || toIndex === -1) return;

    // remove dragged section
    const [movedSection] = updated.splice(fromIndex, 1);

    // insert into new location
    updated.splice(toIndex, 0, movedSection);

    setSectionOrder(updated);
    localStorage.setItem(sectionOrderKey, JSON.stringify(updated));
  }

  function duplicateSection(sectionName: string) {
    const newSection = {
      section: `${sectionName} Copy ${Date.now()}`,
      findings: [],
    };

    setCustomSections((prev: any) => [...prev, newSection]);
  }

  function restoreAllSections() {
    setHiddenSections([]);
    localStorage.setItem(hiddenSectionsKey, JSON.stringify([]));
  }

  const orderedGroups = useMemo(() => {
    const groups = groupedFindings || [];

    const baseSections = sectionOrder.map((section) => {
      const existing = groups.find((group: any) => group.section === section);

      return {
        section,
        findings: existing?.findings || [],
      };
    }).filter((group) => !hiddenSections.includes(group.section));

    return [...baseSections, ...customSections];
  }, [groupedFindings, hiddenSections, customSections, sectionOrder]);

  return (
    <div className="space-y-6">
      {hiddenSections.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-[#071224] p-4">
          <button
            type="button"
            onClick={restoreAllSections}
            className="rounded-xl border border-teal-500 px-4 py-2 text-sm font-bold text-teal-300 hover:bg-teal-500/10"
          >
            Restore Hidden Sections
          </button>
        </div>
      )}

      {orderedGroups.map((group: any) => (
        <SectionBlock
          key={group.section}
          group={group}
          inspectionId={inspectionId}
          displayName={renamedSections[group.section] || group.section}
          onRename={renameSection}
          onHide={hideSection}
          draggedSection={draggedSection}
          setDraggedSection={setDraggedSection}
          moveSection={moveSection}
          onDuplicate={duplicateSection}
        />
      ))}
    </div>
  );
}

function SectionBlock({
  group,
  inspectionId,
  displayName,
  onRename,
  onHide,
  onDuplicate,
  draggedSection,
  setDraggedSection,
  moveSection,
}: any) {
  const checklist = SECTION_CHECKLISTS[group.section] || [];

  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    setDraftName(displayName);
  }, [displayName]);

  const normalFindings =
    group.findings?.filter(
      (finding: any) =>
        !checklist.some((item: any) => item.title === finding.title)
    ) || [];

  function saveName() {
    const cleaned = draftName.trim();

    if (!cleaned) {
      setDraftName(displayName);
      setIsEditingName(false);
      return;
    }

    onRename(group.section, cleaned);
    setIsEditingName(false);
  }

  return (
    <section
      draggable
      onDragStart={() => setDraggedSection(group.section)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => {
        if (draggedSection) {
          moveSection(draggedSection, group.section);
          setDraggedSection(null);
        }
      }}
      onDragEnd={() => setDraggedSection(null)}
      className={`overflow-hidden rounded-2xl border bg-[#071224] shadow-xl transition-all duration-200 ${
        draggedSection === group.section
          ? "border-teal-400 opacity-60"
          : "border-slate-700"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!isEditingName) setCollapsed(!collapsed);
        }}
        onKeyDown={(e) => {
          if (!isEditingName && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setCollapsed(!collapsed);
          }
        }}
        className="cursor-pointer border-b border-slate-700 bg-slate-800/80 px-6 py-4 hover:bg-slate-800"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {isEditingName ? (
            <div className="flex flex-1 flex-wrap gap-2">
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();

                  if (e.key === "Escape") {
                    setDraftName(displayName);
                    setIsEditingName(false);
                  }
                }}
                autoFocus
                className="min-w-[260px] flex-1 rounded-xl border border-slate-700 bg-[#020817] px-4 py-2 text-white outline-none focus:border-teal-400"
              />

              <button
                type="button"
                onClick={saveName}
                className="rounded-xl bg-teal-400 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-teal-300"
              >
                Save
              </button>

              <button
                type="button"
                onClick={() => {
                  setDraftName(displayName);
                  setIsEditingName(false);
                }}
                className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed(!collapsed);
              }}
              className="flex flex-1 items-center justify-between text-left"
            >
              <span className="cursor-grab select-none text-xl font-black text-slate-400">
                ⋮⋮
              </span>

              <h2 className="text-2xl font-bold text-teal-400">
                {displayName}
              </h2>

              <span className="text-xl font-bold text-slate-300">
                {collapsed ? "+" : "−"}
              </span>
            </button>
          )}

          {!isEditingName && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingName(true);
                }}
                className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                Edit Name
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(group.section);
                }}
                className="rounded-xl border border-teal-500/50 px-3 py-2 text-xs font-bold text-teal-300 hover:bg-teal-500/10"
              >
                Duplicate Section
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onHide(group.section);
                }}
                className="rounded-xl border border-red-500/50 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10"
              >
                Hide Section
              </button>
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
      <div className="space-y-5 p-5">
        {checklist.map((item: any) => (
          <ChecklistCard
            key={item.title}
            item={item}
            section={group.section}
            inspectionId={inspectionId}
          />
        ))}

        {normalFindings.map((finding: any) => (
          <NormalFindingCard key={finding.id} finding={finding} />
        ))}
      </div>
      )}
    </section>
  );
}

function ChecklistCard({ item, section, inspectionId }: any) {
  const storageKey = `inspection-clean-v7-${inspectionId}-${section}-${item.title}`;
  const customKey = `custom-options-${section}-${item.title}`;
  const temperatureKey = `temperature-${inspectionId}-${section}-${item.title}`;
  const aiNotesKey = `ai-notes-${inspectionId}-${section}-${item.title}`;
  const disclaimerTitleKey =
    section === "Disclaimers"
      ? "saved-disclaimer-title-Disclaimers-General Disclaimers"
      : `saved-disclaimer-title-${section}-${item.title}`;
  const disclaimerTextKey =
    section === "Disclaimers"
      ? "saved-disclaimer-text-Disclaimers-General Disclaimers"
      : `saved-disclaimer-text-${section}-${item.title}`;
  const disclaimerCustomKey =
    section === "Disclaimers"
      ? "saved-disclaimer-options-Disclaimers-General Disclaimers"
      : `saved-disclaimer-options-${section}-${item.title}`;

  const [selected, setSelected] = useState<string[]>([]);
  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [showInput, setShowInput] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [temperature, setTemperature] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [generatingAi, setGeneratingAi] = useState(false);
  const [disclaimerTitle, setDisclaimerTitle] = useState("");
  const [disclaimerText, setDisclaimerText] = useState("");
  const [savedDisclaimers, setSavedDisclaimers] = useState<any[]>([]);
  const [editingDisclaimerId, setEditingDisclaimerId] = useState<string | null>(
    null
  );
  const [editingDisclaimerTitle, setEditingDisclaimerTitle] = useState("");
  const [editingDisclaimerText, setEditingDisclaimerText] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    const savedCustom = localStorage.getItem(customKey);
    const savedTemp = localStorage.getItem(temperatureKey);
    const savedAiNotes = localStorage.getItem(aiNotesKey);
    const savedDisclaimerTitle = localStorage.getItem(disclaimerTitleKey);
    const savedDisclaimerText = localStorage.getItem(disclaimerTextKey);
    const savedDisclaimerOptions = localStorage.getItem(disclaimerCustomKey);

    if (saved) {
      setSelected(JSON.parse(saved));
    } else {
      setSelected([]);
    }

    if (savedCustom) setCustomOptions(JSON.parse(savedCustom));
    if (savedTemp) setTemperature(savedTemp);
    if (savedAiNotes) setAiNotes(savedAiNotes);
    if (savedDisclaimerTitle) setDisclaimerTitle(savedDisclaimerTitle);
    if (savedDisclaimerText) setDisclaimerText(savedDisclaimerText);

    if (savedDisclaimerOptions) {
      const parsed = JSON.parse(savedDisclaimerOptions);

      const normalized = parsed.map((item: any, index: number) => {
        if (typeof item === "string") {
          return {
            id: `old-${index}-${item.slice(0, 20)}`,
            title: item.length > 65 ? `${item.slice(0, 65)}...` : item,
            text: item,
          };
        }

        return item;
      });

      setSavedDisclaimers(normalized);
    }
  }, [
    storageKey,
    customKey,
    temperatureKey,
    aiNotesKey,
    disclaimerTitleKey,
    disclaimerTextKey,
    disclaimerCustomKey,
  ]);

  const allOptions = [...item.options, ...customOptions].filter(
    (option, index, array) => array.indexOf(option) === index
  );

  function toggleOption(option: string) {
    let updated: string[];

    if (item.type === "temperature") {
      updated = [option];
    } else {
      updated = selected.includes(option)
        ? selected.filter((o) => o !== option)
        : [...selected, option];
    }

    setSelected(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  }

  function saveOther() {
    const cleaned = otherText.trim();

    if (!cleaned) {
      setShowInput(false);
      setOtherText("");
      return;
    }

    const updatedCustom = [...customOptions, cleaned].filter(
      (option, index, array) => array.indexOf(option) === index
    );

    setCustomOptions(updatedCustom);
    localStorage.setItem(customKey, JSON.stringify(updatedCustom));

    const selectedUpdated = selected.includes(cleaned)
      ? selected
      : [...selected, cleaned];

    setSelected(selectedUpdated);
    localStorage.setItem(storageKey, JSON.stringify(selectedUpdated));

    setOtherText("");
    setShowInput(false);
  }

  function saveDisclaimerForFutureReports() {
    const cleanedTitle = disclaimerTitle.trim();
    const cleanedText = disclaimerText.trim();

    if (!cleanedTitle || !cleanedText) {
      alert("Add both a disclaimer title and disclaimer text.");
      return;
    }

    const newDisclaimer = {
      id: `${Date.now()}-${cleanedTitle}`,
      title: cleanedTitle,
      text: cleanedText,
    };

    const updated = [...savedDisclaimers, newDisclaimer].filter(
      (item, index, array) =>
        array.findIndex((existing) => existing.title === item.title) === index
    );

    setSavedDisclaimers(updated);
    localStorage.setItem(disclaimerCustomKey, JSON.stringify(updated));

    setSelected((prev) => {
      const selectedUpdated = prev.includes(newDisclaimer.id)
        ? prev
        : [...prev, newDisclaimer.id];

      localStorage.setItem(storageKey, JSON.stringify(selectedUpdated));
      return selectedUpdated;
    });

    setDisclaimerTitle("");
    setDisclaimerText("");

    localStorage.setItem(disclaimerTitleKey, "");
    localStorage.setItem(disclaimerTextKey, "");
  }

  function deleteSavedDisclaimer(id: string) {
    const confirmed = confirm("Delete this saved disclaimer?");
    if (!confirmed) return;

    const updated = savedDisclaimers.filter((item: any) => item.id !== id);

    setSavedDisclaimers(updated);
    localStorage.setItem(disclaimerCustomKey, JSON.stringify(updated));

    const selectedUpdated = selected.filter((item) => item !== id);

    setSelected(selectedUpdated);
    localStorage.setItem(storageKey, JSON.stringify(selectedUpdated));
  }

  function startEditingDisclaimer(disclaimer: any) {
    setEditingDisclaimerId(disclaimer.id);
    setEditingDisclaimerTitle(disclaimer.title || "");
    setEditingDisclaimerText(disclaimer.text || "");
  }

  function cancelEditingDisclaimer() {
    setEditingDisclaimerId(null);
    setEditingDisclaimerTitle("");
    setEditingDisclaimerText("");
  }

  function saveEditedDisclaimer() {
    if (!editingDisclaimerId) return;

    const cleanedTitle = editingDisclaimerTitle.trim();
    const cleanedText = editingDisclaimerText.trim();

    if (!cleanedTitle || !cleanedText) {
      alert("Add both a disclaimer title and disclaimer text.");
      return;
    }

    const updated = savedDisclaimers.map((item: any) =>
      item.id === editingDisclaimerId
        ? {
            ...item,
            title: cleanedTitle,
            text: cleanedText,
          }
        : item
    );

    setSavedDisclaimers(updated);
    localStorage.setItem(disclaimerCustomKey, JSON.stringify(updated));

    cancelEditingDisclaimer();
  }

  function toggleSavedDisclaimer(id: string) {
    const selectedUpdated = selected.includes(id)
      ? selected.filter((item) => item !== id)
      : [...selected, id];

    setSelected(selectedUpdated);
    localStorage.setItem(storageKey, JSON.stringify(selectedUpdated));
  }

  function saveAiNotes() {
    localStorage.setItem(aiNotesKey, aiNotes);
    alert("AI notes saved.");
  }

  function clearAiNotes() {
    setAiNotes("");
    localStorage.setItem(aiNotesKey, "");
  }

  async function generateAiText() {
    const notes = aiNotes.trim();

    if (!notes) {
      alert("Add AI notes first.");
      return;
    }

    setGeneratingAi(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch("/api/generate-report-note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          section,
          title: item.title,
          type: item.type,
          notes,
          selectedOptions: selected,
        }),
      });

      let data: any = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok || !data.text) {
        alert(data.error || "AI failed to generate text. Check the terminal for the API error.");
        return;
      }

      const generatedText = String(data.text).trim();

      if (section === "Disclaimers" || item.type === "ai-notes") {
        const suggestedTitle =
          notes.length > 70 ? `${notes.slice(0, 70)}...` : notes;

        setDisclaimerTitle(suggestedTitle);
        setDisclaimerText(generatedText);

        localStorage.setItem(disclaimerTitleKey, suggestedTitle);
        localStorage.setItem(disclaimerTextKey, generatedText);

        alert(
          "AI disclaimer generated. Review or edit the title and text, then click Save Disclaimer for Future Reports."
        );

        return;
      }

      const updatedCustom = [...customOptions, generatedText].filter(
        (option, index, array) => array.indexOf(option) === index
      );

      setCustomOptions(updatedCustom);
      localStorage.setItem(customKey, JSON.stringify(updatedCustom));

      const selectedUpdated = selected.includes(generatedText)
        ? selected
        : [...selected, generatedText];

      setSelected(selectedUpdated);
      localStorage.setItem(storageKey, JSON.stringify(selectedUpdated));

      alert("AI text generated and added as a saved option.");
    } catch (error: any) {
      if (error?.name === "AbortError") {
        alert("AI request timed out. Check the API route and OPENAI_API_KEY.");
      } else {
        alert(error?.message || "AI failed to generate text.");
      }
    } finally {
      clearTimeout(timeout);
      setGeneratingAi(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700/90 bg-gradient-to-br from-[#081426] via-[#0b1b33] to-[#071224] p-6 shadow-xl">
      <div className="mb-6">
        <h3 className="text-2xl font-extrabold tracking-tight text-teal-300">
          {item.title}
        </h3>

        <p className="mt-2 text-base font-medium text-slate-300">
          {item.type === "temperature"
            ? "Enter temperature"
            : item.type === "ai-notes"
            ? "Add notes for AI"
            : "Select all that apply"}
        </p>
      </div>

      {item.type === "temperature" && (
        <input
          value={temperature}
          onChange={(e) => {
            setTemperature(e.target.value);
            localStorage.setItem(temperatureKey, e.target.value);
          }}
          placeholder="Enter temperature"
          className="mb-5 w-full rounded-xl border border-slate-600 bg-[#020817]/80 px-5 py-4 text-lg font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400"
        />
      )}

      {item.type === "disclaimer" && (
        <div className="mb-6 rounded-2xl border border-teal-500/30 bg-[#020817]/70 p-4">
          <label className="mb-2 block text-sm font-extrabold uppercase tracking-wide text-teal-300">
            Disclaimer Title
          </label>

          <input
            value={disclaimerTitle}
            onChange={(e) => {
              setDisclaimerTitle(e.target.value);
              localStorage.setItem(disclaimerTitleKey, e.target.value);
            }}
            placeholder="Example: Lead-Based Paint Disclaimer"
            className="mb-4 w-full rounded-xl border border-slate-700 bg-[#020817] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400"
          />

          <label className="mb-2 block text-sm font-extrabold uppercase tracking-wide text-teal-300">
            Disclaimer Text
          </label>

          <textarea
            value={disclaimerText}
            onChange={(e) => {
              setDisclaimerText(e.target.value);
              localStorage.setItem(disclaimerTextKey, e.target.value);
            }}
            placeholder="Write or generate the full disclaimer text..."
            rows={6}
            className="w-full rounded-xl border border-slate-700 bg-[#020817] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400"
          />

          <button
            type="button"
            onClick={saveDisclaimerForFutureReports}
            className="mt-3 rounded-xl bg-teal-400 px-5 py-3 font-bold text-slate-950 hover:bg-teal-300"
          >
            Save Disclaimer for Future Reports
          </button>

          {savedDisclaimers.length > 0 && (
            <div className="mt-6 space-y-3">
              <h4 className="text-sm font-extrabold uppercase tracking-wide text-slate-300">
                Saved Disclaimers
              </h4>

              {savedDisclaimers.map((disclaimer: any) => {
                const checked = selected.includes(disclaimer.id);
                const isEditing = editingDisclaimerId === disclaimer.id;

                return (
                  <div
                    key={disclaimer.id}
                    className="rounded-2xl border border-slate-700 bg-[#071224] p-4"
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <input
                          value={editingDisclaimerTitle}
                          onChange={(e) =>
                            setEditingDisclaimerTitle(e.target.value)
                          }
                          className="w-full rounded-xl border border-slate-700 bg-[#020817] px-4 py-3 text-white outline-none focus:border-teal-400"
                          placeholder="Disclaimer title"
                        />

                        <textarea
                          value={editingDisclaimerText}
                          onChange={(e) =>
                            setEditingDisclaimerText(e.target.value)
                          }
                          rows={7}
                          className="w-full rounded-xl border border-slate-700 bg-[#020817] px-4 py-3 text-white outline-none focus:border-teal-400"
                          placeholder="Disclaimer text"
                        />

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={saveEditedDisclaimer}
                            className="rounded-xl bg-teal-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-teal-300"
                          >
                            Save Edit
                          </button>

                          <button
                            type="button"
                            onClick={cancelEditingDisclaimer}
                            className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <label className="flex cursor-pointer items-start gap-4">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleSavedDisclaimer(disclaimer.id)
                            }
                            className="mt-1 h-5 w-5 accent-teal-400"
                          />

                          <div className="flex-1">
                            <p className="text-lg font-extrabold text-white">
                              {disclaimer.title}
                            </p>

                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">
                              {disclaimer.text}
                            </p>
                          </div>
                        </label>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEditingDisclaimer(disclaimer)}
                            className="rounded-xl border border-cyan-500/60 px-4 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/10"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteSavedDisclaimer(disclaimer.id)}
                            className="rounded-xl border border-red-500/60 px-4 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {item.type === "ai-notes" && (
        <div className="mb-6 rounded-2xl border border-teal-500/30 bg-[#020817]/70 p-4">
          <label className="mb-2 block text-sm font-extrabold uppercase tracking-wide text-teal-300">
            AI Notes for Disclaimers
          </label>

          <textarea
            value={aiNotes}
            onChange={(e) => {
              setAiNotes(e.target.value);
              localStorage.setItem(aiNotesKey, e.target.value);
            }}
            placeholder="Add notes for the AI to consider when writing or improving disclaimer language..."
            rows={5}
            className="w-full rounded-xl border border-slate-700 bg-[#020817] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400"
          />

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={generateAiText}
              disabled={generatingAi}
              className="rounded-xl bg-purple-500 px-5 py-3 text-sm font-bold text-white hover:bg-purple-400 disabled:opacity-60"
            >
              {generatingAi ? "Generating..." : "Generate Disclaimer"}
            </button>

            <button
              type="button"
              onClick={saveAiNotes}
              className="rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-teal-300"
            >
              Save AI Notes
            </button>

            <button
              type="button"
              onClick={clearAiNotes}
              className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800"
            >
              Clear Notes
            </button>
          </div>
        </div>
      )}

      {item.type !== "ai-notes" && (
        <div
          className={
            item.type === "temperature"
              ? "grid grid-cols-1 gap-4"
              : "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          }
        >
          {allOptions.map((option: string) => {
            const checked = selected.includes(option);

            return (
              <label
                key={option}
                className="grid min-h-[86px] cursor-pointer grid-cols-[44px_minmax(0,1fr)] items-center rounded-xl border border-slate-600/80 bg-[#0b1a31]/85 px-6 py-5 text-white transition hover:border-teal-400 hover:bg-[#10213d]"
              >
                <input
                  type={item.type === "temperature" ? "radio" : "checkbox"}
                  checked={checked}
                  onChange={() => toggleOption(option)}
                  className="sr-only"
                />

                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 items-center justify-center rounded-[6px] border-2 shadow-sm ${
                    checked
                      ? "border-teal-400 bg-teal-400"
                      : "border-white bg-transparent"
                  }`}
                >
                  {checked && (
                    <span className="text-base font-black leading-none text-slate-950">
                      ✓
                    </span>
                  )}
                </span>

                <span className="pl-5 text-xl font-semibold leading-6 text-white">
                  {option}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {item.title.toLowerCase().includes("limitations") && (
        <div className="mt-6 rounded-2xl border border-teal-500/30 bg-[#020817]/70 p-4">
          <label className="mb-2 block text-sm font-extrabold uppercase tracking-wide text-teal-300">
            AI Notes for Limitations
          </label>

          <textarea
            value={aiNotes}
            onChange={(e) => {
              setAiNotes(e.target.value);
              localStorage.setItem(aiNotesKey, e.target.value);
            }}
            placeholder="Add notes for the AI to consider when writing limitation language..."
            rows={4}
            className="w-full rounded-xl border border-slate-700 bg-[#020817] px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400"
          />
        </div>
      )}

      {showInput ? (
        <div className="mt-6 flex gap-3">
          <input
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onBlur={() => {
              if (!otherText.trim()) {
                setShowInput(false);
                setOtherText("");
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveOther();
              if (e.key === "Escape") {
                setShowInput(false);
                setOtherText("");
              }
            }}
            autoFocus
            placeholder="Add other option..."
            className="flex-1 rounded-xl border border-slate-600 bg-[#020817]/80 px-5 py-4 text-white outline-none transition focus:border-teal-400"
          />

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={saveOther}
            className="rounded-xl bg-teal-400 px-6 py-4 font-bold text-slate-950 hover:bg-teal-300"
          >
            Save
          </button>
        </div>
      ) : (
        item.type !== "ai-notes" && (
          <button
            type="button"
            onClick={() => setShowInput(true)}
            className="mt-6 text-lg font-extrabold text-teal-300 hover:text-teal-200"
          >
            + OTHER
          </button>
        )
      )}
    </div>
  );
}

function NormalFindingCard({ finding }: any) {
  const firstPhoto = finding.photos?.[0];

  const image =
    finding.signed_image_url ||
    finding.image_url ||
    finding.public_image_url ||
    firstPhoto?.signed_url ||
    firstPhoto?.public_url ||
    firstPhoto?.image_url ||
    "";

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-700 bg-[#071224] shadow-xl">
      {image && (
        <div className="border-b border-slate-700 bg-black">
          <img
            src={image}
            alt="Finding"
            className="max-h-[650px] w-full object-contain"
          />
        </div>
      )}

      <div className="p-6">
        <EditableFinding finding={finding} />

        {finding.observation && (
          <ReportBlock title="Observation" text={finding.observation} />
        )}

        {finding.implication && (
          <ReportBlock title="Implication" text={finding.implication} />
        )}

        {finding.recommendation && (
          <ReportBlock title="Recommendation" text={finding.recommendation} />
        )}

        {finding.comment && (
          <ReportBlock title="Additional Notes" text={finding.comment} />
        )}
      </div>
    </article>
  );
}

function ReportBlock({ title, text }: any) {
  return (
    <div className="mt-5">
      <h4 className="mb-2 text-lg font-bold text-white">{title}</h4>

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <p className="whitespace-pre-line text-sm leading-7 text-slate-200">
          {text}
        </p>
      </div>
    </div>
  );
}