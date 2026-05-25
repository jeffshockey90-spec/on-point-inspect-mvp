"use client";

import { useEffect, useMemo, useState } from "react";
import EditableFinding from "../../../components/EditableFinding";

const INSPECTION_DETAILS_CHECKLIST = [
  {
    title: "In Attendance",
    type: "checkbox",
    options: [
      "Client",
      "Listing Agent",
      "Home Owner",
      "Client's Agent",
      "Inspector",
    ],
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
];

export default function ReportFindingsSortable({
  groupedFindings,
  inspectionId,
}: any) {
  const inspectionDetails = INSPECTION_DETAILS_CHECKLIST;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-700 bg-[#071224] shadow-xl overflow-hidden">
        <div className="border-b border-slate-700 bg-slate-800/80 px-6 py-4">
          <h2 className="text-2xl font-bold text-teal-400">
            Inspection Details
          </h2>
        </div>

        <div className="space-y-5 p-5">
          {inspectionDetails.map((item) => (
            <ChecklistCard
              key={item.title}
              item={item}
              inspectionId={inspectionId}
            />
          ))}
        </div>
      </section>

      {groupedFindings
        ?.filter((group: any) => group.section !== "Inspection Details")
        ?.map((group: any) => (
          <div key={group.section} className="space-y-4">
            <div className="rounded-xl border border-slate-700 bg-[#071224] p-4">
              <h2 className="text-2xl font-bold text-teal-400">
                {group.section}
              </h2>
            </div>

            {group.findings?.map((finding: any) => (
              <NormalFindingCard key={finding.id} finding={finding} />
            ))}
          </div>
        ))}
    </div>
  );
}

function ChecklistCard({ item, inspectionId }: any) {
  const storageKey = `inspection-${inspectionId}-${item.title}`;
  const customKey = `custom-options-${item.title}`;

  const [selected, setSelected] = useState<string[]>(item.defaults || []);
  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [showInput, setShowInput] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [temperature, setTemperature] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    const savedCustom = localStorage.getItem(customKey);

    if (saved) setSelected(JSON.parse(saved));
    if (savedCustom) setCustomOptions(JSON.parse(savedCustom));
  }, [storageKey, customKey]);

  const allOptions = [...item.options, ...customOptions];

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
      return;
    }

    const updated = [...customOptions, cleaned];

    setCustomOptions(updated);
    localStorage.setItem(customKey, JSON.stringify(updated));

    const selectedUpdated = [...selected, cleaned];

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
            onChange={(e) => setTemperature(e.target.value)}
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
                className="flex min-w-[240px] items-center gap-4 text-white"
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
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveOther();
              }}
              autoFocus
              placeholder="Add other option..."
              className="flex-1 rounded-xl border border-slate-700 bg-[#020817] px-4 py-3 text-white outline-none focus:border-teal-400"
            />

            <button
              onClick={saveOther}
              className="rounded-xl bg-teal-400 px-5 py-3 font-bold text-slate-900"
            >
              Save
            </button>
          </div>
        ) : (
          <button
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