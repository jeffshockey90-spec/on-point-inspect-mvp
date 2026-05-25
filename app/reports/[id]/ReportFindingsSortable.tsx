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
  const [sections, setSections] = useState<any[]>(groupedFindings || []);

  useEffect(() => {
    setSections(groupedFindings || []);
  }, [groupedFindings]);

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

      const newOrder = arrayMove(items, oldIndex, newIndex);

      localStorage.setItem(
        storageKey,
        JSON.stringify(newOrder.map((item) => item.section))
      );

      return newOrder;
    });
  }

  if (!allFindings || allFindings.length === 0) {
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
  } = useSortable({
    id: group.section,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`space-y-6 ${isDragging ? "opacity-60" : "opacity-100"}`}
    >
      <div className="sticky top-0 z-10 flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/95 px-5 py-4 backdrop-blur">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200 active:cursor-grabbing"
        >
          ☰
        </button>

        <h2 className="text-4xl font-bold text-teal-400">{group.section}</h2>
      </div>

      {(group.findings || []).map((finding: any) => {
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
          <article
            key={finding.id}
            className="overflow-hidden rounded-3xl border border-slate-700 bg-[#0f172a] shadow-2xl"
          >
            {mainImage && (
              <div className="border-b border-slate-700 bg-black">
                <img
                  src={mainImage}
                  alt="Finding"
                  className="max-h-[650px] w-full object-contain"
                />
              </div>
            )}

            <div className="p-6 md:p-8">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-5">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-200">
                      {finding.section || "General"}
                    </span>

                    <SeverityBadge
                      severity={finding.severity || "Informational"}
                    />
                  </div>

                  <h3 className="text-4xl font-bold text-teal-300">
                    {finding.title || "Untitled Finding"}
                  </h3>
                </div>
              </div>

              <EditableFinding finding={finding} />

              {finding.observation && (
                <ReportBlock title="Observation" text={finding.observation} />
              )}

              {finding.implication && (
                <ReportBlock title="Implication" text={finding.implication} />
              )}

              {finding.recommendation && (
                <ReportBlock
                  title="Recommendation"
                  text={finding.recommendation}
                />
              )}

              {finding.comment && (
                <ReportBlock title="Additional Notes" text={finding.comment} />
              )}

              {finding.photos?.length > 1 && (
                <div className="mt-8">
                  <h4 className="mb-4 text-lg font-bold text-slate-200">
                    Additional Photos
                  </h4>

                  <div className="grid gap-4 md:grid-cols-2">
                    {finding.photos.slice(1).map((photo: any) => {
                      const imageSrc =
                        photo.signed_url ||
                        photo.public_url ||
                        photo.image_url ||
                        "";

                      if (!imageSrc) return null;

                      return (
                        <img
                          key={photo.id || imageSrc}
                          src={imageSrc}
                          alt="Finding Photo"
                          className="max-h-[350px] w-full rounded-2xl border border-slate-700 object-cover"
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function ReportBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-8">
      <h4 className="mb-3 text-2xl font-bold text-white">{title}</h4>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
        <p className="whitespace-pre-line leading-8 text-slate-200">{text}</p>
      </div>
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