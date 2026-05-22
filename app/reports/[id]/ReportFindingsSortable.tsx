"use client";

import { useEffect, useState } from "react";
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

export default function ReportFindingsSortable({
  inspectionId,
  groupedFindings,
  allFindings,
}: {
  inspectionId: string;
  groupedFindings: any[];
  allFindings: any[];
}) {
  const storageKey = `section-order-${inspectionId}`;

  const [sections, setSections] = useState(groupedFindings);

  useEffect(() => {
    const savedOrder = localStorage.getItem(storageKey);

    if (!savedOrder) return;

    try {
      const order = JSON.parse(savedOrder);

      const sorted = [...groupedFindings].sort(
        (a, b) => order.indexOf(a.section) - order.indexOf(b.section)
      );

      setSections(sorted);
    } catch {
      setSections(groupedFindings);
    }
  }, [groupedFindings, storageKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    setSections((items) => {
      const oldIndex = items.findIndex((item) => item.section === active.id);
      const newIndex = items.findIndex((item) => item.section === over.id);

      const newOrder = arrayMove(items, oldIndex, newIndex);

      localStorage.setItem(
        storageKey,
        JSON.stringify(newOrder.map((item) => item.section))
      );

      return newOrder;
    });
  }

  if (allFindings.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-[#0f172a] p-8 text-center">
        <p className="text-slate-300">No findings saved yet.</p>
      </div>
    );
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
        <div className="space-y-10">
          {sections.map((group) => (
            <SortableSection key={group.section} group={group} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableSection({ group }: { group: any }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.section });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`space-y-6 rounded-2xl ${
        isDragging ? "opacity-60" : "opacity-100"
      }`}
    >
      <div className="flex items-center gap-3 border-b border-teal-500 pb-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="print:hidden cursor-grab rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200 active:cursor-grabbing"
          title="Drag to reorder section"
        >
          ☰
        </button>

        <h3 className="text-2xl font-bold text-teal-400">{group.section}</h3>
      </div>

      {group.findings.map((finding: any) => (
        <div
          key={finding.id}
          className="rounded-2xl border border-slate-700 bg-[#0f172a] p-6 shadow-lg"
        >
          <div className="mb-5 space-y-4">
            {finding.image_url && (
              <img
                src={finding.image_url}
                alt="Finding"
                className="max-h-[450px] w-full rounded-xl border border-slate-700 object-contain"
              />
            )}

            {finding.photos?.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                {finding.photos.map((photo: any) => (
                  <img
                    key={photo.id}
                    src={photo.public_url}
                    alt="Finding Photo"
                    className="max-h-[320px] w-full rounded-xl border border-slate-700 object-cover"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold uppercase tracking-wide text-slate-400">
              {finding.section}
            </span>

            <SeverityBadge severity={finding.severity || "Recommended Repair"} />
          </div>

          <h4 className="text-2xl font-bold text-teal-300">{finding.title}</h4>

          {finding.observation && (
            <ReportBlock title="Observation" text={finding.observation} />
          )}

          {finding.implication && (
            <ReportBlock title="Implication" text={finding.implication} />
          )}

          {finding.recommendation && (
            <ReportBlock title="Recommendation" text={finding.recommendation} />
          )}

          <EditableFinding finding={finding} />
        </div>
      ))}
    </div>
  );
}

function ReportBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-5">
      <p className="text-lg font-bold text-white">{title}</p>

      <p className="mt-2 whitespace-pre-line leading-8 text-slate-300">
        {text}
      </p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  let classes = "bg-slate-700 text-slate-200 border-slate-600";

  if (severity === "Safety Concern" || severity === "safety") {
    classes = "bg-red-500/20 text-red-300 border-red-500/40";
  }

  if (severity === "Major Concern") {
    classes = "bg-orange-500/20 text-orange-300 border-orange-500/40";
  }

  if (severity === "Recommended Repair" || severity === "recommendation") {
    classes = "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
  }

  if (severity === "Maintenance") {
    classes = "bg-blue-500/20 text-blue-300 border-blue-500/40";
  }

  if (severity === "Monitor") {
    classes = "bg-purple-500/20 text-purple-300 border-purple-500/40";
  }

  if (severity === "info" || severity === "Informational") {
    classes = "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
  }

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${classes}`}
    >
      {severity}
    </span>
  );
}