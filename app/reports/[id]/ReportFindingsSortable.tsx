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
    options: [
      "Furnished",
      "Occupied",
      "Vacant",
      "Utilities Off",
    ],
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
    defaultValue: "56",
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

    const existingFindings =
      existingInspectionDetails?.findings || [];

    const requiredFindings =
      INSPECTION_DETAILS_CHECKLIST.map((item) => {
        const existing = existingFindings.find(
          (finding: any) =>
            finding.title === item.title
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
        findings: [
          ...requiredFindings,
          ...extraFindings,
        ],
      },

      ...otherSections,
    ];
  }, [groupedFindings]);

  const [sections, setSections] = useState<any[]>(
    sectionsWithRequiredInspectionDetails
  );

  useEffect(() => {
    setSections(
      sectionsWithRequiredInspectionDetails
    );
  }, [sectionsWithRequiredInspectionDetails]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id)
      return;

    setSections((items) => {
      const oldIndex = items.findIndex(
        (item) => item.section === active.id
      );

      const newIndex = items.findIndex(
        (item) => item.section === over.id
      );

      if (
        oldIndex === -1 ||
        newIndex === -1
      )
        return items;

      return arrayMove(
        items,
        oldIndex,
        newIndex
      );
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sections.map(
          (group) => group.section
        )}
        strategy={
          verticalListSortingStrategy
        }
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
    transform:
      CSS.Transform.toString(transform),
    transition,
  };

  const isInspectionDetails =
    group.section === "Inspection Details";

  return (
    <section
      ref={setNodeRef}
      style={style}
      className="space-y-4"
    >
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
      </div>

      {(group.findings || []).map(
        (finding: any) => {
          const checklist =
            INSPECTION_DETAILS_CHECKLIST.find(
              (item) =>
                item.title === finding.title
            );

          if (
            isInspectionDetails &&
            checklist
          ) {
            return (
              <ChecklistFindingCard
                key={finding.id}
                inspectionId={inspectionId}
                finding={finding}
                checklist={checklist}
              />
            );
          }

          return (
            <NormalFindingCard
              key={finding.id}
              finding={finding}
            />
          );
        }
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

  const [checkedOptions, setCheckedOptions] =
    useState<string[]>(
      checklist.defaults || []
    );

  const [customOptions, setCustomOptions] =
    useState<string[]>([]);

  const [showOtherInput, setShowOtherInput] =
    useState(false);

  const [otherText, setOtherText] =
    useState("");

  const [temperatureValue, setTemperatureValue] =
    useState(
      checklist.defaultValue || "56"
    );

  useEffect(() => {
    const saved =
      localStorage.getItem(
        localStorageKey
      );

    const savedCustom =
      localStorage.getItem(
        customOptionsKey
      );

    if (saved) {
      setCheckedOptions(
        JSON.parse(saved)
      );
    }

    if (savedCustom) {
      setCustomOptions(
        JSON.parse(savedCustom)
      );
    }
  }, [localStorageKey, customOptionsKey]);

  const allOptions = [
    ...checklist.options,
    ...customOptions,
  ];

  function toggleOption(option: string) {
    setCheckedOptions((current) => {
      let updated: string[];

      if (
        checklist.type === "temperature"
      ) {
        updated = [option];
      } else {
        updated = current.includes(option)
          ? current.filter(
              (item) => item !== option
            )
          : [...current, option];
      }

      localStorage.setItem(
        localStorageKey,
        JSON.stringify(updated)
      );

      return updated;
    });
  }

  function saveOtherOption() {
    const cleaned =
      otherText.trim();

    if (!cleaned) return;

    const updated = [
      ...customOptions,
      cleaned,
    ];

    setCustomOptions(updated);

    localStorage.setItem(
      customOptionsKey,
      JSON.stringify(updated)
    );

    setCheckedOptions((current) => {
      const next = [
        ...current,
        cleaned,
      ];

      localStorage.setItem(
        localStorageKey,
        JSON.stringify(next)
      );

      return next;
    });

    setOtherText("");
    setShowOtherInput(false);
  }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-700 bg-[#0f172a] text-white shadow-lg">
      <div className="flex items-center gap-3 border-b border-slate-700 bg-slate-800/80 px-4 py-2">
        <h3 className="text-sm font-bold text-teal-300">
          {finding.title}
        </h3>

        <button className="text-xs text-slate-400 hover:text-white">
          ✎
        </button>

        <button className="text-xs text-slate-400 hover:text-white">
          📷
        </button>

        <button className="text-xs text-slate-400 hover:text-white">
          ✨
        </button>
      </div>

      <div className="px-4 py-4">
        {checklist.type ===
          "temperature" && (
          <input
            value={temperatureValue}
            onChange={(e) =>
              setTemperatureValue(
                e.target.value
              )
            }
            className="mb-4 w-full border-b border-slate-600 bg-transparent px-1 py-2 text-base text-white outline-none"
          />
        )}

        <div className="grid grid-cols-1 gap-x-16 gap-y-3 md:grid-cols-2">
          {allOptions.map(
            (option: string) => {
              const isChecked =
                checkedOptions.includes(
                  option
                );

              return (
                <label
                  key={option}
                  className="flex items-center gap-3 rounded-lg px-2 py-1 text-sm text-slate-100 hover:bg-slate-800/80"
                >
                  <input
                    type={
                      checklist.type ===
                      "temperature"
                        ? "radio"
                        : "checkbox"
                    }
                    checked={isChecked}
                    onChange={() =>
                      toggleOption(option)
                    }
                    className="h-4 w-4 shrink-0 accent-teal-500"
                  />

                  <span className="whitespace-nowrap leading-tight">
                    {option}
                  </span>
                </label>
              );
            }
          )}
        </div>

        {showOtherInput && (
          <div className="mt-4 flex gap-2">
            <input
              value={otherText}
              onChange={(e) =>
                setOtherText(
                  e.target.value
                )
              }
              placeholder="Add other option..."
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
            />

            <button
              onClick={saveOtherOption}
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-bold text-slate-950"
            >
              Save
            </button>
          </div>
        )}

        {!showOtherInput && (
          <button
            type="button"
            onClick={() =>
              setShowOtherInput(true)
            }
            className="mt-4 text-sm font-medium text-teal-300 hover:text-teal-200"
          >
            + OTHER
          </button>
        )}
      </div>
    </article>
  );
}

function NormalFindingCard({
  finding,
}: {
  finding: any;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0f172a] shadow-xl">
      <div className="p-5 md:p-6">
        <EditableFinding finding={finding} />
      </div>
    </article>
  );
}