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

type WorkspaceNotification = {
  id?: string;
  title: string;
  message?: string;
  urgency?: "critical" | "warning" | "info" | "success";
  badge?: string;
};

type WorkspaceCategory =
  | "attention"
  | "ai"
  | "delivery"
  | "negotiation"
  | "activity"
  | "profile"
  | "all";

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
  string,
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

function normalizeText(value: any) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value: any) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function getNotificationKey(notifications: WorkspaceNotification[]) {
  return notifications
    .map((item) => `${item.id || item.title}:${item.badge || ""}:${item.urgency || "info"}`)
    .join("|");
}

function getHighestUrgency(notifications: WorkspaceNotification[]) {
  if (notifications.some((item) => item.urgency === "critical")) return "critical";
  if (notifications.some((item) => item.urgency === "warning")) return "warning";
  if (notifications.some((item) => item.urgency === "info")) return "info";
  return "success";
}

function getCategoryForTool(item: ToolItem): WorkspaceCategory {
  const text = normalizeText(`${item.title} ${item.helper || ""}`);

  if (
    text.includes("publish") ||
    text.includes("agreement") ||
    text.includes("payment") ||
    text.includes("delivery")
  ) {
    return "delivery";
  }

  if (text.includes("repair request") || text.includes("negotiation")) {
    return "negotiation";
  }

  if (
    text.includes("engagement") ||
    text.includes("timeline") ||
    text.includes("activity") ||
    text.includes("view")
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
    text.includes("copilot")
  ) {
    return "ai";
  }

  return "all";
}

