"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CommandCenterGenie from "./CommandCenterGenie";

type ToolTone =
  | "purple"
  | "emerald"
  | "yellow"
  | "blue"
  | "violet"
  | "red"
  | "cyan"
  | "green"
  | "slate";

type ToolItem = {
  title: string;
  helper?: string;
  badge?: string;
  tone?: ToolTone;
};

export type WorkspaceNotification = {
  id?: string;
  title: string;
  message?: string;
  urgency?: "critical" | "warning" | "info" | "success";
  badge?: string;
  /** Direct page target. Example: agreement-status, payment-invoice, publish-guard, report-findings. */
  targetAnchor?: string;
  /** Finding ids that still need action. The drawer removes ids marked reviewed locally. */
  findingIds?: Array<string | number>;
  /** Optional repair request id for direct repair request routing. */
  repairRequestId?: string | number;
};

type WorkspaceCategory =
  | "attention"
  | "ai"
  | "delivery"
  | "negotiation"
  | "activity"
  | "profile"
  | "all";

type EnrichedToolItem = ToolItem & {
  category: WorkspaceCategory;
  slug: string;
};

const toneClasses: Record<ToolTone, string> = {
  purple: "border-purple-400/50 bg-purple-500/10 text-[var(--fl-purple-text)]",
  emerald: "border-emerald-400/50 bg-emerald-500/10 text-[var(--fl-good-text)]",
  yellow: "border-yellow-400/50 bg-yellow-500/10 text-[var(--fl-warn-text)]",
  blue: "border-blue-400/50 bg-blue-500/10 text-[var(--fl-info-text)]",
  violet: "border-violet-400/50 bg-violet-500/10 text-[var(--fl-purple-text)]",
  red: "border-red-400/50 bg-red-500/10 text-[var(--fl-crit-text)]",
  cyan: "border-cyan-400/50 bg-cyan-500/10 text-[var(--fl-info-text)]",
  green: "border-green-400/50 bg-green-500/10 text-[var(--fl-good-text)]",
  slate: "border-[var(--fl-faint)] bg-slate-500/10 text-[var(--fl-text)]",
};

const urgencyStyles: Record<
  NonNullable<WorkspaceNotification["urgency"]>,
  {
    shell: string;
    icon: string;
    badge: string;
    label: string;
    glow: string;
    dot: string;
  }
> = {
  critical: {
    shell:
      "border-red-400/70 bg-gradient-to-br from-red-500/22 via-slate-950 to-[var(--fl-ground)] text-red-50",
    icon: "border-red-300/70 bg-red-500/25 text-[var(--fl-crit-text)]",
    badge: "border-red-300/70 bg-red-500/25 text-[var(--fl-crit-text)]",
    label: "Action needed",
    glow: "shadow-[0_0_40px_rgba(248,113,113,0.22)]",
    dot: "bg-red-400",
  },
  warning: {
    shell:
      "border-yellow-400/70 bg-gradient-to-br from-yellow-500/18 via-slate-950 to-[var(--fl-ground)] text-yellow-50",
    icon: "border-yellow-300/70 bg-yellow-500/25 text-[var(--fl-warn-text)]",
    badge: "border-yellow-300/70 bg-yellow-500/25 text-[var(--fl-warn-text)]",
    label: "Review",
    glow: "shadow-[0_0_40px_rgba(250,204,21,0.16)]",
    dot: "bg-yellow-300",
  },
  info: {
    shell:
      "border-cyan-400/70 bg-gradient-to-br from-cyan-500/18 via-slate-950 to-[var(--fl-ground)] text-cyan-50",
    icon: "border-cyan-300/70 bg-cyan-500/25 text-[var(--fl-info-text)]",
    badge: "border-cyan-300/70 bg-cyan-500/25 text-[var(--fl-info-text)]",
    label: "Update",
    glow: "shadow-[0_0_40px_rgba(34,211,238,0.16)]",
    dot: "bg-cyan-300",
  },
  success: {
    shell:
      "border-emerald-400/70 bg-gradient-to-br from-emerald-500/18 via-slate-950 to-[var(--fl-ground)] text-emerald-50",
    icon: "border-emerald-300/70 bg-emerald-500/25 text-[var(--fl-good-text)]",
    badge: "border-emerald-300/70 bg-emerald-500/25 text-[var(--fl-good-text)]",
    label: "Ready",
    glow: "shadow-[0_0_40px_rgba(52,211,153,0.16)]",
    dot: "bg-emerald-300",
  },
};

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value: unknown) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function getReviewedFindingStorageKey() {
  return "opi-command-center-reviewed-findings";
}

function readReviewedFindingIds() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(getReviewedFindingStorageKey());
    const values = raw ? JSON.parse(raw) : [];
    return new Set((Array.isArray(values) ? values : []).map((value) => String(value)));
  } catch {
    return new Set<string>();
  }
}

function writeReviewedFindingIds(ids: Set<string>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getReviewedFindingStorageKey(), JSON.stringify(Array.from(ids)));
  } catch {}
}

function getNotificationRemainingFindingIds(notification: WorkspaceNotification, reviewedIds: Set<string>) {
  return (notification.findingIds || [])
    .map((value) => String(value))
    .filter((value) => value && !reviewedIds.has(value));
}

function getHashTargetForNotification(notification: WorkspaceNotification, reviewedIds = new Set<string>()) {
  const remainingFindingIds = getNotificationRemainingFindingIds(notification, reviewedIds);

  if (remainingFindingIds.length > 0) return `finding-${remainingFindingIds[0]}`;
  if (notification.repairRequestId) return `repair-request-${notification.repairRequestId}`;
  if (notification.targetAnchor) return notification.targetAnchor;

  const text = normalizeText(`${notification.id || ""} ${notification.title} ${notification.message || ""}`);

  if (text.includes("agreement") || text.includes("signature")) return "agreement-status";
  if (text.includes("payment") || text.includes("invoice") || text.includes("due")) return "payment-invoice";
  if (text.includes("repair") || text.includes("seller") || text.includes("addendum")) return "repair-request-history";
  if (text.includes("publish") || text.includes("guard") || text.includes("blocked")) return "publish-guard";
  if (text.includes("safety") || text.includes("defect") || text.includes("major") || text.includes("finding")) return "report-findings";
  if (text.includes("view") || text.includes("engagement") || text.includes("client")) return "report-engagement";

  return "";
}

function flashElement(element: HTMLElement) {
  const previousOutline = element.style.outline;
  const previousOutlineOffset = element.style.outlineOffset;
  const previousBoxShadow = element.style.boxShadow;

  element.style.outline = "3px solid rgba(34, 211, 238, 0.95)";
  element.style.outlineOffset = "6px";
  element.style.boxShadow = "0 0 0 9999px rgba(2, 6, 23, 0.16), 0 0 34px rgba(34, 211, 238, 0.55)";

  window.setTimeout(() => {
    element.style.outline = previousOutline;
    element.style.outlineOffset = previousOutlineOffset;
    element.style.boxShadow = previousBoxShadow;
  }, 2200);
}




