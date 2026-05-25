"use client";

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
      options: [
        "Multi-Family",
        "Attached",
        "Single Family",
        "Condominium / Townhouse",
        "Detached",
      ],
      defaults: ["Single Family"],
    },
    {
      title: "Weather Conditions",
      type: "checkbox",
      options: [
        "Snow",
        "Dry",
        "Cloudy",
        "Hot",
        "Heavy Rain",
        "Clear",
        "Light Rain",
        "Humid",
        "Recent Rain",
      ],
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
      options: [
        "Brick Veneer",
        "Stone Veneer",
        "Stucco",
        "Vinyl Siding",
        "Wood Siding",
        "Fiber Cement Siding",
        "Aluminum Siding",
      ],
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
      options: [
        "Walked Roof",
        "From Ground",
        "From Ladder",
        "Drone",
        "Binoculars",
        "Limited Visibility",
      ],
      defaults: [],
    },
    {
      title: "Roof Covering",
      type: "checkbox",
      options: [
        "Asphalt Shingles",
        "Architectural Shingles",
        "3-Tab Shingles",
        "Metal",
        "Standing Seam Metal",
        "Rubber / EPDM",
        "Rolled Roofing",
        "Slate",
        "Tile",
        "Wood Shakes",
      ],
      defaults: [],
    },
    {
      title: "Roof Style",
      type: "checkbox",
      options: [
        "Gable",
        "Hip",
        "Flat / Low Slope",
        "Mansard",
        "Gambrel",
        "Shed",
        "Combination",
      ],
      defaults: [],
    },
    {
      title: "Roof Drainage",
      type: "checkbox",
      options: [
        "Gutters Present",
        "Downspouts Present",
        "No Gutters",
        "Underground Drains",
        "Splash Blocks",
        "Extensions Present",
      ],
      defaults: [],
    },
    {
      title: "Flashing / Penetrations",
      type: "checkbox",
      options: [
        "Plumbing Vent Boots",
        "Chimney Flashing",
        "Wall Flashing",
        "Skylight Flashing",
        "Roof Vents",
        "Satellite / Antenna Mounts",
      ],
      defaults: [],
    },
    {
      title: "Roof Limitations",
      type: "checkbox",
      options: [
        "Steep Roof",
        "Wet Roof",
        "Snow Covered",
        "Height Limitation",
        "Unsafe Access",
        "Viewed From Ground Only",
        "Drone Only",
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
  "Garage",
];

export default function ReportFindingsSortable({
  groupedFindings,
  inspectionId,
}: any) {
  const orderedGroups = useMemo(() => {
    const groups = groupedFindings || [];

    return SECTION_ORDER.map((section) => {
      const existing = groups.find((group: any) => group.section === section);

      return {
        section,
        findings: existing?.findings || [],
      };
    });
  }, [groupedFindings]);

  return (
    <div className="space-y-6">
      {orderedGroups.map((group: any) => (
        <SectionBlock
          key={group.section}
          group={group}
          inspectionId={inspectionId}
        />
      ))}
    </div>
  );
}

function SectionBlock({ group, inspectionId }: any) {
  const checklist = SECTION_CHECKLISTS[group.section] || [];

  const normalFindings =
    group.findings?.filter(
      (finding: any) =>
        !checklist.some((item: any) => item.title === finding.title)
    ) || [];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#071224] shadow-xl">
      <div className="border-b border-slate-700 bg-slate-800/80 px-6 py-4">
        <h2 className="text-2xl font-bold text-teal-400">{group.section}</h2>
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