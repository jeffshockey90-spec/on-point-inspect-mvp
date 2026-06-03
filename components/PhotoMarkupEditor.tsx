"use client";

import { useMemo, useState } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Line,
  Ellipse,
  Text,
} from "react-konva";
import useImage from "use-image";

type Tool = "select" | "arrow" | "circle" | "text";

type MarkupItem = {
  id: string;
  type: "arrow" | "circle" | "text";
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  radiusX?: number;
  radiusY?: number;
  text?: string;
  color: string;
};

type Props = {
  imageUrl: string;
  severity?: string | null;
  initialItems?: MarkupItem[];
  onSave: (items: MarkupItem[]) => void | Promise<void>;
  onCancel?: () => void;
};

const COLOR_OPTIONS = [
  "#65c832", // green
  "#ef4444", // red
  "#2563eb", // blue
  "#f97316", // orange
  "#facc15", // yellow
  "#a855f7", // purple
  "#ffffff", // white
  "#000000", // black
];

function getSeverityColor(severity?: string | null) {
  const clean = String(severity || "").toLowerCase();

  if (
    clean.includes("safety") ||
    clean.includes("hazard") ||
    clean.includes("major")
  ) {
    return "#ef4444";
  }

  if (
    clean.includes("maintenance") ||
    clean.includes("monitor") ||
    clean.includes("minor")
  ) {
    return "#2563eb";
  }

  if (
    clean.includes("information") ||
    clean.includes("info") ||
    clean.includes("client")
  ) {
    return "#22c55e";
  }

  return "#f97316";
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `markup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildArrowPolygon(item: MarkupItem) {
  const startX = item.x;
  const startY = item.y;
  const endX = item.endX ?? item.x + 180;
  const endY = item.endY ?? item.y;

  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));

  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;

  // Spectora-style arrow: thin tail that gradually widens toward a bold head.
  const tailWidth = Math.min(18, Math.max(6, 5 + length * 0.012));
  const neckWidth = Math.min(42, Math.max(18, 13 + length * 0.045));
  const headWidth = Math.min(112, Math.max(54, neckWidth * 2.45));
  const headLength = Math.min(108, Math.max(44, 34 + length * 0.15));

  const usableHeadLength = Math.min(headLength, length * 0.55);
  const shaftEndX = endX - ux * usableHeadLength;
  const shaftEndY = endY - uy * usableHeadLength;

  return [
    startX + px * tailWidth * 0.5,
    startY + py * tailWidth * 0.5,
    shaftEndX + px * neckWidth * 0.5,
    shaftEndY + py * neckWidth * 0.5,
    shaftEndX + px * headWidth * 0.5,
    shaftEndY + py * headWidth * 0.5,
    endX,
    endY,
    shaftEndX - px * headWidth * 0.5,
    shaftEndY - py * headWidth * 0.5,
    shaftEndX - px * neckWidth * 0.5,
    shaftEndY - py * neckWidth * 0.5,
    startX - px * tailWidth * 0.5,
    startY - py * tailWidth * 0.5,
  ];
}

function getCircleStrokeWidth(item: MarkupItem) {
  const averageRadius = ((item.radiusX || 70) + (item.radiusY || 70)) / 2;
  return Math.min(12, Math.max(6, averageRadius * 0.06));
}

export default function PhotoMarkupEditor({
  imageUrl,
  severity,
  initialItems = [],
  onSave,
  onCancel,
}: Props) {
  const [image] = useImage(imageUrl, "anonymous");
  const [items, setItems] = useState<MarkupItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeColor, setActiveColor] = useState(() => getSeverityColor(severity));

  useMemo(() => {
    if (items.length === 0) setActiveColor(getSeverityColor(severity));
  }, [severity, items.length]);

  const stageWidth = 900;
  const imageRatio = image ? image.height / image.width : 0.65;
  const stageHeight = Math.max(420, Math.min(700, stageWidth * imageRatio));

  function getPointerPosition(stage: any) {
    const pos = stage?.getPointerPosition();
    if (!pos) return null;

    return {
      x: Math.max(0, Math.min(stageWidth, pos.x)),
      y: Math.max(0, Math.min(stageHeight, pos.y)),
    };
  }

  function updateItem(id: string, patch: Partial<MarkupItem>) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function stopPageGesture(event: any) {
    event?.evt?.preventDefault?.();
    event?.evt?.stopPropagation?.();
  }

  function handleStagePointerDown(event: any) {
    stopPageGesture(event);

    const stage = event.target.getStage();
    const pos = getPointerPosition(stage);
    if (!pos) return;

    const clickedStage = event.target === stage;
    const clickedImage = event.target?.attrs?.listening === false;

    if (tool === "select") {
      if (clickedStage || clickedImage) setSelectedId(null);
      return;
    }

    if (tool === "text") {
      const text = window.prompt("Enter label text:", "Defect");
      if (!text) return;

      const id = makeId();
      setItems((prev) => [
        ...prev,
        {
          id,
          type: "text",
          x: pos.x,
          y: pos.y,
          text,
          color: activeColor,
        },
      ]);
      setSelectedId(id);
      setTool("select");
      return;
    }

    const id = makeId();

    if (tool === "arrow") {
      setItems((prev) => [
        ...prev,
        {
          id,
          type: "arrow",
          x: pos.x,
          y: pos.y,
          endX: pos.x + 1,
          endY: pos.y + 1,
          color: activeColor,
        },
      ]);
    }

    if (tool === "circle") {
      setItems((prev) => [
        ...prev,
        {
          id,
          type: "circle",
          x: pos.x,
          y: pos.y,
          radiusX: 1,
          radiusY: 1,
          color: activeColor,
        },
      ]);
    }

    setDraftId(id);
    setSelectedId(id);
  }

  function handleStagePointerMove(event: any) {
    stopPageGesture(event);
    if (!draftId) return;

    const stage = event.target.getStage();
    const pos = getPointerPosition(stage);
    if (!pos) return;

    const draft = items.find((item) => item.id === draftId);
    if (!draft) return;

    if (draft.type === "arrow") {
      updateItem(draftId, { endX: pos.x, endY: pos.y });
    }

    if (draft.type === "circle") {
      updateItem(draftId, {
        radiusX: Math.max(8, Math.abs(pos.x - draft.x)),
        radiusY: Math.max(8, Math.abs(pos.y - draft.y)),
      });
    }
  }

  function handleStagePointerUp(event?: any) {
    stopPageGesture(event);
    if (!draftId) return;

    setDraftId(null);
    setTool("select");
  }

  function deleteSelected() {
    if (!selectedId) return;
    setItems((prev) => prev.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(items);
    } finally {
      setSaving(false);
    }
  }

  const toolButtonClass = (toolName: Tool) =>
    `flex min-w-[72px] flex-col items-center justify-center rounded-xl px-3 py-2 text-xs font-black transition ${
      tool === toolName
        ? "border border-[#65c832] bg-black/60 text-[#65c832]"
        : "text-slate-100 hover:bg-white/10"
    }`;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between border-b border-white/10 bg-black px-5 py-4">
        <button
          type="button"
          onClick={onCancel}
          className="text-lg font-semibold text-white hover:text-slate-300"
        >
          Cancel
        </button>

        <h2 className="text-xl font-black text-white">Markup Photo</h2>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-lg font-black text-[#65c832] hover:text-[#7ee047] disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black touch-none select-none"
        style={{ touchAction: "none", overscrollBehavior: "contain" }}
        onTouchMove={(event) => event.preventDefault()}
      >
        <Stage
          width={stageWidth}
          height={stageHeight}
          onMouseDown={handleStagePointerDown}
          onMouseMove={handleStagePointerMove}
          onMouseUp={handleStagePointerUp}
          onTouchStart={handleStagePointerDown}
          onTouchMove={handleStagePointerMove}
          onTouchEnd={handleStagePointerUp}
          className={tool === "select" ? "cursor-default" : "cursor-crosshair"}
        >
          <Layer>
            {image && (
              <KonvaImage
                image={image}
                width={stageWidth}
                height={stageHeight}
                listening={false}
              />
            )}

            {items.map((item) => {
              const isSelected = selectedId === item.id;

              const common = {
                x: item.x,
                y: item.y,
                draggable: tool === "select" && !draftId,
                onClick: (event: any) => {
                  stopPageGesture(event);
                  setSelectedId(item.id);
                },
                onTap: (event: any) => {
                  stopPageGesture(event);
                  setSelectedId(item.id);
                },
                onDragStart: (event: any) => stopPageGesture(event),
                onDragMove: (event: any) => stopPageGesture(event),
                onDragEnd: (event: any) => {
                  stopPageGesture(event);
                  const nextX = event.target.x();
                  const nextY = event.target.y();

                  if (item.type === "arrow") {
                    const dx = (item.endX || item.x) - item.x;
                    const dy = (item.endY || item.y) - item.y;

                    updateItem(item.id, {
                      x: nextX,
                      y: nextY,
                      endX: nextX + dx,
                      endY: nextY + dy,
                    });
                    return;
                  }

                  updateItem(item.id, { x: nextX, y: nextY });
                },
              };

              if (item.type === "arrow") {
                const points = buildArrowPolygon(item).map((point, index) => {
                  return index % 2 === 0 ? point - item.x : point - item.y;
                });

                return (
                  <Line
                    key={item.id}
                    {...common}
                    points={points}
                    closed
                    fill={item.color}
                    stroke={isSelected ? "#ffffff" : item.color}
                    strokeWidth={isSelected ? 1.5 : 0}
                    opacity={0.97}
                    lineJoin="round"
                    lineCap="round"
                  />
                );
              }

              if (item.type === "circle") {
                return (
                  <Ellipse
                    key={item.id}
                    {...common}
                    radiusX={item.radiusX || 70}
                    radiusY={item.radiusY || 70}
                    stroke={item.color}
                    strokeWidth={getCircleStrokeWidth(item)}
                    fill="rgba(0,0,0,0)"
                    opacity={0.96}
                  />
                );
              }

              return (
                <Text
                  key={item.id}
                  {...common}
                  text={item.text || "Label"}
                  fontSize={34}
                  fontStyle="bold"
                  fill={item.color}
                  stroke="black"
                  strokeWidth={1}
                  opacity={0.96}
                />
              );
            })}
          </Layer>
        </Stage>

        <div className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3 rounded-2xl bg-black/30 p-2 backdrop-blur">
          {COLOR_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setActiveColor(option)}
              className={`h-12 w-12 rounded-xl border-2 transition ${
                activeColor === option ? "border-white scale-105" : "border-black/50"
              }`}
              style={{ backgroundColor: option }}
              title={option}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 bg-black px-3 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-around gap-2">
          <button
            type="button"
            onClick={() => setTool("select")}
            className={toolButtonClass("select")}
          >
            <span className="text-2xl">▣</span>
            <span>Select</span>
          </button>

          <button
            type="button"
            onClick={() => setTool("arrow")}
            className={toolButtonClass("arrow")}
          >
            <span className="text-3xl leading-none">↗</span>
            <span>Arrow</span>
          </button>

          <button
            type="button"
            onClick={() => setTool("circle")}
            className={toolButtonClass("circle")}
          >
            <span className="text-3xl leading-none">○</span>
            <span>Circle</span>
          </button>

          <button
            type="button"
            onClick={() => setTool("text")}
            className={toolButtonClass("text")}
          >
            <span className="text-3xl leading-none">T</span>
            <span>Text</span>
          </button>

          <button
            type="button"
            onClick={deleteSelected}
            disabled={!selectedId}
            className="flex min-w-[72px] flex-col items-center justify-center rounded-xl px-3 py-2 text-xs font-black text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-3xl leading-none">⌫</span>
            <span>Delete</span>
          </button>
        </div>

        <p className="mt-3 text-center text-sm text-slate-400">
          Tap a tool above, then tap and drag on the photo
        </p>
      </div>
    </div>
  );
}