function getNotificationPriority(notification: WorkspaceNotification) {
  const text = normalizeText(`${notification.id || ""} ${notification.title} ${notification.message || ""} ${notification.badge || ""}`);

  if (text.includes("publish") || text.includes("guard") || text.includes("blocked")) return 10;
  if (text.includes("agreement") || text.includes("signature") || text.includes("signed")) return 20;
  if (text.includes("payment") || text.includes("invoice") || text.includes("due") || text.includes("balance")) return 30;
  if (text.includes("safety") || text.includes("major") || text.includes("defect") || text.includes("finding")) return 40;
  if (text.includes("ai") || text.includes("review") || text.includes("contradiction")) return 50;
  if (text.includes("repair") || text.includes("seller") || text.includes("addendum") || text.includes("response")) return 60;
  if (text.includes("view") || text.includes("engagement") || text.includes("client")) return 70;

  return 90;
}

function getNextTaskCopy(notification: WorkspaceNotification | undefined) {
  if (!notification) {
    return {
      eyebrow: "Next Task",
      title: "No action needed",
      helper: "This report does not have any active Command Center alerts right now.",
      action: "All Clear",
    };
  }

  const text = normalizeText(`${notification.id || ""} ${notification.title} ${notification.message || ""} ${notification.badge || ""}`);

  if (text.includes("agreement") || text.includes("signature") || text.includes("signed")) {
    return {
      eyebrow: "Next Task",
      title: "Agreement signature missing",
      helper: notification.message || "Send or review the client agreement before delivery.",
      action: "Fix Agreement",
    };
  }

  if (text.includes("payment") || text.includes("invoice") || text.includes("due") || text.includes("balance")) {
    return {
      eyebrow: "Next Task",
      title: "Payment needs attention",
      helper: notification.message || "Review the invoice or payment status before delivery.",
      action: "Fix Payment",
    };
  }

  if (text.includes("publish") || text.includes("guard") || text.includes("blocked")) {
    return {
      eyebrow: "Next Task",
      title: "Publish guard needs review",
      helper: notification.message || "Review the blockers before publishing this report.",
      action: "Fix Publish Blocker",
    };
  }

  if (text.includes("safety") || text.includes("major") || text.includes("defect") || text.includes("finding")) {
    const count = notification.findingIds?.length || Number(notification.badge) || 0;
    return {
      eyebrow: "Next Task",
      title: count > 1 ? `${count} safety items need review` : "Safety item needs review",
      helper: notification.message || "Jump to the next unresolved safety or major finding.",
      action: "Go to Finding",
    };
  }

  if (text.includes("repair") || text.includes("seller") || text.includes("addendum") || text.includes("response")) {
    return {
      eyebrow: "Next Task",
      title: "Repair request update ready",
      helper: notification.message || "Review the seller response or addendum.",
      action: "Review Repair Request",
    };
  }

  if (text.includes("view") || text.includes("engagement") || text.includes("client")) {
    return {
      eyebrow: "Next Task",
      title: "Client activity updated",
      helper: notification.message || "Review the latest report engagement activity.",
      action: "View Activity",
    };
  }

  return {
    eyebrow: "Next Task",
    title: notification.title,
    helper: notification.message || "Open the matching Command Center tool.",
    action: "Fix Now",
  };
}

function getCategoryForTool(item: ToolItem): WorkspaceCategory {
  const text = normalizeText(`${item.title} ${item.helper || ""}`);

  if (
    text.includes("publish") ||
    text.includes("agreement") ||
    text.includes("payment") ||
    text.includes("delivery") ||
    text.includes("email") ||
    text.includes("client portal")
  ) {
    return "delivery";
  }

  if (text.includes("repair request") || text.includes("negotiation") || text.includes("seller")) {
    return "negotiation";
  }

  if (
    text.includes("engagement") ||
    text.includes("timeline") ||
    text.includes("activity") ||
    text.includes("view") ||
    text.includes("opened")
  ) {
    return "activity";
  }

  if (text.includes("sample") || text.includes("public profile")) {
    return "profile";
  }

  if (
    text.includes("ai") ||
    text.includes("house") ||
    text.includes("finding") ||
    text.includes("intelligence") ||
    text.includes("copilot") ||
    text.includes("equipment")
  ) {
    return "ai";
  }

  return "all";
}

function getBestTargetTitle(targets: string[], items: ToolItem[]) {
  for (const target of targets) {
    const cleanTarget = normalizeText(target);

    const exact = items.find((item) => normalizeText(item.title) === cleanTarget);
    if (exact) return exact.title;

    const partial = items.find((item) => {
      const itemText = normalizeText(`${item.title} ${item.helper || ""}`);
      return itemText.includes(cleanTarget) || cleanTarget.includes(normalizeText(item.title));
    });

    if (partial) return partial.title;
  }

  return "";
}

function getActionTitleForNotification(notification: WorkspaceNotification, items: ToolItem[]) {
  const text = normalizeText(`${notification.id || ""} ${notification.title} ${notification.message || ""} ${notification.badge || ""}`);

  // Route the common high-priority alerts first so clicks never fall through to the wrong panel.
  const rules: Array<[string[], string[]]> = [
    [
      ["agreement", "signature", "signed", "signing"],
      [
        "Agreement Status",
        "Agreement Status Panel",
        "Send Agreement",
        "Agreement Selection",
        "Agreement Selector",
        "Agreements",
      ],
    ],
    [
      ["payment", "invoice", "paid", "due", "balance"],
      [
        "Payment / Invoice",
        "Payment Invoice",
        "Invoice",
        "Payment",
        "Payment Status",
        "Report Delivery Guard",
      ],
    ],
    [
      ["repair", "response", "seller", "addendum", "negotiation"],
      [
        "Repair Request History",
        "Repair Requests",
        "Repair Request",
        "Seller Response",
        "Addendum",
      ],
    ],
    [
      ["publish", "delivery", "guard", "blocked"],
      [
        "Final Publish Guard",
        "AI Publish Guard",
        "Publish Guard",
        "Report Delivery Guard",
      ],
    ],
    [
      ["safety", "defect", "contradiction", "ai review"],
      [
        "AI Report Review",
        "Live AI Inspector Assistant",
        "AI Inspector",
        "Inspection Copilot",
      ],
    ],
    [
      ["view", "opened", "read", "engagement", "client"],
      [
        "Report Engagement",
        "Client Views",
        "Live Inspection Timeline",
        "Activity",
      ],
    ],
    [["sample", "public", "profile"], ["Sample Report", "Public Profile"]],
    [["house", "memory", "property", "intelligence"], ["House Intelligence", "House Memory"]],
  ];

  for (const [keywords, targets] of rules) {
    if (!keywords.some((keyword) => text.includes(keyword))) continue;

    const targetTitle = getBestTargetTitle(targets, items);
    if (targetTitle) return targetTitle;
  }

  const direct = items.find((item) => {
    const itemTitle = normalizeText(item.title);
    const itemText = normalizeText(`${item.title} ${item.helper || ""} ${item.badge || ""}`);
    return itemTitle && (text.includes(itemTitle) || itemText.includes(text));
  });

  if (direct) return direct.title;

  return items[0]?.title || "";
}


type ReportJumpTarget = {
  anchors: string[];
  textMatches: string[];
  fallbackTool?: string;
};

