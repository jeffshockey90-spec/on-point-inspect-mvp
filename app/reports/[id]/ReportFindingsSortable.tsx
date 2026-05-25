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
    options: [
      "Client",
      "Listing Agent",
      "Home Owner",
      "Client's Agent",
      "Inspector",
      "OTHER",
    ],
  },

  {
    title: "Occupancy",
    options: [
      "Furnished",
      "Occupied",
      "Vacant",
      "Utilities Off",
      "OTHER",
    ],
  },

  {
    title: "Style",
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
      "OTHER",
    ],
  },

  {
    title: "Temperature",
    options: ["56", "OTHER"],
  },

  {
    title: "Type of Building",
    options: [
      "Multi-Family",
      "Attached",
      "Single Family",
      "Condominium / Townhouse",
      "Detached",
      "OTHER",
    ],
  },

  {
    title: "Weather Conditions",
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
      "OTHER",
    ],
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
  const storageKey = `section-order-${inspectionId}`;

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
      const oldIndex = items.findIndex(
        (item) => item.section === active.id
      );

      const newIndex = items.findIndex(
        (item) => item.section === over.id
      );

      if (oldIndex === -1 || newIndex === -1) return items;

      const newOrder = arrayMove(items, oldIndex, newIndex);

      localStorage.setItem(
        storageKey,
        JSON.stringify(newOrder.map((item) => item.section))
      );

      return newOrder;
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
    isDragging,
  } = useSortable({
    id: group.section,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [activeTab, setActiveTab] = useState<
    "Information" | "Limitations"
  >("Information");

  const isInspectionDetails =
    group.section === "Inspection Details";

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`space-y-4 ${
        isDragging ? "opacity-60" : "opacity-100"
      }`}
    >
      <div className="sticky top-0 z-10 rounded-xl border border-slate-700 bg-slate-900/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab rounded-lg border border-slate-600 bg-slate-800 px-3 py-1 text-sm font-bold text-slate-200 active:cursor-grabbing"
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
              onClick={() =>
                setActiveTab("Information")
              }
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
              onClick={() =>
                setActiveTab("Limitations")
              }
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

      {isInspectionDetails &&
      activeTab === "Limitations" ? (
        <InspectionLimitationsCard
          inspectionId={inspectionId}
        />
      ) : (
        (group.findings || []).map((finding: any) => {
          const checklist =
            INSPECTION_DETAILS_CHECKLIST.find(
              (item) => item.title === finding.title
            );

          if (isInspectionDetails && checklist) {
            return (
              <ChecklistFindingCard
                key={finding.id}
                inspectionId={inspectionId}
                finding={finding}
                options={checklist.options}
              />
            );
          }

          return (
            <NormalFindingCard
              key={finding.id}
              finding={finding}
            />
          );
        })
      )}
    </section>
  );
}

function ChecklistFindingCard({
  inspectionId,
  finding,
  options,
}: {
  inspectionId: string;
  finding: any;
  options: string[];
}) {
  const localStorageKey = `inspection-${inspectionId}-checklist-${finding.title}`;

  const [checkedOptions, setCheckedOptions] =
    useState<string[]>([]);

  useEffect(() => {
    const saved =
      localStorage.getItem(localStorageKey);

    if (saved) {
      setCheckedOptions(JSON.parse(saved));
    }
  }, [localStorageKey]);

  function toggleOption(option: string) {
    setCheckedOptions((current) => {
      const updated = current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option];

      localStorage.setItem(
        localStorageKey,
        JSON.stringify(updated)
      );

      return updated;
    });
  }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-700 bg-[#0f172a]">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/80 px-4 py-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-teal-300">
            {finding.title}
          </h3>

          <button
            type="button"
            className="text-xs text-slate-400 transition hover:text-white"
          >
            ✎
          </button>

          <button
            type="button"
            className="text-xs text-slate-400 transition hover:text-white"
          >
            📷
          </button>

          <button
            type="button"
            className="text-xs text-slate-400 transition hover:text-white"
          >
            ✨
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2 py-1 text-sm text-slate-100 transition hover:border-slate-700 hover:bg-slate-800/60"
            >
              <input
                type="checkbox"
                checked={checkedOptions.includes(
                  option
                )}
                onChange={() =>
                  toggleOption(option)
                }
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-500 bg-slate-900 accent-teal-500"
              />

              <span className="whitespace-normal leading-tight text-slate-100">
                {option}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <button
            type="button"
            className="text-xs font-medium text-teal-300 transition hover:text-teal-200"
          >
            + OTHER
          </button>

          <button
            type="button"
            className="rounded-lg border border-slate-600 px-3 py-1 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
          >
            ✨ Edit with AI
          </button>
        </div>
      </div>
    </article>
  );
}

