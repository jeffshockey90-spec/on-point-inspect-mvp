"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  purple: "border-purple-400/50 bg-purple-500/10 text-purple-200",
  emerald: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
  yellow: "border-yellow-400/50 bg-yellow-500/10 text-yellow-100",
  blue: "border-blue-400/50 bg-blue-500/10 text-blue-200",
  violet: "border-violet-400/50 bg-violet-500/10 text-violet-200",
  red: "border-red-400/50 bg-red-500/10 text-red-200",
  cyan: "border-cyan-400/50 bg-cyan-500/10 text-cyan-200",
  green: "border-green-400/50 bg-green-500/10 text-green-200",
  slate: "border-slate-500/50 bg-slate-500/10 text-slate-200",
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
      "border-red-400/70 bg-gradient-to-br from-red-500/22 via-slate-950 to-slate-950 text-red-50",
    icon: "border-red-300/70 bg-red-500/25 text-red-100",
    badge: "border-red-300/70 bg-red-500/25 text-red-100",
    label: "Action needed",
    glow: "shadow-[0_0_40px_rgba(248,113,113,0.22)]",
    dot: "bg-red-400",
  },
  warning: {
    shell:
      "border-yellow-400/70 bg-gradient-to-br from-yellow-500/18 via-slate-950 to-slate-950 text-yellow-50",
    icon: "border-yellow-300/70 bg-yellow-500/25 text-yellow-100",
    badge: "border-yellow-300/70 bg-yellow-500/25 text-yellow-100",
    label: "Review",
    glow: "shadow-[0_0_40px_rgba(250,204,21,0.16)]",
    dot: "bg-yellow-300",
  },
  info: {
    shell:
      "border-cyan-400/70 bg-gradient-to-br from-cyan-500/18 via-slate-950 to-slate-950 text-cyan-50",
    icon: "border-cyan-300/70 bg-cyan-500/25 text-cyan-100",
    badge: "border-cyan-300/70 bg-cyan-500/25 text-cyan-100",
    label: "Update",
    glow: "shadow-[0_0_40px_rgba(34,211,238,0.16)]",
    dot: "bg-cyan-300",
  },
  success: {
    shell:
      "border-emerald-400/70 bg-gradient-to-br from-emerald-500/18 via-slate-950 to-slate-950 text-emerald-50",
    icon: "border-emerald-300/70 bg-emerald-500/25 text-emerald-100",
    badge: "border-emerald-300/70 bg-emerald-500/25 text-emerald-100",
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
  const text = normalizeText(
    `${notification.id || ""} ${notification.title} ${notification.message || ""} ${notification.badge || ""} ${notification.targetAnchor || ""}`
  );

  return text.includes("publish") || text.includes("publish guard") || text.includes("blocked");
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
      if (event.key === "Escape") setOpen(false);
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

    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("opi:command-center-jump", {
          detail: {
            targetAnchor,
            notification,
            findingIds: notification.findingIds || [],
            repairRequestId: notification.repairRequestId || null,
          },
        })
      );

      // If this anchor lives inside the report builder's section tabs (agreement,
      // payment, disclaimers, etc.), reveal the right tab before scrolling -
      // otherwise the target may be hidden behind an inactive tab.
      (window as any).__revealReportBuilderTab?.(targetAnchor);

      const element = document.getElementById(targetAnchor) || document.querySelector(`[data-command-target="${CSS.escape(targetAnchor)}"]`);

      if (element instanceof HTMLElement) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        flashElement(element);
      }
    }, 140);

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
      <section className="mb-8 overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1220]">
        <button
          type="button"
          onClick={openWorkspace}
          className="group flex w-full flex-col gap-5 p-4 text-left sm:p-5 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200">
                Inspector Command Center
              </p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">
                Ctrl K
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
              Run the inspection business from here.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Report writing stays on the page. Delivery, signatures, payments, AI review, engagement, repair requests, and business tools live in one polished workspace.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-black ${
                needsAttention
                  ? "border-red-400/60 bg-red-500/15 text-red-100"
                  : "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
              }`}
            >
              {totalBadgeText}
            </span>
            <span className="rounded-2xl border border-cyan-300/70 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 transition group-hover:bg-cyan-400/20 active:scale-[0.98]">
              Open Command Center →
            </span>
          </div>
        </button>

        <div className="flex gap-2 overflow-x-auto border-t border-slate-800 bg-black/10 p-3 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-6">
          {statusTiles.map((tile) => {
            const style = urgencyStyles[tile.urgency] || urgencyStyles.success;
            return (
              <button
                key={tile.title}
                type="button"
                onClick={() => handleStatusTileClick(tile)}
                className="min-w-[170px] rounded-xl border border-slate-800/70 bg-[#0b1220]/60 p-3 text-left transition hover:border-slate-700 active:scale-[0.99] sm:min-w-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${style.badge}`}>
                    {tile.badge}
                  </span>
                </div>
                <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                  {tile.title}
                </p>
                <p className="mt-1 text-sm font-black text-white">{tile.label}</p>
              </button>
            );
          })}
        </div>

        {attentionNotifications.length > 0 ? (
          <div className="border-t border-slate-800 px-4 pb-4">
            <div className="grid gap-2 pt-4 sm:grid-cols-3">
              {attentionNotifications.slice(0, 3).map((item) => {
                const style = urgencyStyles[item.urgency || "info"] || urgencyStyles.info;

                return (
                  <button
                    key={item.id || item.title}
                    type="button"
                    onClick={() => openNotification(item)}
                    className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0f172a] px-3 py-3 text-left transition hover:border-slate-700 active:scale-[0.99]"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                    <p className="min-w-0 flex-1 truncate text-xs font-black text-slate-200">{item.title}</p>
                    {item.badge ? (
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${style.badge}`}>
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

      {open ? (
        <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            aria-label="Close inspector command center"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          <aside className="absolute inset-0 flex min-w-0 flex-col overflow-hidden bg-[#0a0f1a] shadow-2xl lg:inset-4 lg:rounded-[2rem] lg:border lg:border-slate-800">
            <div className="shrink-0 overflow-hidden border-b border-slate-800 bg-[#0b1220] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-5 sm:pt-[max(1.25rem,env(safe-area-inset-top))]">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#14c8d2]">
                    FLOW
                  </p>
                  <h2 className="mt-1 text-lg font-black text-white sm:text-2xl lg:text-3xl">
                    Inspector Command Center
                  </h2>
                  <p className="mt-1 hidden text-sm leading-6 text-slate-400 sm:block">
                    Business operations, report intelligence, delivery controls, repair requests, and activity in one workspace.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-600 bg-[#020617] px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-slate-800 active:scale-[0.98]"
                >
                  ✕ <span className="hidden sm:inline">Close</span>
                  <span className="sm:hidden">Close</span>
                </button>
              </div>

              <div className="mt-2 grid min-w-0 gap-2 sm:mt-3 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="-mx-3 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain px-3 pb-2 pr-6 [-webkit-overflow-scrolling:touch] sm:mx-0 sm:px-0">
                  {categories.map((category) => {
                    const active = activeCategory === category;

                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => handleCategoryClick(category)}
                        className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition active:scale-[0.98] ${
                          active
                            ? "border-cyan-300 bg-cyan-500/15 text-cyan-100"
                            : "border-slate-700 bg-[#020617] text-slate-300 hover:border-cyan-400 hover:text-cyan-200"
                        }`}
                      >
                        <span>{categoryIcon(category)}</span>
                        <span>{categoryLabel(category)}</span>
                        {category === "attention" && attentionNotifications.length ? (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">
                            {attentionNotifications.length}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <label className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    ⌕
                  </span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tools, sections, actions..."
                    className="h-[42px] w-full rounded-full border border-slate-700 bg-[#020617] pl-9 pr-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  />
                </label>
              </div>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-24 xl:grid xl:grid-cols-[320px_minmax(0,1fr)_340px] xl:overflow-hidden xl:pb-0">
              <nav className="hidden min-h-0 overflow-y-auto border-r border-slate-800 bg-[#0b1220] p-4 xl:block">
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
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
                              : "border-slate-700 bg-[#020617] hover:border-cyan-500/70 hover:bg-slate-900"
                          }`}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-black text-white">
                                {item.title}
                              </p>
                              {item.helper ? (
                                <p className="mt-1 text-xs leading-5 text-slate-400">
                                  {item.helper}
                                </p>
                              ) : null}
                            </div>
                            {item.badge ? (
                              <span
                                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
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
                      <div className="rounded-2xl border border-slate-700 bg-[#020617] p-4 text-sm font-bold text-slate-400">
                        No workspace tools match that search.
                      </div>
                    ) : null}
                  </div>
                </div>
              </nav>

              <div className="min-h-0 min-w-0 scroll-smooth p-3 sm:p-5 xl:overflow-y-auto" ref={bodyRef}>
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {statusTiles.map((tile) => {
                    const style = urgencyStyles[tile.urgency] || urgencyStyles.success;
                    return (
                      <button
                        key={tile.title}
                        type="button"
                        onClick={() => handleStatusTileClick(tile)}
                        className="rounded-xl border border-slate-800 bg-[#0f172a] p-2.5 text-left transition hover:border-slate-700 active:scale-[0.99] sm:p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            {tile.title}
                          </span>
                          <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                        </div>
                        <p className="mt-1 text-sm font-black text-white sm:mt-1.5">{tile.label}</p>
                        <p className="mt-0.5 text-xs font-bold text-slate-500">{tile.badge}</p>
                      </button>
                    );
                  })}
                </div>

                <div className={`mb-4 rounded-xl border p-2.5 sm:rounded-2xl sm:p-4 ${nextAttentionNotification ? "border-red-500/40 bg-red-500/[0.07]" : "border-emerald-500/40 bg-emerald-500/[0.07]"}`}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                        {nextTaskCopy.eyebrow}
                      </p>
                      <h3 className="mt-1 break-words text-base font-black text-white sm:text-xl">
                        {nextTaskCopy.title}
                      </h3>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-300 sm:text-sm sm:leading-6">
                        {nextTaskCopy.helper}
                      </p>
                    </div>

                    {nextAttentionNotification ? (
                      <button
                        type="button"
                        onClick={() => openNotification(nextAttentionNotification)}
                        className="inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-red-400 active:scale-[0.98] sm:min-h-[46px] sm:px-5 sm:py-3"
                      >
                        {nextTaskCopy.action} →
                      </button>
                    ) : (
                      <span className="inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-2xl border border-emerald-400/60 bg-emerald-500/15 px-4 py-2.5 text-sm font-black text-emerald-100 sm:min-h-[46px] sm:px-5 sm:py-3">
                        All clear
                      </span>
                    )}
                  </div>
                </div>

                {activeCategory === "attention" && attentionNotifications.length > 0 ? (
                  <div className="mb-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                      {attentionNotifications.length} item
                      {attentionNotifications.length === 1 ? "" : "s"} need attention
                    </p>
                    {attentionNotifications.map((n, i) => (
                      <button
                        key={(n as any).id || i}
                        type="button"
                        onClick={() => openNotification(n)}
                        className="flex w-full items-start justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/[0.06] p-3 text-left transition hover:bg-red-500/10 active:scale-[0.99]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-white">
                            {n.title || "Attention item"}
                          </span>
                          {n.message ? (
                            <span className="mt-0.5 block text-xs leading-5 text-slate-300">
                              {n.message}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs font-black text-red-200">Open →</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="sticky top-0 z-10 -mx-3 mb-4 overflow-hidden border-b border-slate-800 bg-[#071224]/95 px-3 py-3 backdrop-blur xl:hidden">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Quick Actions</p>
                  <div className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2 pr-6 [-webkit-overflow-scrolling:touch]">
                  {quickActions.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => openTool(item.title)}
                      className="flex min-w-max shrink-0 items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-100 transition active:scale-[0.98]"
                    >
                      {item.title}
                    </button>
                  ))}
                  </div>
                </div>

                {children}
              </div>

              <aside className="hidden min-h-0 overflow-y-auto border-l border-slate-800 bg-[#08111f] p-4 xl:block">
                <div className="rounded-3xl border border-slate-700 bg-[#020617] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                    Activity Feed
                  </p>
                  <h3 className="mt-1 text-lg font-black text-white">What changed</h3>

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
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-left transition hover:border-cyan-400/60 hover:bg-slate-900 active:scale-[0.99]"
                          >
                            <div className="flex items-start gap-3">
                              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-sm font-black text-white">{item.title}</p>
                                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${style.badge}`}>
                                    {item.badge}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-slate-400">{item.helper}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <p className="rounded-2xl border border-slate-700 bg-slate-950 p-3 text-sm font-bold text-slate-400">
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