function getReportJumpTargetForNotification(notification: WorkspaceNotification): ReportJumpTarget | null {
  const text = normalizeText(
    `${notification.id || ""} ${notification.title} ${notification.message || ""} ${notification.badge || ""}`
  );

  if (
    text.includes("safety") ||
    text.includes("defect") ||
    text.includes("major") ||
    text.includes("finding") ||
    text.includes("findings")
  ) {
    return {
      anchors: [
        "report-findings",
        "findings",
        "inspection-findings",
        "editable-findings",
        "report-editor",
        "defects",
        "safety-findings",
        "findings-editor",
      ],
      textMatches: [
        "Report Findings",
        "Findings",
        "Defects",
        "Safety",
        "Recommended Repair",
        "Report Editor",
      ],
      fallbackTool: "AI Report Review",
    };
  }

  return null;
}

function findReportTargetElement(target: ReportJumpTarget) {
  for (const anchor of target.anchors) {
    const byId = document.getElementById(anchor);
    if (byId) return byId as HTMLElement;

    const byName = document.querySelector(`[name="${CSS.escape(anchor)}"]`);
    if (byName) return byName as HTMLElement;

    const byDataTarget = document.querySelector(
      `[data-report-target="${CSS.escape(anchor)}"], [data-command-target="${CSS.escape(anchor)}"], [data-section="${CSS.escape(anchor)}"]`
    );
    if (byDataTarget) return byDataTarget as HTMLElement;
  }

  const candidates = Array.from(
    document.querySelectorAll("main h1, main h2, main h3, main summary, main section, main article")
  ) as HTMLElement[];

  const matched = candidates.find((element) => {
    const text = normalizeText(element.textContent || "");
    return target.textMatches.some((match) => {
      const cleanMatch = normalizeText(match);
      return text === cleanMatch || text.includes(cleanMatch);
    });
  });

  return matched || null;
}

function flashReportTarget(element: HTMLElement) {
  const previousOutline = element.style.outline;
  const previousOutlineOffset = element.style.outlineOffset;
  const previousBoxShadow = element.style.boxShadow;

  element.style.outline = "3px solid rgba(34, 211, 238, 0.95)";
  element.style.outlineOffset = "6px";
  element.style.boxShadow = "0 0 0 9999px rgba(2, 6, 23, 0.22), 0 0 34px rgba(34, 211, 238, 0.55)";

  window.setTimeout(() => {
    element.style.outline = previousOutline;
    element.style.outlineOffset = previousOutlineOffset;
    element.style.boxShadow = previousBoxShadow;
  }, 2200);
}

function categoryLabel(category: WorkspaceCategory) {
  switch (category) {
    case "attention":
      return "Needs Attention";
    case "ai":
      return "AI Review";
    case "delivery":
      return "Delivery";
    case "negotiation":
      return "Negotiation";
    case "activity":
      return "Activity";
    case "profile":
      return "Profile";
    default:
      return "All";
  }
}

function categoryIcon(category: WorkspaceCategory) {
  switch (category) {
    case "attention":
      return "!";
    case "ai":
      return "✦";
    case "delivery":
      return "✓";
    case "negotiation":
      return "↔";
    case "activity":
      return "↻";
    case "profile":
      return "◉";
    default:
      return "•";
  }
}

function getStatusTileStatus(title: string, notifications: WorkspaceNotification[]) {
  const cleanTitle = normalizeText(title);
  const matched = notifications.find((item) => {
    const text = normalizeText(`${item.title} ${item.message || ""} ${item.badge || ""}`);
    if (cleanTitle.includes("payment")) return text.includes("payment") || text.includes("due");
    if (cleanTitle.includes("agreement")) return text.includes("agreement") || text.includes("signature");
    if (cleanTitle.includes("publish")) return text.includes("publish") || text.includes("guard");
    if (cleanTitle.includes("ai")) return text.includes("ai") || text.includes("safety") || text.includes("defect");
    if (cleanTitle.includes("repair")) return text.includes("repair") || text.includes("seller");
    if (cleanTitle.includes("client")) return text.includes("view") || text.includes("engagement") || text.includes("client");
    return false;
  });

  if (!matched) return { label: "Ready", urgency: "success" as const, badge: "✓" };
  return {
    label: urgencyStyles[matched.urgency || "info"].label,
    urgency: matched.urgency || "info",
    badge: matched.badge || "!",
  };
}

function getBestToolMatch(keywords: string[], items: EnrichedToolItem[]) {
  return items.find((item) => {
    const text = normalizeText(`${item.title} ${item.helper || ""}`);
    return keywords.some((keyword) => text.includes(keyword));
  });
}

function isPublishGuardNotification(notification: WorkspaceNotification) {
  // The most reliable signal: the notification points at the publish-guard anchor.
  if (normalizeText(notification.targetAnchor || "") === "publish-guard") return true;

  // Otherwise match on id/title/badge ONLY — never the message, which routinely
  // says "...should be reviewed before publishing" on unrelated alerts
  // (disclaimers, safety findings, etc.). That was hijacking every alert to the
  // publish blocker instead of jumping to its real target.
  const text = normalizeText(
    `${notification.id || ""} ${notification.title || ""} ${notification.badge || ""}`,
  );

  return (
    text.includes("publish guard") ||
    text.includes("publish blocker") ||
    text.includes("blocked") ||
    (text.includes("publish") && text.includes("guard"))
  );
}

function toolIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("publish") || t.includes("guard")) return "🛡️";
  if (t.includes("sample")) return "📄";
  if (t.includes("engagement") || t.includes("view")) return "👁️";
  if (t.includes("review")) return "🔍";
  if (t.includes("assistant") || t.includes("live")) return "🤖";
  if (t.includes("connected") || t.includes("related")) return "🔗";
  if (t.includes("disclaimer")) return "📝";
  if (t.includes("house") || t.includes("intelligence")) return "🏠";
  if (t.includes("timeline") || t.includes("activity")) return "🕑";
  if (t.includes("repair")) return "🧾";
  if (t.includes("payment") || t.includes("invoice")) return "💳";
  if (t.includes("agreement")) return "✍️";
  return "🛠️";
}

