"use client";

import { Fragment, memo, useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Line,
  Ellipse,
  Circle as KonvaCircle,
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
  onSave: (items: MarkupItem[], flattenedDataUrl: string) => void | Promise<void>;
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

function cloneItems(items: MarkupItem[]) {
  return items.map((item) => ({ ...item }));
}

function itemsEqual(a: MarkupItem[], b: MarkupItem[]) {
  return JSON.stringify(a) === JSON.stringify(b);
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

function PhotoMarkupEditor({
  imageUrl,
  severity,
  initialItems = [],
  onSave,
  onCancel,
}: Props) {
  const stageRef = useRef<any>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const [image] = useImage(imageUrl, "anonymous");
  const [items, setItems] = useState<MarkupItem[]>(initialItems);
  const [history, setHistory] = useState<MarkupItem[][]>([
    cloneItems(initialItems),
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [keepToolActive, setKeepToolActive] = useState(true);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Save");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");
  const [activeColor, setActiveColor] = useState(() =>
    getSeverityColor(severity)
  );

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.removeProperty("touch-action");
      document.documentElement.style.removeProperty("touch-action");
    };
  }, []);

  useEffect(() => {
    if (items.length === 0) setActiveColor(getSeverityColor(severity));
  }, [severity, items.length]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (saving) return;

      const target = event.target as HTMLElement | null;
      const tagName = String(target?.tagName || "").toLowerCase();
      const isTyping =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        Boolean(target?.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        if (isTyping) return;
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        if (isTyping) return;
        event.preventDefault();
        redo();
        return;
      }

      if (
        !isTyping &&
        selectedId &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        deleteSelected();
      }

      if (!isTyping && event.key === "Escape") {
        setSelectedId(null);
        setDraftId(null);
        setTool("select");
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [saving, selectedId, historyIndex, history]);

  // Keep the canvas in the photo's original aspect ratio.
  // The previous fixed 900px width plus a capped 700px height stretched
  // portrait photos into a landscape-shaped flattened image.
  const maxStageWidth = 900;
  const maxStageHeight = 700;
  const sourceWidth = Math.max(1, image?.naturalWidth || image?.width || 900);
  const sourceHeight = Math.max(1, image?.naturalHeight || image?.height || 585);
  const sourceRatio = sourceHeight / sourceWidth;
  const maxRatio = maxStageHeight / maxStageWidth;

  const stageWidth =
    sourceRatio > maxRatio
      ? Math.max(1, Math.round(maxStageHeight / sourceRatio))
      : maxStageWidth;

  const stageHeight =
    sourceRatio > maxRatio
      ? maxStageHeight
      : Math.max(1, Math.round(maxStageWidth * sourceRatio));

  function showMessage(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);
  }

  function getPointerPosition(stage: any) {
    const pos = stage?.getPointerPosition();
    if (!pos) return null;

    return {
      x: Math.max(0, Math.min(stageWidth, pos.x)),
      y: Math.max(0, Math.min(stageHeight, pos.y)),
    };
  }

  function commitItems(nextItems: MarkupItem[], options?: { selectId?: string | null }) {
    const cleanItems = cloneItems(nextItems);
    const base = history.slice(0, historyIndex + 1);
    const latest = base[base.length - 1] || [];

    if (itemsEqual(latest, cleanItems)) {
      setItems(cleanItems);
    } else {
      const nextHistory = [...base, cloneItems(cleanItems)].slice(-75);
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
      setItems(cleanItems);
    }

    if (options && "selectId" in options) {
      setSelectedId(options.selectId ?? null);
    }
  }

  function updateItem(
    id: string,
    patch: Partial<MarkupItem>,
    options?: { commit?: boolean },
  ) {
    const nextItems = items.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );

    if (options?.commit) {
      commitItems(nextItems, { selectId: id });
      return;
    }

    setItems(nextItems);
  }

  function commitCurrentItems() {
    const currentSnapshot = history[historyIndex] || [];

    if (!itemsEqual(currentSnapshot, items)) {
      const nextHistory = [
        ...history.slice(0, historyIndex + 1),
        cloneItems(items),
      ].slice(-75);

      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    }
  }

  function undo() {
    if (saving || historyIndex <= 0) return;

    const nextIndex = historyIndex - 1;
    const nextItems = cloneItems(history[nextIndex] || []);

    setHistoryIndex(nextIndex);
    setItems(nextItems);
    setSelectedId((current) =>
      current && nextItems.some((item) => item.id === current) ? current : null,
    );
    setDraftId(null);
    showMessage("success", "Undid last markup change.");
  }

  function redo() {
    if (saving || historyIndex >= history.length - 1) return;

    const nextIndex = historyIndex + 1;
    const nextItems = cloneItems(history[nextIndex] || []);

    setHistoryIndex(nextIndex);
    setItems(nextItems);
    setSelectedId((current) =>
      current && nextItems.some((item) => item.id === current) ? current : null,
    );
    setDraftId(null);
    showMessage("success", "Restored markup change.");
  }

  function stopPageGesture(event: any) {
    event?.evt?.preventDefault?.();
    event?.evt?.stopPropagation?.();
  }

  function handleStagePointerDown(event: any) {
    if (saving) return;

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
      commitItems(
        [
          ...items,
          {
            id,
            type: "text",
            x: pos.x,
            y: pos.y,
            text,
            color: activeColor,
          },
        ],
        { selectId: id },
      );
      if (!keepToolActive) setTool("select");
      return;
    }

    const id = makeId();

    if (tool === "arrow") {
      setItems([
        ...items,
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
      setItems([
        ...items,
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
    if (saving) return;

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
    if (saving) return;

    stopPageGesture(event);
    if (!draftId) return;

    setDraftId(null);
    commitCurrentItems();
    if (!keepToolActive) setTool("select");
  }

  function deleteSelected() {
    if (!selectedId || saving) return;

    const nextItems = items.filter((item) => item.id !== selectedId);
    commitItems(nextItems, { selectId: null });
    showMessage("success", "Selected markup removed.");
  }

  function clearAll() {
    if (saving || items.length === 0) return;

    const confirmed = window.confirm("Remove all markups from this photo?");
    if (!confirmed) return;

    commitItems([], { selectId: null });
    setDraftId(null);
    showMessage("success", "All markups removed.");
  }

  function duplicateSelected() {
    if (!selectedId || saving) return;

    const selected = items.find((item) => item.id === selectedId);
    if (!selected) return;

    const id = makeId();
    const duplicate: MarkupItem = {
      ...selected,
      id,
      x: Math.min(stageWidth, selected.x + 28),
      y: Math.min(stageHeight, selected.y + 28),
      endX:
        selected.endX === undefined
          ? undefined
          : Math.min(stageWidth, selected.endX + 28),
      endY:
        selected.endY === undefined
          ? undefined
          : Math.min(stageHeight, selected.endY + 28),
    };

    commitItems([...items, duplicate], { selectId: id });
    showMessage("success", "Markup duplicated.");
  }

  function changeActiveColor(color: string) {
    setActiveColor(color);

    if (!selectedId || saving) return;

    const nextItems = items.map((item) =>
      item.id === selectedId ? { ...item, color } : item,
    );

    commitItems(nextItems, { selectId: selectedId });
  }

  function editSelectedText(itemId = selectedId) {
    if (!itemId || saving) return;

    const selected = items.find(
      (item) => item.id === itemId && item.type === "text",
    );
    if (!selected) return;

    const nextText = window.prompt("Edit label text:", selected.text || "Label");
    if (nextText === null) return;

    const cleanText = nextText.trim();
    if (!cleanText) {
      deleteSelected();
      return;
    }

    const nextItems = items.map((item) =>
      item.id === itemId ? { ...item, text: cleanText } : item,
    );

    commitItems(nextItems, { selectId: itemId });
    showMessage("success", "Text updated.");
  }

  async function save() {
    if (saving) return;

    const stage = stageRef.current;

    if (!stage) {
      showMessage("error", "The markup canvas is not ready yet.");
      return;
    }

    setSaving(true);
    setSaveLabel("Saving...");
    setMessage("");
    setMessageType("");

    try {
      // Export the visible photo and markup as one permanent image.
      const flattenedDataUrl = stage.toDataURL({
        pixelRatio: 2,
        mimeType: "image/jpeg",
        quality: 0.9,
      });

      await Promise.race([
        Promise.resolve(onSave(items, flattenedDataUrl)),
        new Promise((_, reject) => {
          saveTimeoutRef.current = window.setTimeout(() => {
            reject(
              new Error(
                "Saving took too long. Check your connection and try again.",
              ),
            );
          }, 30000);
        }),
      ]);

      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      setSaveLabel("Saved!");
      showMessage("success", "Photo markup saved.");
    } catch (error: any) {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      setSaveLabel("Failed");
      showMessage("error", error?.message || "Failed to save photo markup.");
      setSaving(false);
    }
  }

  const toolButtonClass = (toolName: Tool) =>
    `flex min-w-[72px] flex-col items-center justify-center rounded-xl px-3 py-2 text-xs font-black transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 [touch-action:manipulation] ${
      tool === toolName
        ? "border border-[#65c832] bg-black/60 text-[#65c832]"
        : "text-slate-100 hover:bg-white/10"
    }`;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between border-b border-white/10 bg-black px-5 py-4">
        <button
          type="button"
          onClick={() => {
            if (saveTimeoutRef.current) {
              window.clearTimeout(saveTimeoutRef.current);
              saveTimeoutRef.current = null;
            }
            setSaving(false);
            onCancel?.();
          }}
          className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-lg font-semibold text-white transition active:scale-[0.96] hover:text-slate-300 [touch-action:manipulation]"
        >
          Cancel
        </button>

        <h2 className="text-xl font-black text-white">Markup Photo</h2>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          aria-busy={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-lg font-black text-[#65c832] transition active:scale-[0.96] hover:text-[#7ee047] disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
        >
          {saving && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {saveLabel}
        </button>
      </div>

      {message && (
        <div
          className={`mx-4 mt-3 rounded-xl border px-4 py-3 text-sm font-bold ${
            messageType === "success"
              ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
              : "border-red-500 bg-red-950/40 text-red-300"
          }`}
        >
          {message}
        </div>
      )}

      <div
        className="relative flex min-h-0 flex-1 select-none items-center justify-center overflow-hidden bg-black touch-none"
        style={{ touchAction: "none", overscrollBehavior: "contain" }}
        onTouchMove={(event) => event.preventDefault()}
      >
        <Stage
          ref={stageRef}
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
                draggable: tool === "select" && !draftId && !saving,
                onClick: (event: any) => {
                  stopPageGesture(event);
                  if (!saving) setSelectedId(item.id);
                },
                onTap: (event: any) => {
                  stopPageGesture(event);
                  if (!saving) setSelectedId(item.id);
                },
                onDragStart: (event: any) => stopPageGesture(event),
                onDragMove: (event: any) => stopPageGesture(event),
                onDragEnd: (event: any) => {
                  stopPageGesture(event);
                  if (saving) return;

                  const nextX = event.target.x();
                  const nextY = event.target.y();

                  if (item.type === "arrow") {
                    const dx = (item.endX || item.x) - item.x;
                    const dy = (item.endY || item.y) - item.y;

                    updateItem(
                      item.id,
                      {
                        x: nextX,
                        y: nextY,
                        endX: nextX + dx,
                        endY: nextY + dy,
                      },
                      { commit: true },
                    );
                    return;
                  }

                  updateItem(
                    item.id,
                    { x: nextX, y: nextY },
                    { commit: true },
                  );
                },
              };

              if (item.type === "arrow") {
                const points = buildArrowPolygon(item).map((point, index) => {
                  return index % 2 === 0 ? point - item.x : point - item.y;
                });

                return (
                  <Fragment key={item.id}>
                    <Line
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

                    {isSelected && tool === "select" && !saving && (
                      <>
                        <KonvaCircle
                          x={item.x}
                          y={item.y}
                          radius={12}
                          fill="#ffffff"
                          stroke={item.color}
                          strokeWidth={4}
                          draggable
                          onDragStart={stopPageGesture}
                          onDragMove={stopPageGesture}
                          onDragEnd={(event: any) => {
                            stopPageGesture(event);
                            updateItem(
                              item.id,
                              {
                                x: event.target.x(),
                                y: event.target.y(),
                              },
                              { commit: true },
                            );
                          }}
                        />
                        <KonvaCircle
                          x={item.endX ?? item.x + 180}
                          y={item.endY ?? item.y}
                          radius={12}
                          fill="#ffffff"
                          stroke={item.color}
                          strokeWidth={4}
                          draggable
                          onDragStart={stopPageGesture}
                          onDragMove={stopPageGesture}
                          onDragEnd={(event: any) => {
                            stopPageGesture(event);
                            updateItem(
                              item.id,
                              {
                                endX: event.target.x(),
                                endY: event.target.y(),
                              },
                              { commit: true },
                            );
                          }}
                        />
                      </>
                    )}
                  </Fragment>
                );
              }

              if (item.type === "circle") {
                return (
                  <Fragment key={item.id}>
                    <Ellipse
                      {...common}
                      radiusX={item.radiusX || 70}
                      radiusY={item.radiusY || 70}
                      stroke={item.color}
                      strokeWidth={getCircleStrokeWidth(item)}
                      fill="rgba(0,0,0,0)"
                      opacity={0.96}
                      shadowColor={isSelected ? "#ffffff" : undefined}
                      shadowBlur={isSelected ? 8 : 0}
                    />

                    {isSelected && tool === "select" && !saving && (
                      <KonvaCircle
                        x={item.x + (item.radiusX || 70)}
                        y={item.y + (item.radiusY || 70)}
                        radius={13}
                        fill="#ffffff"
                        stroke={item.color}
                        strokeWidth={4}
                        draggable
                        onDragStart={stopPageGesture}
                        onDragMove={stopPageGesture}
                        onDragEnd={(event: any) => {
                          stopPageGesture(event);
                          updateItem(
                            item.id,
                            {
                              radiusX: Math.max(
                                12,
                                Math.abs(event.target.x() - item.x),
                              ),
                              radiusY: Math.max(
                                12,
                                Math.abs(event.target.y() - item.y),
                              ),
                            },
                            { commit: true },
                          );
                        }}
                      />
                    )}
                  </Fragment>
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
                  onDblClick={(event: any) => {
                    stopPageGesture(event);
                    setSelectedId(item.id);
                    editSelectedText(item.id);
                  }}
                  onDblTap={(event: any) => {
                    stopPageGesture(event);
                    setSelectedId(item.id);
                    editSelectedText(item.id);
                  }}
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
              onClick={() => changeActiveColor(option)}
              disabled={saving}
              className={`h-12 w-12 rounded-xl border-2 transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation] ${
                activeColor === option
                  ? "scale-105 border-white"
                  : "border-black/50"
              }`}
              style={{ backgroundColor: option }}
              title={option}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 bg-black px-3 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={saving || historyIndex <= 0}
            className="flex min-w-[72px] flex-col items-center justify-center rounded-xl px-3 py-2 text-xs font-black text-slate-100 transition active:scale-[0.96] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 [touch-action:manipulation]"
          >
            <span className="text-2xl leading-none">↶</span>
            <span>Undo</span>
          </button>

          <button
            type="button"
            onClick={redo}
            disabled={saving || historyIndex >= history.length - 1}
            className="flex min-w-[72px] flex-col items-center justify-center rounded-xl px-3 py-2 text-xs font-black text-slate-100 transition active:scale-[0.96] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 [touch-action:manipulation]"
          >
            <span className="text-2xl leading-none">↷</span>
            <span>Redo</span>
          </button>

          <button
            type="button"
            onClick={() => setTool("select")}
            disabled={saving}
            className={toolButtonClass("select")}
          >
            <span className="text-2xl">▣</span>
            <span>Select</span>
          </button>

          <button
            type="button"
            onClick={() => setTool("arrow")}
            disabled={saving}
            className={toolButtonClass("arrow")}
          >
            <span className="text-3xl leading-none">↗</span>
            <span>Arrow</span>
          </button>

          <button
            type="button"
            onClick={() => setTool("circle")}
            disabled={saving}
            className={toolButtonClass("circle")}
          >
            <span className="text-3xl leading-none">○</span>
            <span>Circle</span>
          </button>

          <button
            type="button"
            onClick={() => setTool("text")}
            disabled={saving}
            className={toolButtonClass("text")}
          >
            <span className="text-3xl leading-none">T</span>
            <span>Text</span>
          </button>

          <button
            type="button"
            onClick={deleteSelected}
            disabled={!selectedId || saving}
            className="flex min-w-[72px] flex-col items-center justify-center rounded-xl px-3 py-2 text-xs font-black text-slate-100 transition active:scale-[0.96] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 [touch-action:manipulation]"
          >
            <span className="text-3xl leading-none">⌫</span>
            <span>Delete</span>
          </button>

          <button
            type="button"
            onClick={duplicateSelected}
            disabled={!selectedId || saving}
            className="flex min-w-[72px] flex-col items-center justify-center rounded-xl px-3 py-2 text-xs font-black text-slate-100 transition active:scale-[0.96] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 [touch-action:manipulation]"
          >
            <span className="text-2xl leading-none">⧉</span>
            <span>Duplicate</span>
          </button>

          <button
            type="button"
            onClick={() => editSelectedText()}
            disabled={
              !selectedId ||
              saving ||
              items.find((item) => item.id === selectedId)?.type !== "text"
            }
            className="flex min-w-[72px] flex-col items-center justify-center rounded-xl px-3 py-2 text-xs font-black text-slate-100 transition active:scale-[0.96] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 [touch-action:manipulation]"
          >
            <span className="text-2xl leading-none">✎</span>
            <span>Edit Text</span>
          </button>

          <button
            type="button"
            onClick={clearAll}
            disabled={items.length === 0 || saving}
            className="flex min-w-[72px] flex-col items-center justify-center rounded-xl px-3 py-2 text-xs font-black text-red-300 transition active:scale-[0.96] hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 [touch-action:manipulation]"
          >
            <span className="text-2xl leading-none">✕</span>
            <span>Clear All</span>
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-300">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <input
              type="checkbox"
              checked={keepToolActive}
              onChange={(event) => setKeepToolActive(event.target.checked)}
              disabled={saving}
              className="h-4 w-4 accent-[#65c832]"
            />
            <span className="font-bold">Keep tool active for multiple markups</span>
          </label>

          <span className="text-center text-slate-400">
            Select a markup to move, resize, recolor, duplicate, edit, or delete it.
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(PhotoMarkupEditor);