function InspectionLimitationsCard({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const localStorageKey = `inspection-${inspectionId}-limitations-note`;

  const [note, setNote] = useState("");

  useEffect(() => {
    setNote(
      localStorage.getItem(localStorageKey) || ""
    );
  }, [localStorageKey]);

  function saveNote(value: string) {
    setNote(value);

    localStorage.setItem(
      localStorageKey,
      value
    );
  }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-700 bg-[#0f172a]">
      <div className="bg-slate-800/80 px-4 py-2">
        <h3 className="text-base font-bold text-teal-300">
          Inspection Limitations
        </h3>
      </div>

      <div className="p-4">
        <textarea
          value={note}
          onChange={(e) =>
            saveNote(e.target.value)
          }
          rows={4}
          placeholder="Example: Snow covered portions of roof, stored belongings limited access, utilities off, locked rooms, unsafe access, etc."
          className="w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 text-sm text-white outline-none focus:border-teal-400"
        />

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-3 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800"
          >
            ✨ Edit with AI
          </button>
        </div>
      </div>
    </article>
  );
}

function NormalFindingCard({
  finding,
}: {
  finding: any;
}) {
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
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-200">
                {finding.section || "General"}
              </span>

              <SeverityBadge
                severity={
                  finding.severity ||
                  "Informational"
                }
              />
            </div>

            <h3 className="text-2xl font-bold text-teal-300">
              {finding.title ||
                "Untitled Finding"}
            </h3>
          </div>
        </div>

        <EditableFinding finding={finding} />

        {finding.observation && (
          <ReportBlock
            title="Observation"
            text={finding.observation}
          />
        )}

        {finding.implication && (
          <ReportBlock
            title="Implication"
            text={finding.implication}
          />
        )}

        {finding.recommendation && (
          <ReportBlock
            title="Recommendation"
            text={finding.recommendation}
          />
        )}

        {finding.comment && (
          <ReportBlock
            title="Additional Notes"
            text={finding.comment}
          />
        )}
      </div>
    </article>
  );
}

function ReportBlock({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="mt-5">
      <h4 className="mb-2 text-lg font-bold text-white">
        {title}
      </h4>

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <p className="whitespace-pre-line text-sm leading-7 text-slate-200">
          {text}
        </p>
      </div>
    </div>
  );
}

function SeverityBadge({
  severity,
}: {
  severity: string;
}) {
  let classes =
    "bg-slate-700 text-slate-200 border-slate-600";

  if (
    severity === "Safety Concern" ||
    severity === "safety"
  ) {
    classes =
      "bg-red-500/20 text-red-300 border-red-500/40";
  }

  if (severity === "Major Concern") {
    classes =
      "bg-orange-500/20 text-orange-300 border-orange-500/40";
  }

  if (
    severity === "Recommended Repair" ||
    severity === "recommendation"
  ) {
    classes =
      "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
  }

  if (severity === "Maintenance") {
    classes =
      "bg-blue-500/20 text-blue-300 border-blue-500/40";
  }

  if (severity === "Monitor") {
    classes =
      "bg-purple-500/20 text-purple-300 border-purple-500/40";
  }

  if (
    severity === "info" ||
    severity === "Informational"
  ) {
    classes =
      "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
  }

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${classes}`}
    >
      {severity}
    </span>
  );
}