function ToolRow({
  item,
  accent,
  onOpen,
}: {
  item: EnrichedToolItem;
  accent: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-3 text-left transition active:scale-[0.99] hover:border-[var(--fl-line)]"
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg"
        style={{ background: `${accent}22`, border: `1px solid ${accent}55` }}
      >
        {toolIcon(item.title)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[var(--fl-text)]">{item.title}</span>
        {item.helper ? (
          <span className="block text-xs text-[var(--fl-muted)]">{item.helper}</span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {item.badge ? (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: `${accent}1f`,
              border: `1px solid ${accent}55`,
              color: accent,
            }}
          >
            {item.badge}
          </span>
        ) : null}
        <span className="text-lg text-[var(--fl-faint)]">›</span>
      </span>
    </button>
  );
}

export default function InspectorToolsDrawer({
  badge = "Ready",
  items = [],
  notifications = [],
  children,
}: {
  badge?: string;
  items?: ToolItem[];
  notifications?: WorkspaceNotification[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Floating Command Center button so the inspector doesn't have to scroll to the
  // bottom of the report to open it. Defaults just above the search FAB and is
  // draggable — its position is remembered per device.
  const [fabPos, setFabPos] = useState<{ left: number; top: number } | null>(null);
  const fabDragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("opi-cc-fab-pos");
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p.left === "number" && typeof p.top === "number") setFabPos(p);
      }
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  function onFabPointerDown(e: React.PointerEvent) {
    fabDragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* not all pointers support capture */
    }
  }

  function onFabPointerMove(e: React.PointerEvent) {
    const d = fabDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 6) return; // ignore tiny jitter (it's a tap)
    d.moved = true;
    const w = 60;
    const h = 46;
    const left = Math.min(Math.max(8, e.clientX - w / 2), window.innerWidth - w - 8);
    const top = Math.min(Math.max(8, e.clientY - h / 2), window.innerHeight - h - 8);
    setFabPos({ left, top });
  }

  function onFabPointerUp() {
    const d = fabDragRef.current;
    fabDragRef.current = null;
    if (!d) return;
    if (d.moved) {
      setFabPos((cur) => {
        if (cur) {
          try {
            localStorage.setItem("opi-cc-fab-pos", JSON.stringify(cur));
          } catch {
            /* best-effort */
          }
        }
        return cur;
      });
    } else {
      openWorkspace(); // a tap (no drag) opens the Command Center
    }
  }

  // `closing` drives the CSS genie-funnel exit (the fallback). When a pre-captured
  // snapshot is ready, the WebGL genie (`genie` state) takes over the close instead
  // and warps the panel image down into the dock.
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const captureRef = useRef<HTMLCanvasElement | null>(null);
  const [genie, setGenie] = useState<{
    source: HTMLCanvasElement;
    rect: { left: number; top: number; right: number; bottom: number };
    direction: "open" | "close";
  } | null>(null);
  // After a WebGL open-genie plays, reveal the real panel with no extra CSS anim.
  const [webglOpened, setWebglOpened] = useState(false);
  // One-time, invisible pre-render of the panel so the VERY FIRST open already has
  // a snapshot to genie from (otherwise the first open falls back to the CSS funnel
  // because no capture exists yet). Mounts the real aside under an opacity-0 /
  // pointer-events-none container; html-to-image reads the aside's OWN styles (it's
  // opaque), so the capture is fully rendered while the user sees nothing.
  const [warming, setWarming] = useState(false);
  const warmedRef = useRef(false);

  function webglAvailable() {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
    } catch {
      return false;
    }
  }
  const webglOk = useMemo(() => webglAvailable(), []);

  // Use the WebGL genie only where the panel is ~full-width (phones/tablets) --
  // there it's flawless. On desktop the panel is centered with wide margins; the
  // WebGL warp read as a brief "contents on the right" flash on some displays, so
  // desktop falls back to the CSS funnel, which animates the REAL centered panel
  // directly (no snapshot/warp) and therefore can never show a content offset.
  function canWebglGenie() {
    return webglOk && typeof window !== "undefined" && window.innerWidth < 1024;
  }

  function finishClose() {
    setOpen(false);
    setClosing(false);
    setGenie(null);
    setWebglOpened(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    // Keep captureRef so the NEXT open can genie-in from the last snapshot.
  }

  // CommandCenterGenie's onDone: an open-genie reveals the panel; a close-genie
  // unmounts the drawer.
  function onGenieDone() {
    if (genie?.direction === "open") {
      setGenie(null);
      setWebglOpened(true);
      return;
    }
    finishClose();
  }

  function requestClose() {
    if (closeTimerRef.current || genie) return;
    const el = asideRef.current;
    const cap = captureRef.current;
    if (cap && el && canWebglGenie()) {
      const r = el.getBoundingClientRect();
      setGenie({ source: cap, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, direction: "close" });
      return; // plays, then onGenieDone -> finishClose
    }
    // Fallback: CSS genie funnel.
    setClosing(true);
    closeTimerRef.current = setTimeout(finishClose, 380);
  }

  // Open-genie: if a snapshot from the last time is ready, unfurl it up out of the
  // dock. useLayoutEffect runs before paint, so the real panel never flashes.
  useLayoutEffect(() => {
    if (!open || genie) return;
    const cap = captureRef.current;
    const el = asideRef.current;
    if (cap && el && canWebglGenie()) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) {
        setWebglOpened(false);
        setGenie({ source: cap, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, direction: "open" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pre-capture the panel a moment after it opens, so the close genie (and the
  // next open genie) has an image ready with no capture-freeze. Best-effort.
  useEffect(() => {
    if (!open) return;
    setClosing(false);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const el = asideRef.current;
        if (!el) return;
        const { toCanvas } = await import("html-to-image");
        const snap = await toCanvas(el, {
          pixelRatio: Math.min(2, window.devicePixelRatio || 1),
          backgroundColor: "var(--fl-surface-2)",
        });
        if (!cancelled) captureRef.current = snap;
      } catch {
        /* capture failed -> close falls back to CSS funnel */
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open]);

  // Once, after the page settles, invisibly pre-render + capture the panel so the
  // first open can genie. Skipped when WebGL/genie isn't in play or motion is reduced.
  useEffect(() => {
    if (warmedRef.current || !canWebglGenie()) return; // desktop uses the CSS funnel -- no snapshot needed
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let id: number | ReturnType<typeof setTimeout>;
    const kick = () => {
      if (warmedRef.current || captureRef.current) return;
      setWarming(true);
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) id = ric(kick, { timeout: 3000 });
    else id = setTimeout(kick, 1500);
    return () => {
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (ric && cic) cic(id as number);
      else clearTimeout(id as ReturnType<typeof setTimeout>);
    };
  }, [webglOk]);

  // Run the warm-up capture: the aside is mounted (invisible) — let it paint, snap it,
  // stash the canvas, then unmount. Best-effort; failure just means the first open
  // uses the CSS funnel as before.
  useEffect(() => {
    if (!warming) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const el = asideRef.current;
        if (el) {
          const { toCanvas } = await import("html-to-image");
          const snap = await toCanvas(el, {
            pixelRatio: Math.min(2, window.devicePixelRatio || 1),
            backgroundColor: "var(--fl-surface-2)",
          });
          if (!cancelled && !captureRef.current) captureRef.current = snap;
        }
      } catch {
        /* warm-up capture failed -> first open falls back to CSS funnel */
      } finally {
        warmedRef.current = true;
        if (!cancelled) setWarming(false);
      }
    }, 90);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [warming]);

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<WorkspaceCategory>("all");
  const [activeTool, setActiveTool] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [reviewedFindingIds, setReviewedFindingIds] = useState<Set<string>>(() => new Set<string>());

  useEffect(() => {
    setReviewedFindingIds(readReviewedFindingIds());

    function handleReviewedFinding(event: Event) {
      const detail = (event as CustomEvent)?.detail || {};
      const findingId = String(detail.findingId || "");
      if (!findingId) return;

      setReviewedFindingIds((prev) => {
        const next = new Set<string>(prev);
        next.add(findingId);
        writeReviewedFindingIds(next);
        return next;
      });
    }

    function syncReviewedFindings() {
      setReviewedFindingIds(readReviewedFindingIds());
    }

    window.addEventListener("opi:finding-reviewed", handleReviewedFinding as EventListener);
    window.addEventListener("opi:reviewed-findings-changed", syncReviewedFindings);
    window.addEventListener("storage", syncReviewedFindings);

    return () => {
      window.removeEventListener("opi:finding-reviewed", handleReviewedFinding as EventListener);
      window.removeEventListener("opi:reviewed-findings-changed", syncReviewedFindings);
      window.removeEventListener("storage", syncReviewedFindings);
    };
  }, []);

  const normalizedNotifications = useMemo(() => {
    return notifications
      .map((item) => {
        const remainingFindingIds = getNotificationRemainingFindingIds(item, reviewedFindingIds);

        if (item.findingIds?.length) {
          if (remainingFindingIds.length === 0) return null;

          return {
            ...item,
            badge: String(remainingFindingIds.length),
            findingIds: remainingFindingIds,
            message: `${remainingFindingIds.length} safety/major item${remainingFindingIds.length === 1 ? "" : "s"} still need review.`,
          };
        }

        return item;
      })
      .filter(Boolean) as WorkspaceNotification[];
  }, [notifications, reviewedFindingIds]);

  const attentionNotifications = useMemo(
    () =>
      normalizedNotifications
        .filter((item) => ["critical", "warning", "info"].includes(item.urgency || "info"))
        .sort((a, b) => getNotificationPriority(a) - getNotificationPriority(b)),
    [normalizedNotifications]
  );

  const nextAttentionNotification = attentionNotifications[0];
  const nextTaskCopy = getNextTaskCopy(nextAttentionNotification);

  const enrichedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        category: getCategoryForTool(item),
        slug: slugify(item.title),
      })),
    [items]
  );

  // Redesigned nav: pinned favorites + tools grouped into clear sections.
  const pinnedTools = useMemo(() => {
    const wanted = [
      "Final Publish Guard",
      "Sample Report",
      "AI Report Review",
      "Live AI Inspector Assistant",
    ];
    return wanted
      .map((t) => enrichedItems.find((i) => i.title === t))
      .filter(Boolean) as EnrichedToolItem[];
  }, [enrichedItems]);

  const toolGroups = useMemo(() => {
    const groups: { label: string; items: EnrichedToolItem[] }[] = [
      { label: "Publish & Deliver", items: [] },
      { label: "AI Tools", items: [] },
      { label: "Business", items: [] },
    ];
    enrichedItems.forEach((item) => {
      const t = item.title.toLowerCase();
      if (
        t.includes("publish") ||
        t.includes("sample") ||
        t.includes("engagement") ||
        t.includes("deliver")
      ) {
        groups[0].items.push(item);
      } else if (
        t.includes("repair") ||
        t.includes("payment") ||
        t.includes("agreement") ||
        t.includes("invoice") ||
        t.includes("history")
      ) {
        groups[2].items.push(item);
      } else {
        groups[1].items.push(item);
      }
    });
    return groups.filter((g) => g.items.length > 0);
  }, [enrichedItems]);

  const toneHex = (tone?: string) =>
    (({
      red: "#fb7185",
      rose: "#fb7185",
      purple: "#a78bfa",
      violet: "#a78bfa",
      yellow: "#fbbf24",
      amber: "#fbbf24",
      emerald: "#34d399",
      green: "#34d399",
      blue: "#38bdf8",
      sky: "#38bdf8",
      cyan: "#14c8d2",
      teal: "#14c8d2",
    }) as Record<string, string>)[tone || ""] || "#14c8d2";

  const statusTiles = useMemo(
    () =>
      [
        { title: "Payment", keywords: ["payment", "invoice", "due"] },
        { title: "Agreements", keywords: ["agreement", "signature"] },
        { title: "Publish Guard", keywords: ["publish", "guard", "delivery"] },
        { title: "AI Review", keywords: ["ai", "review", "copilot", "inspector"] },
        { title: "Repair Requests", keywords: ["repair request", "seller", "negotiation"] },
        { title: "Client Views", keywords: ["engagement", "view", "opened", "activity"] },
      ].map((tile) => ({
        ...tile,
        ...getStatusTileStatus(tile.title, attentionNotifications),
        tool: getBestToolMatch(tile.keywords, enrichedItems),
      })),
    [attentionNotifications, enrichedItems]
  );

  const quickActions = useMemo(() => {
    const preferred = [
      ["Publish", ["publish", "guard"]],
      ["Repair Request", ["repair request"]],
      ["Email Report", ["email", "delivery", "send"]],
      ["Executive Summary", ["executive", "summary", "realtor summary"]],
      ["AI Capture", ["ai capture", "capture"]],
      ["Field Tool", ["field tool", "finding"]],
      ["Equipment Analyzer", ["equipment", "analyzer"]],
      ["Client Portal", ["client portal"]],
    ] as Array<[string, string[]]>;

    const matches: EnrichedToolItem[] = [];

    preferred.forEach(([, keywords]) => {
      const match = getBestToolMatch(keywords, enrichedItems);
      if (match && !matches.some((item) => item.title === match.title)) matches.push(match);
    });

    enrichedItems.forEach((item) => {
      if (matches.length >= 8) return;
      if (!matches.some((match) => match.title === item.title)) matches.push(item);
    });

    return matches.slice(0, 8);
  }, [enrichedItems]);

  const activityItems = useMemo(() => {
    return attentionNotifications
      .filter((item) => {
        const text = normalizeText(
          `${item.id || ""} ${item.title} ${item.message || ""}`
        );

        return (
          text.includes("view") ||
          text.includes("opened") ||
          text.includes("client") ||
          text.includes("realtor") ||
          text.includes("signed") ||
          text.includes("agreement") ||
          text.includes("payment") ||
          text.includes("invoice") ||
          text.includes("repair response") ||
          text.includes("seller") ||
          text.includes("published") ||
          text.includes("email")
        );
      })
      .map((item) => ({
        id: item.id || item.title,
        title: item.title,
        helper: item.message || "Inspection activity updated.",
        urgency: item.urgency || "info",
        badge: item.badge || urgencyStyles[item.urgency || "info"].label,
        notification: item,
      }))
      .slice(0, 10);
  }, [attentionNotifications]);

  const categories = useMemo(() => {
    const set = new Set<WorkspaceCategory>(["all"]);
    if (attentionNotifications.length) set.add("attention");
    enrichedItems.forEach((item) => set.add(item.category));
    return Array.from(set);
  }, [attentionNotifications.length, enrichedItems]);

  const filteredItems = useMemo(() => {
    const cleanQuery = normalizeText(query);

    return enrichedItems.filter((item) => {
      const categoryMatch =
        activeCategory === "all" ||
        activeCategory === "attention" ||
        item.category === activeCategory;

      const searchMatch =
        !cleanQuery ||
        normalizeText(`${item.title} ${item.helper || ""} ${item.badge || ""}`).includes(cleanQuery);

      return categoryMatch && searchMatch;
    });
  }, [activeCategory, enrichedItems, query]);

  const needsAttention = useMemo(() => {
    const text = `${badge} ${items.map((item) => item.badge || "").join(" ")} ${attentionNotifications
      .map((item) => `${item.title} ${item.message || ""}`)
      .join(" ")}`.toLowerCase();

    return (
      attentionNotifications.length > 0 ||
      text.includes("needs") ||
      text.includes("defect") ||
      text.includes("safety") ||
      text.includes("blocked") ||
      text.includes("review before publish") ||
      text.includes("missing") ||
      text.includes("due")
    );
  }, [badge, items, attentionNotifications]);

  useEffect(() => {
    // Never lock the page body from the Command Center drawer.
    // The drawer has its own internal scroll containers, and body locking was
    // preventing desktop mouse-wheel scrolling on the report page after the
    // drawer/reorder updates.
    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("touch-action");
    document.documentElement.style.removeProperty("overflow");
    document.documentElement.style.removeProperty("touch-action");

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.removeProperty("overflow");
      document.body.style.removeProperty("touch-action");
      document.documentElement.style.removeProperty("overflow");
      document.documentElement.style.removeProperty("touch-action");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Any "jump to finding/anchor" means go to the report, so close this overlay —
  // otherwise a jump fired from a panel INSIDE the drawer (e.g. AI Report Review's
  // "Fix ->") scrolls the finding behind the still-open drawer and nothing appears
  // to happen.
  useEffect(() => {
    function closeOnJump() {
      setOpen(false);
    }
    window.addEventListener("opi:command-center-jump", closeOnJump);
    return () =>
      window.removeEventListener("opi:command-center-jump", closeOnJump);
  }, []);

  useEffect(() => {
    if (!open || !bodyRef.current) return;

    const details = Array.from(bodyRef.current.querySelectorAll("details")) as HTMLDetailsElement[];

    details.forEach((detail) => {
      const summaryText = normalizeText(detail.querySelector("summary")?.textContent || "");
      const heading = detail.querySelector("h2, h3")?.textContent || "";
      const combined = normalizeText(`${summaryText} ${heading}`);

      const matchedItem = enrichedItems.find((item) => {
        const title = normalizeText(item.title);
        return combined.includes(title) || title.includes(combined);
      });

      if (matchedItem) {
        detail.id = `workspace-section-${matchedItem.slug}`;
        detail.dataset.workspaceTool = matchedItem.title;
      }
    });
  }, [open, enrichedItems]);

  useEffect(() => {
    if (!open || !bodyRef.current) return;

    const cleanQuery = normalizeText(query);
    const details = Array.from(bodyRef.current.querySelectorAll("details")) as HTMLDetailsElement[];

    details.forEach((detail) => {
      const text = normalizeText(detail.textContent || "");
      const explicitCategory = detail.dataset.toolCategory || "";
      const toolTitle = detail.dataset.workspaceTool || "";
      const item = enrichedItems.find((next) => next.title === toolTitle);
      const panelCategory = explicitCategory || item?.category || "";
      const categoryMatch =
        activeCategory === "all" ||
        activeCategory === "attention" ||
        !panelCategory ||
        panelCategory === activeCategory;
      const searchMatch = !cleanQuery || text.includes(cleanQuery);

      detail.style.display = categoryMatch && searchMatch ? "" : "none";
    });
  }, [activeCategory, enrichedItems, open, query]);

  function openWorkspace() {
    setOpen(true);
  }

  function openTool(title: string) {
    setOpen(true);
    setActiveTool(title);
    setActiveCategory("all");
    setQuery("");

    window.setTimeout(() => {
      const slug = slugify(title);
      const body = bodyRef.current;
      if (!body) return;

      const details = Array.from(body.querySelectorAll("details")) as HTMLDetailsElement[];
      let target = body.querySelector(`#workspace-section-${slug}`) as HTMLDetailsElement | null;

      if (!target) {
        target =
          details.find((detail) => {
            const text = normalizeText(detail.textContent || "");
            const titleText = normalizeText(title);
            return text.includes(titleText) || titleText.includes(text);
          }) || null;
      }

      details.forEach((detail) => {
        if (target && detail !== target) detail.open = false;
      });

      if (target) {
        target.open = true;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  }

  useEffect(() => {
    function handleOpenCommandCenterTool(event: Event) {
      const detail = (event as CustomEvent)?.detail || {};
      const title = String(detail.title || "").trim();
      if (!title) return;

      openTool(title);
    }

    window.addEventListener("opi:open-command-center-tool", handleOpenCommandCenterTool as EventListener);

    return () => {
      window.removeEventListener("opi:open-command-center-tool", handleOpenCommandCenterTool as EventListener);
    };
  }, [enrichedItems]);

  function jumpToReportAnchor(notification: WorkspaceNotification) {
    const targetAnchor = getHashTargetForNotification(notification, reviewedFindingIds);
    if (!targetAnchor) return false;

    setOpen(false);

    // The drawer is a full-screen overlay; after closing, the report page (and
    // its section tabs) need a moment to re-render and reveal the target tab.
    // Retry until the target is actually VISIBLE, then scroll — a single early
    // attempt scrolled to a still-hidden element, so nothing appeared to happen.
    let tries = 0;
    const attempt = () => {
      window.dispatchEvent(
        new CustomEvent("opi:command-center-jump", {
          detail: {
            targetAnchor,
            notification,
            findingIds: notification.findingIds || [],
            repairRequestId: notification.repairRequestId || null,
          },
        }),
      );

      // Reveal the section tab that holds this anchor (agreements, payment,
      // disclaimers, etc.) so the target isn't hidden behind an inactive tab.
      (window as any).__revealReportBuilderTab?.(targetAnchor);

      const element =
        (document.getElementById(targetAnchor) as HTMLElement | null) ||
        (document.querySelector(
          `[data-command-target="${CSS.escape(targetAnchor)}"]`,
        ) as HTMLElement | null);

      // offsetParent is null while the element is display:none (hidden tab).
      if (element && element.offsetParent !== null) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        flashElement(element);
        return;
      }

      if (tries++ < 8) window.setTimeout(attempt, 140);
    };

    window.setTimeout(attempt, 120);

    return true;
  }

  function openNotification(notification: WorkspaceNotification) {
    if (isPublishGuardNotification(notification)) {
      openTool("Final Publish Guard");
      return;
    }

    if (jumpToReportAnchor(notification)) return;

    const reportTarget = getReportJumpTargetForNotification(notification);

    if (reportTarget) {
      setOpen(false);
      window.setTimeout(() => {
        const element = findReportTargetElement(reportTarget);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
          flashReportTarget(element);
        } else if (reportTarget.fallbackTool) {
          openTool(reportTarget.fallbackTool);
        }
      }, 160);
      return;
    }

    const targetTitle = getActionTitleForNotification(notification, items);
    if (targetTitle) openTool(targetTitle);
    else openWorkspace();
  }

  function findNotificationForStatusTile(title: string) {
    const cleanTitle = normalizeText(title);

    return attentionNotifications.find((item) => {
      const text = normalizeText(`${item.id || ""} ${item.title} ${item.message || ""} ${item.badge || ""}`);

      if (cleanTitle.includes("payment")) return text.includes("payment") || text.includes("invoice") || text.includes("due") || text.includes("balance");
      if (cleanTitle.includes("agreement")) return text.includes("agreement") || text.includes("signature") || text.includes("signed");
      if (cleanTitle.includes("publish")) return text.includes("publish") || text.includes("guard") || text.includes("blocked");
      if (cleanTitle.includes("ai")) return text.includes("ai") || text.includes("safety") || text.includes("major") || text.includes("finding") || text.includes("defect");
      if (cleanTitle.includes("repair")) return text.includes("repair") || text.includes("seller") || text.includes("addendum") || text.includes("response");
      if (cleanTitle.includes("client")) return text.includes("view") || text.includes("engagement") || text.includes("opened") || text.includes("read");

      return false;
    });
  }

  function handleStatusTileClick(tile: { title: string; tool?: EnrichedToolItem }) {
    const matchingAlert = findNotificationForStatusTile(tile.title);

    if (matchingAlert) {
      openNotification(matchingAlert);
      return;
    }

    if (tile.tool) {
      openTool(tile.tool.title);
      return;
    }

    openWorkspace();
  }


  function handleCategoryClick(category: WorkspaceCategory) {
    // Just filter to the tab — don't auto-open the first alert. Tapping
    // "Needs Attention" should SHOW the items so the inspector can pick one,
    // not jump straight into the publish blocker.
    setActiveCategory(category);
    setQuery("");
    setActiveTool("");
  }

  const totalBadgeText =
    attentionNotifications.length > 0
      ? `${attentionNotifications.length} alert${attentionNotifications.length === 1 ? "" : "s"}`
      : badge;

  return (
    <>
      {/* Always-reachable floating Command Center button (defaults above the
          search FAB; drag to move — a tap opens the Command Center). */}
      <button
        type="button"
        aria-label="Open Command Center — drag to move"
        title="Command Center (Ctrl K) — drag to move"
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
        style={fabPos ? { left: fabPos.left, top: fabPos.top, right: "auto", bottom: "auto" } : undefined}
        className={`fixed z-40 flex items-center gap-2 rounded-full border border-purple-400/50 bg-[var(--fl-surface)] px-4 py-3 text-sm font-bold text-[var(--fl-purple-text)] shadow-xl shadow-black/40 backdrop-blur transition active:scale-95 hover:border-purple-400 [touch-action:none] ${
          fabPos ? "" : "bottom-44 right-4 md:bottom-20 md:right-6"
        }`}
      >
        <span className="text-base leading-none">🎛️</span>
        <span className="hidden sm:inline">Command</span>
        {attentionNotifications.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {attentionNotifications.length}
          </span>
        )}
      </button>

      <section className="mb-8 overflow-hidden rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)]">
        <button
          type="button"
          onClick={openWorkspace}
          className="group flex w-full flex-col gap-5 p-4 text-left sm:p-5 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--fl-info-text)]">
                Inspector Command Center
              </p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-muted)]">
                Ctrl K
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--fl-text)] sm:text-3xl">
              Run the inspection business from here.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
              Report writing stays on the page. Delivery, signatures, payments, AI review, engagement, repair requests, and business tools live in one polished workspace.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                needsAttention
                  ? "border-red-400/60 bg-red-500/15 text-[var(--fl-crit-text)]"
                  : "border-emerald-400/60 bg-emerald-500/15 text-[var(--fl-good-text)]"
              }`}
            >
              {totalBadgeText}
            </span>
            <span className="rounded-2xl border border-cyan-300/70 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-[var(--fl-info-text)] transition group-hover:bg-cyan-400/20 active:scale-[0.98]">
              Open Command Center →
            </span>
          </div>
        </button>

        <div className="flex gap-2 overflow-x-auto border-t border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-3 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-6">
          {statusTiles.map((tile) => {
            const style = urgencyStyles[tile.urgency] || urgencyStyles.success;
            return (
              <button
                key={tile.title}
                type="button"
                onClick={() => handleStatusTileClick(tile)}
                className="min-w-[170px] rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-3 text-left transition hover:border-[var(--fl-line)] active:scale-[0.99] sm:min-w-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${style.badge}`}>
                    {tile.badge}
                  </span>
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
                  {tile.title}
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--fl-text)]">{tile.label}</p>
              </button>
            );
          })}
        </div>

        {attentionNotifications.length > 0 ? (
          <div className="border-t border-[var(--fl-raised)] px-4 pb-4">
            <div className="grid gap-2 pt-4 sm:grid-cols-3">
              {attentionNotifications.slice(0, 3).map((item) => {
                const style = urgencyStyles[item.urgency || "info"] || urgencyStyles.info;

                return (
                  <button
                    key={item.id || item.title}
                    type="button"
                    onClick={() => openNotification(item)}
                    className="flex items-center gap-2 rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] px-3 py-3 text-left transition hover:border-[var(--fl-line)] active:scale-[0.99]"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--fl-text)]">{item.title}</p>
                    {item.badge ? (
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {/* Alerts stay inside the Command Center instead of popping up on every report visit. */}

      {open || warming ? (
        <div
          className={`fixed inset-0 z-[100] ${warming && !open ? "pointer-events-none opacity-0" : ""}`}
          aria-hidden={warming && !open ? true : undefined}
        >
          {open && (
            <button
              type="button"
              aria-label="Close inspector command center"
              onClick={requestClose}
              className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${closing || genie ? "cc-backdrop-out" : "cc-backdrop-in"}`}
            />
          )}

          {genie && (
            <CommandCenterGenie
              source={genie.source}
              rect={genie.rect}
              direction={genie.direction}
              onDone={onGenieDone}
            />
          )}

          <aside
            ref={asideRef}
            className={`absolute inset-0 flex min-w-0 flex-col overflow-hidden bg-[#0a0f1a] shadow-2xl ${
              warming && !open
                ? "" // warm-up: render static + opaque so the capture is fully drawn
                : genie || (open && !closing && !webglOpened && captureRef.current && canWebglGenie())
                  ? "opacity-0"
                  : closing
                    ? "cc-genie-close"
                    : webglOpened
                      ? ""
                      : "cc-genie-open"
            } sm:inset-y-[6vh] sm:mx-auto sm:max-w-5xl sm:rounded-2xl sm:border sm:border-[var(--fl-line)] sm:shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)]`}
          >
            <div className="shrink-0 overflow-hidden border-b border-[var(--fl-raised)] bg-[var(--fl-surface)] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-5 sm:pt-[max(1.25rem,env(safe-area-inset-top))]">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#14c8d2]">
                    FLOW
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-[var(--fl-text)] sm:text-2xl lg:text-3xl">
                    Inspector Command Center
                  </h2>
                  <p className="mt-1 hidden text-sm leading-6 text-[var(--fl-muted)] sm:block">
                    Business operations, report intelligence, delivery controls, repair requests, and activity in one workspace.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={requestClose}
                  className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-2.5 text-sm font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)] active:scale-[0.98]"
                >
                  ✕ <span className="hidden sm:inline">Close</span>
                  <span className="sm:hidden">Close</span>
                </button>
              </div>

              <div className="mt-2 sm:mt-3">
                <label className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fl-faint)]">
                    ⌕
                  </span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tools, sections, actions..."
                    className="h-[44px] w-full rounded-full border border-[var(--fl-line)] bg-[var(--fl-ground)] pl-9 pr-3 text-sm font-bold text-[var(--fl-text)] outline-none transition placeholder:text-[var(--fl-faint)] focus:border-cyan-400"
                  />
                </label>
              </div>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-24 xl:grid xl:grid-cols-[320px_minmax(0,1fr)_340px] xl:overflow-hidden xl:pb-0">
              <nav className="hidden min-h-0 overflow-y-auto border-r border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 xl:block">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fl-faint)]">
                    Workspace Tools
                  </p>
                  <div className="space-y-2">
                    {filteredItems.map((item) => {
                      const active = activeTool === item.title;

                      return (
                        <button
                          key={item.title}
                          type="button"
                          onClick={() => openTool(item.title)}
                          className={`w-full rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
                            active
                              ? "border-cyan-300 bg-cyan-500/15 shadow-[0_0_22px_rgba(34,211,238,0.14)]"
                              : "border-[var(--fl-line)] bg-[var(--fl-ground)] hover:border-cyan-500/70 hover:bg-[var(--fl-surface-2)]"
                          }`}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold text-[var(--fl-text)]">
                                {item.title}
                              </p>
                              {item.helper ? (
                                <p className="mt-1 text-xs leading-5 text-[var(--fl-muted)]">
                                  {item.helper}
                                </p>
                              ) : null}
                            </div>
                            {item.badge ? (
                              <span
                                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                  toneClasses[item.tone || "slate"] || toneClasses.slate
                                }`}
                              >
                                {item.badge}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}

                    {filteredItems.length === 0 ? (
                      <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-sm font-bold text-[var(--fl-muted)]">
                        No workspace tools match that search.
                      </div>
                    ) : null}
                  </div>
                </div>
              </nav>

              <div className="min-h-0 min-w-0 scroll-smooth p-3 sm:p-5 xl:overflow-y-auto" ref={bodyRef}>
                {!query && attentionNotifications.length > 0 ? (
                  <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/[0.07] p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
                      <b className="text-[11px] font-semibold text-[var(--fl-crit-text)]">
                        {attentionNotifications.length} ITEM
                        {attentionNotifications.length === 1 ? "" : "S"} NEED ATTENTION
                      </b>
                    </div>
                    <div className="space-y-2">
                      {attentionNotifications.map((n, i) => (
                        <button
                          key={(n as any).id || i}
                          type="button"
                          onClick={() => openNotification(n)}
                          className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-[var(--fl-surface-2)] p-3 text-left transition hover:bg-red-500/10 active:scale-[0.99]"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[var(--fl-text)]">
                              {n.title || "Attention item"}
                            </span>
                            {n.message ? (
                              <span className="mt-0.5 block truncate text-xs text-[var(--fl-muted)]">
                                {n.message}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-[var(--fl-crit-text)]">Open →</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {query ? (
                  <div className="mb-4 space-y-2">
                    {filteredItems.length ? (
                      filteredItems.map((item) => (
                        <ToolRow
                          key={item.title}
                          item={item}
                          accent={toneHex(item.tone)}
                          onOpen={() => openTool(item.title)}
                        />
                      ))
                    ) : (
                      <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-sm font-bold text-[var(--fl-muted)]">
                        No tools match that search.
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {pinnedTools.length ? (
                      <>
                        <p className="mb-2 mt-1 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fl-faint)]">
                          Pinned · most-used
                        </p>
                        <div className="mb-4 grid grid-cols-2 gap-2.5">
                          {pinnedTools.map((item) => {
                            const accent = toneHex(item.tone);
                            return (
                              <button
                                key={item.title}
                                type="button"
                                onClick={() => openTool(item.title)}
                                className="relative flex min-h-[92px] flex-col gap-2 overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-3.5 pt-4 text-left transition hover:border-[var(--fl-line)] active:scale-[0.98]"
                              >
                                <span
                                  className="absolute inset-x-0 top-0 h-[3px]"
                                  style={{ background: accent, opacity: 0.85 }}
                                />
                                <div className="flex items-start justify-between gap-2">
                                  <span
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg"
                                    style={{ background: `${accent}22`, border: `1px solid ${accent}55` }}
                                  >
                                    {toolIcon(item.title)}
                                  </span>
                                  {item.badge ? (
                                    <span
                                      className="max-w-[55%] rounded-full px-2 py-0.5 text-right text-[9px] font-semibold uppercase leading-tight tracking-wide"
                                      style={{
                                        background: `${accent}1f`,
                                        border: `1px solid ${accent}55`,
                                        color: accent,
                                      }}
                                    >
                                      {item.badge}
                                    </span>
                                  ) : null}
                                </div>
                                <span className="text-sm font-semibold leading-tight text-[var(--fl-text)]">
                                  {item.title}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}

                    {toolGroups.map((group) => (
                      <div key={group.label}>
                        <p className="mb-2 mt-4 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fl-faint)]">
                          {group.label}
                        </p>
                        <div className="space-y-2">
                          {group.items.map((item) => (
                            <ToolRow
                              key={item.title}
                              item={item}
                              accent={toneHex(item.tone)}
                              onOpen={() => openTool(item.title)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}

                    {statusTiles.filter(
                      (t) => t.title === "Payment" || t.title === "Agreements",
                    ).length ? (
                      <div>
                        <p className="mb-2 mt-4 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fl-faint)]">
                          Payments &amp; Agreements
                        </p>
                        <div className="space-y-2">
                          {statusTiles
                            .filter(
                              (t) => t.title === "Payment" || t.title === "Agreements",
                            )
                            .map((tile) => {
                              const accent =
                                tile.title === "Payment" ? "#38bdf8" : "#fbbf24";
                              return (
                                <button
                                  key={tile.title}
                                  type="button"
                                  onClick={() => handleStatusTileClick(tile)}
                                  className="flex w-full items-center gap-3 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-3 text-left transition hover:border-[var(--fl-line)] active:scale-[0.99]"
                                >
                                  <span
                                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg"
                                    style={{
                                      background: `${accent}22`,
                                      border: `1px solid ${accent}55`,
                                    }}
                                  >
                                    {tile.title === "Payment" ? "💳" : "✍️"}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] font-semibold text-[var(--fl-text)]">
                                      {tile.title === "Payment"
                                        ? "Payments & Invoices"
                                        : "Agreements"}
                                    </span>
                                    <span className="block text-xs text-[var(--fl-muted)]">
                                      {tile.badge || tile.label}
                                    </span>
                                  </span>
                                  <span className="text-lg text-[var(--fl-faint)]">›</span>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}

                {children}
              </div>

              <aside className="hidden min-h-0 overflow-y-auto border-l border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4 xl:block">
                <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--fl-faint)]">
                    Activity Feed
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-[var(--fl-text)]">What changed</h3>

                  <div className="mt-4 space-y-3">
                    {activityItems.length > 0 ? (
                      activityItems.map((item) => {
                        const activityUrgency = (item.urgency || "info") as NonNullable<WorkspaceNotification["urgency"]>;
                        const style = urgencyStyles[activityUrgency] || urgencyStyles.info;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (item.notification) openNotification(item.notification);
                            }}
                            className="w-full rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-3 text-left transition hover:border-cyan-400/60 hover:bg-[var(--fl-surface-2)] active:scale-[0.99]"
                          >
                            <div className="flex items-start gap-3">
                              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-sm font-semibold text-[var(--fl-text)]">{item.title}</p>
                                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}>
                                    {item.badge}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-[var(--fl-muted)]">{item.helper}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <p className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-sm font-bold text-[var(--fl-muted)]">
                        No major workspace activity yet.
                      </p>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
