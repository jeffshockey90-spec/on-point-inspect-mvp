"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EditableFinding from "../../../components/EditableFinding";

const SECTION_CHECKLISTS: Record<string, any[]> = {
  "Inspection Details": [
    {
      title: "In Attendance",
      type: "checkbox",
      options: ["Client", "Listing Agent", "Home Owner", "Client's Agent", "Inspector"],
      defaults: ["Client", "Inspector"],
    },
    {
      title: "Occupancy",
      type: "checkbox",
      options: ["Furnished", "Occupied", "Vacant", "Utilities Off"],
      defaults: ["Vacant"],
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
      defaults: ["Ranch"],
    },
    {
      title: "Temperature",
      type: "temperature",
      options: ["Fahrenheit (F)", "Celsius (C)"],
      defaults: ["Fahrenheit (F)"],
    },
    {
      title: "Type of Building",
      type: "checkbox",
      options: ["Multi-Family", "Attached", "Single Family", "Condominium / Townhouse", "Detached"],
      defaults: ["Single Family"],
    },
    {
      title: "Weather Conditions",
      type: "checkbox",
      options: ["Snow", "Dry", "Cloudy", "Hot", "Heavy Rain", "Clear", "Light Rain", "Humid", "Recent Rain"],
      defaults: ["Recent Rain"],
    },
  ],

  Exterior: [
    {
      title: "Inspection Method",
      type: "checkbox",
      options: ["Visual", "Infrared", "Attic Access", "Crawlspace Access"],
      defaults: ["Visual"],
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

  Garage: [
    {
      title: "Garage Type",
      type: "checkbox",
      options: ["Attached", "Detached", "Built-in", "Carport", "No Garage", "One Car", "Two Car", "Three Car"],
      defaults: [],
    },
    {
      title: "Vehicle Door",
      type: "checkbox",
      options: ["Manual", "Automatic Opener", "Sectional Door", "Roll-up Door", "Not Operated", "Not Present"],
      defaults: [],
    },
    {
      title: "Auto-Reverse Safety",
      type: "checkbox",
      options: ["Photo Eyes Present", "Pressure Reverse Tested", "Not Tested", "Not Present", "Unable to Verify"],
      defaults: [],
    },
    {
      title: "Fire Separation",
      type: "checkbox",
      options: ["Drywall Present", "Self-Closing Door", "Fire-Rated Door", "Not Visible", "Not Applicable"],
      defaults: [],
    },
    {
      title: "Garage Interior",
      type: "checkbox",
      options: ["Concrete Slab", "Finished Walls", "Unfinished Walls", "Storage Present", "Utilities Present"],
      defaults: [],
    },
    {
      title: "Limitations",
      type: "checkbox",
      options: ["Vehicles Present", "Stored Belongings", "Door Not Operated", "Limited Access", "Power Off"],
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
  "Garage",
];

export default function ReportFindingsSortable({
  groupedFindings,
  inspectionId,
}: any) {
  const hiddenSectionsKey = `hidden-sections-${inspectionId}`;
  const renamedSectionsKey = `renamed-sections-${inspectionId}`;

  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [renamedSections, setRenamedSections] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    const savedHidden = localStorage.getItem(hiddenSectionsKey);
    const savedRenamed = localStorage.getItem(renamedSectionsKey);

    if (savedHidden) setHiddenSections(JSON.parse(savedHidden));
    if (savedRenamed) setRenamedSections(JSON.parse(savedRenamed));
  }, [hiddenSectionsKey, renamedSectionsKey]);

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

  function restoreAllSections() {
    setHiddenSections([]);
    localStorage.setItem(hiddenSectionsKey, JSON.stringify([]));
  }

  const orderedGroups = useMemo(() => {
    const groups = groupedFindings || [];

    return SECTION_ORDER.map((section) => {
      const existing = groups.find((group: any) => group.section === section);

      return {
        section,
        findings: existing?.findings || [],
      };
    }).filter((group) => !hiddenSections.includes(group.section));
  }, [groupedFindings, hiddenSections]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/field-tool?inspection_id=${inspectionId}`}
          className="rounded-xl border border-emerald-500 px-5 py-3 font-bold text-emerald-300 transition hover:bg-emerald-500 hover:text-slate-950"
        >
          Field Tool
        </Link>
      </div>

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
}: any) {
  const checklist = SECTION_CHECKLISTS[group.section] || [];

  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName);

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
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#071224] shadow-xl">
      <div className="border-b border-slate-700 bg-slate-800/80 px-6 py-4">
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
            <h2 className="text-2xl font-bold text-teal-400">{displayName}</h2>
          )}

          {!isEditingName && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                Edit Name
              </button>

              <button
                type="button"
                onClick={() => onHide(group.section)}
                className="rounded-xl border border-red-500/50 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10"
              >
                Hide Section
              </button>
            </div>
          )}
        </div>
      </div>

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
    </section>
  );
}

function ChecklistCard({ item, section, inspectionId }: any) {
  const storageKey = `inspection-${inspectionId}-${section}-${item.title}`;
  const customKey = `custom-options-${section}-${item.title}`;
  const temperatureKey = `temperature-${inspectionId}-${section}-${item.title}`;

  const [selected, setSelected] = useState<string[]>(item.defaults || []);
  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [showInput, setShowInput] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [temperature, setTemperature] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    const savedCustom = localStorage.getItem(customKey);
    const savedTemp = localStorage.getItem(temperatureKey);

    if (saved) setSelected(JSON.parse(saved));
    if (savedCustom) setCustomOptions(JSON.parse(savedCustom));
    if (savedTemp) setTemperature(savedTemp);
  }, [storageKey, customKey, temperatureKey]);

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

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1730]">
      <div className="border-b border-slate-700 bg-slate-800/70 px-6 py-3">
        <h3 className="text-lg font-bold text-teal-300">{item.title}</h3>
      </div>

      <div className="p-6">
        {item.type === "temperature" && (
          <input
            value={temperature}
            onChange={(e) => {
              setTemperature(e.target.value);
              localStorage.setItem(temperatureKey, e.target.value);
            }}
            placeholder="Enter temperature"
            className="mb-6 w-full rounded-xl border border-slate-700 bg-[#020817] px-4 py-3 text-white outline-none focus:border-teal-400"
          />
        )}

        <div className="flex flex-wrap gap-x-14 gap-y-6">
          {allOptions.map((option: string) => {
            const checked = selected.includes(option);

            return (
              <label
                key={option}
                className="flex min-w-[210px] items-center gap-4 text-white"
              >
                <input
                  type={item.type === "temperature" ? "radio" : "checkbox"}
                  checked={checked}
                  onChange={() => toggleOption(option)}
                  className="h-5 w-5 accent-teal-400"
                />

                <span className="text-lg">{option}</span>
              </label>
            );
          })}
        </div>

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
              className="flex-1 rounded-xl border border-slate-700 bg-[#020817] px-4 py-3 text-white outline-none focus:border-teal-400"
            />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={saveOther}
              className="rounded-xl bg-teal-400 px-5 py-3 font-bold text-slate-900 hover:bg-teal-300"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowInput(true)}
            className="mt-6 text-lg font-semibold text-teal-300 hover:text-teal-200"
          >
            + OTHER
          </button>
        )}
      </div>
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