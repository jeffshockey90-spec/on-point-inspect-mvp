"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
    defaultValue: "",
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
  inspectionId,
  groupedFindings,
}: {
  inspectionId: string;
  groupedFindings: any[];
  allFindings: any[];
}) {
  const sectionsWithRequiredInspectionDetails = useMemo(() => {
    const baseSections = groupedFindings || [];

    const existingInspectionDetails = baseSections.find(
      (group) => group.section === "Inspection Details"
    );

    const otherSections = baseSections.filter(
      (group) => group.section !== "Inspection Details"
    );

    const existingFindings = existingInspectionDetails?.findings || [];

    const requiredFindings = INSPECTION_DETAILS_CHECKLIST.map((item) => {
      const existing = existingFindings.find(
        (finding: any) => finding.title === item.title
      );

      return (
        existing || {
          id: `required-${item.title}`,
          section: "Inspection Details",
          title: item.title,
          severity: "Informational",
          observation: "",
          implication: "",
          recommendation: "",
          comment: "",
          photos: [],
          is_virtual_required: true,
        }
      );
    });

    const extraFindings = existingFindings.filter(
      (finding: any) =>
        !INSPECTION_DETAILS_CHECKLIST.some(
          (item) => item.title === finding.title
        )
    );

    return [
      {
        section: "Inspection Details",
        findings: [...requiredFindings, ...extraFindings],
      },
      ...otherSections,
    ];
  }, [groupedFindings]);

  const [sections, setSections] = useState<any[]>(
    sectionsWithRequiredInspectionDetails
  );

  useEffect(() => {
    setSections(sectionsWithRequiredInspectionDetails);
  }, [sectionsWithRequiredInspectionDetails]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    setSections((items) => {
      const oldIndex = items.findIndex((item) => item.section === active.id);
      const newIndex = items.findIndex((item) => item.section === over.id);

      if (oldIndex === -1 || newIndex === -1) return items;

      return arrayMove(items, oldIndex, newIndex);
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sections.map((group) => group.section)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-6">
          {sections.map((group) => (
            <SortableSection
              key={group.section}
              group={group}
              inspectionId={inspectionId}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableSection({
  group,
  inspectionId,
}: {
  group: any;
  inspectionId: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: group.section,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [activeTab, setActiveTab] = useState<"Information" | "Limitations">(
    "Information"
  );

  const isInspectionDetails = group.section === "Inspection Details";

  return (
    <section ref={setNodeRef} style={style} className="space-y-4">
      <div className="sticky top-0 z-10 rounded-xl border border-slate-700 bg-slate-900/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab rounded-lg border border-slate-600 bg-slate-800 px-3 py-1 text-sm font-bold text-slate-200"
          >
            ☰
          </button>

          <h2 className="text-2xl font-bold text-teal-400">
            {group.section}
          </h2>
        </div>

        {isInspectionDetails && (
          <div className="mt-3 flex gap-6 border-b border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab("Information")}
              className={`pb-2 text-sm font-bold ${
                activeTab === "Information"
                  ? "border-b-4 border-teal-400 text-white"
                  : "text-slate-400"
              }`}
            >
              Information
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("Limitations")}
              className={`pb-2 text-sm font-bold ${
                activeTab === "Limitations"
                  ? "border-b-4 border-teal-400 text-white"
                  : "text-slate-400"
              }`}
            >
              Limitations
            </button>
          </div>
        )}
      </div>

      {isInspectionDetails && activeTab === "Limitations" ? (
        <InspectionLimitationsCard inspectionId={inspectionId} />
      ) : (
        (group.findings || []).map((finding: any) => {
          const checklist = INSPECTION_DETAILS_CHECKLIST.find(
            (item) => item.title === finding.title
          );

          if (isInspectionDetails && checklist) {
            return (
              <ChecklistFindingCard
                key={finding.id}
                inspectionId={inspectionId}
                finding={finding}
                checklist={checklist}
              />
            );
          }

          return <NormalFindingCard key={finding.id} finding={finding} />;
        })
      )}
    </section>
  );
}

function ChecklistFindingCard({
  inspectionId,
  finding,
  checklist,
}: {
  inspectionId: string;
  finding: any;
  checklist: any;
}) {
  const localStorageKey = `inspection-${inspectionId}-${finding.title}`;
  const customOptionsKey = `custom-options-${finding.title}`;

  const [checkedOptions, setCheckedOptions] = useState<string[]>(
    checklist.defaults || []
  );

  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [temperatureValue, setTemperatureValue] = useState(
    checklist.defaultValue || ""
  );

  useEffect(() => {
    const saved = localStorage.getItem(localStorageKey);
    const savedCustom = localStorage.getItem(customOptionsKey);

    if (saved) setCheckedOptions(JSON.parse(saved));
    if (savedCustom) setCustomOptions(JSON.parse(savedCustom));
  }, [localStorageKey, customOptionsKey]);

  const allOptions = [...checklist.options, ...customOptions].filter(
    (option, index, array) => array.indexOf(option) === index
  );

  function toggleOption(option: string) {
    setCheckedOptions((current) => {
      let updated: string[];

      if (checklist.type === "temperature") {
        updated = [option];
      } else {
        updated = current.includes(option)
          ? current.filter((item) => item !== option)
          : [...current, option];
      }

      localStorage.setItem(localStorageKey, JSON.stringify(updated));
      return updated;
    });
  }

  function saveOtherOption() {
    const cleaned = otherText.trim();

    if (!cleaned) {
      setShowOtherInput(false);
      setOtherText("");
      return;
    }

    const updatedCustom = [...customOptions, cleaned].filter(
      (option, index, array) => array.indexOf(option) === index
    );

    setCustomOptions(updatedCustom);
    localStorage.setItem(customOptionsKey, JSON.stringify(updatedCustom));

    setCheckedOptions((current) => {
      const updatedChecked = current.includes(cleaned)
        ? current
        : [...current, cleaned];

      localStorage.setItem(localStorageKey, JSON.stringify(updatedChecked));
      return updatedChecked;
    });

    setOtherText("");
    setShowOtherInput(false);
  }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-700 bg-[#0f172a] text-slate-100 shadow-lg">
      <div className="border-b border-slate-700 bg-slate-800/80 px-4 py-2">
        <h3 className="text-sm font-bold text-teal-300">{finding.title}</h3>
      </div>

      <div className="px-4 py-4">
        {checklist.type === "temperature" && (
          <input
            value={temperatureValue}
            onChange={(e) => setTemperatureValue(e.target.value)}
            className="mb-4 w-full border-b border-slate-600 bg-transparent px-1 py-2 text-sm text-slate-100 outline-none focus:border-teal-400"
            placeholder="Enter temperature"
          />
        )}

        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {allOptions.map((option: string) => {
            const isChecked = checkedOptions.includes(option);

            return (
              <label
                key={option}
                className="flex min-w-[190px] max-w-[240px] cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-200 hover:bg-slate-800/80"
              >
                <input
                  type={checklist.type === "temperature" ? "radio" : "checkbox"}
                  checked={isChecked}
                  onChange={() => toggleOption(option)}
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border border-teal-500 bg-slate-950 accent-teal-400"
                />

                <span className="whitespace-nowrap text-sm leading-tight text-slate-200">
                  {option}
                </span>
              </label>
            );
          })}
        </div>

        {showOtherInput && (
          <div className="mt-4 flex gap-2">
            <input
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onBlur={() => {
                if (!otherText.trim()) {
                  setShowOtherInput(false);
                  setOtherText("");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveOtherOption();

                if (e.key === "Escape") {
                  setShowOtherInput(false);
                  setOtherText("");
                }
              }}
              autoFocus
              placeholder="Add other option..."
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-400"
            />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={saveOtherOption}
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-teal-400"
            >
              Save
            </button>
          </div>
        )}

        {!showOtherInput && (
          <button
            type="button"
            onClick={() => setShowOtherInput(true)}
            className="mt-4 text-sm font-medium text-teal-300 hover:text-teal-200"
          >
            + OTHER
          </button>
        )}
      </div>
    </article>
  );
}

function InspectionLimitationsCard({ inspectionId }: { inspectionId: string }) {
  const localStorageKey = `inspection-${inspectionId}-limitations-note`;

  const [note, setNote] = useState("");

  useEffect(() => {
    setNote(localStorage.getItem(localStorageKey) || "");
  }, [localStorageKey]);

  function saveNote(value: string) {
    setNote(value);
    localStorage.setItem(localStorageKey, value);
  }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-700 bg-[#0f172a] text-slate-100 shadow-lg">
      <div className="border-b border-slate-700 bg-slate-800/80 px-4 py-2">
        <h3 className="text-sm font-bold text-teal-300">
          Inspection Limitations
        </h3>
      </div>

      <div className="p-4">
        <textarea
          value={note}
          onChange={(e) => saveNote(e.target.value)}
          rows={4}
          placeholder="Example: Snow covered portions of roof, stored belongings limited access, utilities off, locked rooms, unsafe access, etc."
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-teal-400"
        />

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="rounded-md border border-slate-600 px-3 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800"
          >
            ✨ Edit with AI
          </button>
        </div>
      </div>
    </article>
  );
}

function NormalFindingCard({ finding }: { finding: any }) {
  const firstPhoto = finding.photos?.[0];

  const mainImage =
    finding.signed_image_url ||
    finding.image_url ||
    finding.public_image_url ||
    firstPhoto?.signed_url ||
    firstPhoto?.public_url ||
    firstPhoto?.image_url ||
    "";

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-xl">
      {mainImage && (
        <div className="border-b border-slate-700 bg-black">
          <img
            src={mainImage}
            alt="Finding"
            className="max-h-[650px] w-full object-contain"
          />
        </div>
      )}

      <div className="p-5 md:p-6">
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

function ReportBlock({ title, text }: { title: string; text: string }) {
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