function getActionTitleForNotification(notification: WorkspaceNotification, items: ToolItem[]) {
  const text = normalizeText(`${notification.title} ${notification.message || ""}`);

  const direct = items.find((item) => {
    const itemText = normalizeText(`${item.title} ${item.helper || ""}`);
    return itemText && (text.includes(itemText) || itemText.includes(text));
  });

  if (direct) return direct.title;

  const rules: Array<[string[], string[]]> = [
    [["safety", "defect", "contradiction", "ai"], ["AI Report Review", "Live AI Inspector Assistant"]],
    [["agreement", "signature", "payment", "publish", "delivery"], ["Final Publish Guard"]],
    [["repair", "response", "seller", "addendum"], ["Repair Request History"]],
    [["view", "opened", "read", "engagement"], ["Report Engagement"]],
    [["sample", "public"], ["Sample Report"]],
    [["house", "memory", "property"], ["House Intelligence"]],
  ];

  for (const [keywords, targets] of rules) {
    if (!keywords.some((keyword) => text.includes(keyword))) continue;

    const target = targets.find((title) =>
      items.some((item) => normalizeText(item.title) === normalizeText(title))
    );

    if (target) return target;
  }

  return items[0]?.title || "";
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
  const [toastVisible, setToastVisible] = useState(false);
  const [toastDismissedKey, setToastDismissedKey] = useState("");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<WorkspaceCategory>("all");
  const [activeTool, setActiveTool] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const attentionNotifications = useMemo(
    () =>
      notifications.filter((item) =>
        ["critical", "warning", "info"].includes(item.urgency || "info")
      ),
    [notifications]
  );

  const notificationKey = useMemo(
    () => getNotificationKey(attentionNotifications),
    [attentionNotifications]
  );

  const highestUrgency = useMemo(
    () => getHighestUrgency(attentionNotifications),
    [attentionNotifications]
  );

  const topNotification = attentionNotifications[0] || null;
  const urgency = urgencyStyles[highestUrgency] || urgencyStyles.info;

  const enrichedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        category: getCategoryForTool(item),
        slug: slugify(item.title),
      })),
    [items]
  );

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
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    if (open) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!notificationKey || !attentionNotifications.length || open) {
      setToastVisible(false);
      return;
    }

    if (toastDismissedKey === notificationKey) return;

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    toastTimerRef.current = setTimeout(() => {
      setToastVisible(true);
    }, 850);

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [notificationKey, attentionNotifications.length, open, toastDismissedKey]);

  useEffect(() => {
    if (!open || !bodyRef.current) return;

    const details = Array.from(bodyRef.current.querySelectorAll("details"));

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
      const toolTitle = detail.dataset.workspaceTool || "";
      const item = enrichedItems.find((next) => next.title === toolTitle);
      const categoryMatch =
        activeCategory === "all" ||
        activeCategory === "attention" ||
        !item ||
        item.category === activeCategory;
      const searchMatch = !cleanQuery || text.includes(cleanQuery);

      detail.style.display = categoryMatch && searchMatch ? "" : "none";
    });
  }, [activeCategory, enrichedItems, open, query]);

  function openWorkspace() {
    setToastVisible(false);
    setOpen(true);
  }

  function dismissToast() {
    setToastDismissedKey(notificationKey);
    setToastVisible(false);
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

  function openNotification(notification: WorkspaceNotification) {
    const targetTitle = getActionTitleForNotification(notification, items);
    if (targetTitle) {
      openTool(targetTitle);
    } else {
      openWorkspace();
    }
  }

  const totalBadgeText =
    attentionNotifications.length > 0
      ? `${attentionNotifications.length} alert${attentionNotifications.length === 1 ? "" : "s"}`
      : badge;

  return (
    <>
      <section className="mb-8 overflow-hidden rounded-2xl border border-purple-500/50 bg-gradient-to-br from-purple-500/15 via-[#10172a] to-[#071224] shadow-xl">
        <button
          type="button"
          onClick={openWorkspace}
          className="group flex w-full flex-col gap-4 p-4 text-left sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-purple-200">
              Inspector Workspace
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">
              Command Center
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Review alerts, AI tools, publish guard, engagement, sample report, and repair request history without scrolling through every section.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-black ${
                needsAttention
                  ? "border-red-400/60 bg-red-500/15 text-red-100"
                  : "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
              }`}
            >
              {totalBadgeText}
            </span>
            <span className="rounded-xl border border-purple-400 bg-[#020617] px-4 py-3 text-sm font-black text-purple-100 transition group-hover:bg-purple-500/10 active:scale-[0.98]">
              Open Workspace →
            </span>
          </div>
        </button>

        {attentionNotifications.length > 0 ? (
          <div className="border-t border-purple-400/20 px-4 pb-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {attentionNotifications.slice(0, 3).map((item) => {
                const style = urgencyStyles[item.urgency || "info"] || urgencyStyles.info;

                return (
                  <button
                    key={item.id || item.title}
                    type="button"
                    onClick={() => openNotification(item)}
                    className={`rounded-xl border px-3 py-2 text-left transition hover:scale-[1.01] active:scale-[0.99] ${style.shell}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs font-black">{item.title}</p>
                      {item.badge ? (
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${style.badge}`}>
                          {item.badge}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {toastVisible && topNotification ? (
        <div className="fixed inset-x-3 bottom-24 z-[120] sm:bottom-auto sm:left-auto sm:right-5 sm:top-24 sm:w-[440px]">
          <div className={`overflow-hidden rounded-2xl border backdrop-blur-xl ${urgency.shell} ${urgency.glow}`}>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-lg font-black ${urgency.icon}`}>
                  {highestUrgency === "critical" ? "!" : highestUrgency === "warning" ? "⚠" : "•"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">
                      Inspector Workspace
                    </p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${urgency.badge}`}>
                      {urgency.label}
                    </span>
                  </div>

                  <h3 className="mt-1 text-base font-black text-white">
                    {attentionNotifications.length === 1
                      ? topNotification.title
                      : `${attentionNotifications.length} items need your attention`}
                  </h3>

                  <p className="mt-1 text-sm leading-5 text-slate-200">
                    {attentionNotifications.length === 1
                      ? topNotification.message || "Open the workspace to review this item."
                      : topNotification.message || "Open the workspace to review the highest priority items."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={dismissToast}
                  aria-label="Dismiss workspace notification"
                  className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs font-black text-slate-200 transition hover:bg-white/10"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => openNotification(topNotification)}
                  className="min-h-[44px] rounded-xl border border-cyan-300 bg-cyan-400/15 px-3 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/25 active:scale-[0.98]"
                >
                  Review Now
                </button>

                <button
                  type="button"
                  onClick={dismissToast}
                  className="min-h-[44px] rounded-xl border border-slate-600 bg-black/25 px-3 py-2 text-sm font-black text-slate-200 transition hover:bg-white/10 active:scale-[0.98]"
                >
                  Later
                </button>
              </div>
            </div>

            <div className="h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            aria-label="Close inspector workspace"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />

          <aside className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-slate-700 bg-[#071224] shadow-2xl sm:max-w-3xl xl:max-w-6xl">
            <div className="shrink-0 border-b border-slate-800 bg-[#0f172a] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-teal-300">
                    On Point Inspect
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-white">
                    Inspector Workspace
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Command center for review, delivery, negotiation, and report intelligence.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-600 bg-[#020617] px-4 py-2 text-sm font-black text-slate-200 transition hover:bg-slate-800 active:scale-[0.98]"
                >
                  Close
                </button>
              </div>

              {attentionNotifications.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-red-400/40 bg-red-500/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-red-100">
                      Needs Attention
                    </p>
                    <span className="rounded-full border border-red-300/60 bg-red-500/20 px-3 py-1 text-xs font-black text-red-100">
                      {attentionNotifications.length}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {attentionNotifications.map((item) => {
                      const style = urgencyStyles[item.urgency || "info"] || urgencyStyles.info;

                      return (
                        <button
                          key={item.id || item.title}
                          type="button"
                          onClick={() => openNotification(item)}
                          className={`rounded-xl border px-3 py-3 text-left transition hover:scale-[1.01] active:scale-[0.99] ${style.shell}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-white">{item.title}</p>
                              {item.message ? (
                                <p className="mt-1 text-xs leading-5 text-slate-300">{item.message}</p>
                              ) : null}
                            </div>
                            {item.badge ? (
                              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${style.badge}`}>
                                {item.badge}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {categories.map((category) => {
                    const active = activeCategory === category;

                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setActiveCategory(category)}
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
                    placeholder="Search workspace..."
                    className="h-[42px] w-full rounded-full border border-slate-700 bg-[#020617] pl-9 pr-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  />
                </label>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
              <nav className="hidden min-h-0 overflow-y-auto border-r border-slate-800 bg-[#0b1220] p-4 lg:block">
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
                        <div className="flex items-start justify-between gap-3">
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
              </nav>

              <div className="min-h-0 overflow-y-auto scroll-smooth p-4 sm:p-5" ref={bodyRef}>
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                  {filteredItems.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => openTool(item.title)}
                      className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition active:scale-[0.98] ${
                        activeTool === item.title
                          ? "border-cyan-300 bg-cyan-500/15 text-cyan-100"
                          : "border-slate-700 bg-[#020617] text-slate-300 hover:border-cyan-400 hover:text-cyan-200"
                      }`}
                    >
                      <span>{item.title}</span>
                      {item.badge ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                            toneClasses[item.tone || "slate"] || toneClasses.slate
                          }`}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>

                {children}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
