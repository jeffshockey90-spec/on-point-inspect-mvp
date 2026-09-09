"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { OWNER_EMAILS } from "../lib/ownerEmails";
import { GENERATED_ROUTES } from "../lib/appRoutes.generated";

type Command = {
  label: string;
  href: string;
  icon: string;
  group: "Reports" | "Actions" | "Go to" | "Settings" | "More" | "Owner";
  keywords?: string;
  sublabel?: string; // second line (used by live inspection results)
  ownerOnly?: boolean; // platform-owner destinations (hidden from other users)
};

// The full jump-anywhere destination list. Keep this in sync when a new
// top-level page is added under app/ — dynamic ([id]) and public/portal/auth
// pages are intentionally excluded (you can't jump to them without context).
const COMMANDS: Command[] = [
  // Actions — things you do
  { label: "Ask FLOW", href: "/ask-flow", icon: "💬", group: "Actions", keywords: "assistant ai chat question business how many unpaid schedule" },
  { label: "New Inspection", href: "/inspections/new", icon: "➕", group: "Actions", keywords: "create add job" },
  { label: "Field Tool", href: "/field", icon: "📱", group: "Actions", keywords: "capture onsite" },
  { label: "AI Capture", href: "/ai-capture", icon: "✨", group: "Actions", keywords: "photo findings bulk" },
  { label: "Import Report", href: "/import-report", icon: "📥", group: "Actions", keywords: "spectora horizon hive migrate" },
  { label: "New Invoice", href: "/invoices/new", icon: "🧾", group: "Actions", keywords: "bill create charge" },

  // Go to — main destinations
  { label: "Dashboard", href: "/", icon: "🏠", group: "Go to", keywords: "home command center" },
  { label: "Reports", href: "/reports", icon: "📋", group: "Go to", keywords: "inspections list" },
  { label: "Schedule", href: "/schedule", icon: "🗓️", group: "Go to", keywords: "calendar availability" },
  { label: "Route Planner", href: "/route", icon: "🧭", group: "Go to", keywords: "drive directions map today" },
  { label: "Dispatch", href: "/dispatch", icon: "📡", group: "Go to", keywords: "assign team booking requests" },
  { label: "Invoices", href: "/invoices", icon: "💵", group: "Go to", keywords: "payments billing money balance" },
  { label: "Quotes", href: "/quotes", icon: "💬", group: "Go to", keywords: "pricing estimate" },
  { label: "Agreements", href: "/agreements", icon: "📄", group: "Go to", keywords: "contract sign" },
  { label: "Agreement Status", href: "/agreements/status", icon: "✅", group: "Go to", keywords: "signed pending" },
  { label: "Realtors", href: "/realtors", icon: "🏡", group: "Go to", keywords: "agents contacts" },
  { label: "Realtor Leaderboard", href: "/realtors/leaderboard", icon: "🏆", group: "Go to", keywords: "referrals ranking top agents" },
  { label: "Analytics", href: "/analytics", icon: "📈", group: "Go to", keywords: "metrics stats revenue" },
  { label: "Mileage", href: "/mileage", icon: "🚗", group: "Go to", keywords: "trips tracking drive" },
  { label: "Timesheets", href: "/timesheets", icon: "⏱️", group: "Go to", keywords: "hours time tracking" },
  { label: "Pay Splits", href: "/pay-splits", icon: "🤝", group: "Go to", keywords: "commission inspector pay share" },
  { label: "Mold", href: "/mold", icon: "🧪", group: "Go to", keywords: "environmental sample" },
  { label: "Radon", href: "/radon", icon: "☢️", group: "Go to", keywords: "environmental test" },
  { label: "Templates", href: "/templates", icon: "📚", group: "Go to", keywords: "report sections" },
  { label: "Sent Emails", href: "/emails", icon: "📧", group: "Go to", keywords: "delivery outbox" },
  { label: "Email Workflow", href: "/email-workflow", icon: "✉️", group: "Go to", keywords: "automations sequence" },
  { label: "Equipment Analyzer", href: "/equipment-analyzer", icon: "🔧", group: "Go to", keywords: "data plate hvac water heater" },
  { label: "Demo Reports", href: "/demo-reports", icon: "🧰", group: "Go to", keywords: "sample example" },
  { label: "What's New", href: "/whats-new", icon: "🚀", group: "Go to", keywords: "changelog updates" },
  { label: "Support", href: "/support", icon: "🛟", group: "Go to", keywords: "help feature request chat" },
  { label: "Billing", href: "/billing", icon: "💳", group: "Go to", keywords: "subscription plan payment" },

  // Settings
  { label: "Settings", href: "/settings", icon: "⚙️", group: "Settings", keywords: "profile preferences account" },
  { label: "Pricing Settings", href: "/settings/pricing", icon: "💲", group: "Settings", keywords: "services fees rates" },
  { label: "Company Pricing", href: "/settings/company-pricing", icon: "🏢", group: "Settings", keywords: "team default services" },
  { label: "Company Email", href: "/settings/company-email", icon: "📮", group: "Settings", keywords: "smtp sending domain" },
  { label: "Public Profile", href: "/settings/public-profile", icon: "🌐", group: "Settings", keywords: "booking page bio gallery" },
  { label: "AI Writing Studio", href: "/settings/ai-writing-studio", icon: "🖋️", group: "Settings", keywords: "tone length persona voice" },
  { label: "Report Templates", href: "/settings/report-templates", icon: "🗂️", group: "Settings", keywords: "sections named set" },
  { label: "Custom Severities", href: "/settings/severities", icon: "🎚️", group: "Settings", keywords: "levels colors rename" },
  { label: "Developer API", href: "/settings/developer", icon: "🔑", group: "Settings", keywords: "api keys webhooks zapier" },
  { label: "Integrations", href: "/settings/integrations", icon: "🔌", group: "Settings", keywords: "quickbooks google calendar connect" },
  { label: "Marketing Images", href: "/settings/marketing-images", icon: "🖼️", group: "Settings", keywords: "social share graphics" },

  // Owner / admin (platform owner only)
  { label: "Owner Dashboard", href: "/dashboard/owner", icon: "👑", group: "Owner", keywords: "admin", ownerOnly: true },
  { label: "Mail & Conversations", href: "/dashboard/owner/mail", icon: "📨", group: "Owner", keywords: "inbox replies threads", ownerOnly: true },
  { label: "Inspectors", href: "/dashboard/owner/inspectors", icon: "🧑", group: "Owner", keywords: "team", ownerOnly: true },
  { label: "Companies", href: "/dashboard/owner/companies", icon: "🏬", group: "Owner", keywords: "tenants accounts", ownerOnly: true },
  { label: "Users", href: "/dashboard/owner/users", icon: "👥", group: "Owner", keywords: "accounts", ownerOnly: true },
  { label: "Devices", href: "/dashboard/owner/devices", icon: "📲", group: "Owner", keywords: "push tokens", ownerOnly: true },
  { label: "Push", href: "/dashboard/owner/push", icon: "🔔", group: "Owner", keywords: "notifications broadcast", ownerOnly: true },
  { label: "Revenue", href: "/dashboard/owner/revenue", icon: "💰", group: "Owner", keywords: "mrr subscriptions", ownerOnly: true },
  { label: "Refunds", href: "/dashboard/owner/refunds", icon: "↩️", group: "Owner", keywords: "stripe money back", ownerOnly: true },
  { label: "Live", href: "/dashboard/owner/live", icon: "🟢", group: "Owner", keywords: "activity realtime", ownerOnly: true },
  { label: "System", href: "/dashboard/owner/system", icon: "🖥️", group: "Owner", keywords: "health status", ownerOnly: true },
  { label: "Suggestions", href: "/dashboard/owner/suggestions", icon: "💡", group: "Owner", keywords: "feature requests feedback", ownerOnly: true },
  { label: "Changelog", href: "/dashboard/owner/changelog", icon: "📝", group: "Owner", keywords: "release notes publish", ownerOnly: true },
  { label: "Owner Support", href: "/dashboard/owner/support", icon: "🎧", group: "Owner", keywords: "inspector chat tickets", ownerOnly: true },
  { label: "Admin Logs", href: "/admin/logs", icon: "🪵", group: "Owner", keywords: "security events audit", ownerOnly: true },
];

const GROUP_ORDER: Command["group"][] = ["Reports", "Actions", "Go to", "Settings", "More", "Owner"];

// Turn a bare route into a reasonable command when it isn't curated above — so a
// brand-new page is still findable in search the moment it exists.
function synthesize(href: string): Command {
  const segs = href.split("/").filter(Boolean);
  const ownerOnly = href.startsWith("/dashboard/owner") || href.startsWith("/admin");
  const group: Command["group"] = ownerOnly ? "Owner" : href.startsWith("/settings") ? "Settings" : "More";
  const last = segs[segs.length - 1] || "home";
  const label = last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const icon = ownerOnly ? "👑" : group === "Settings" ? "⚙️" : "📄";
  return { label, href, icon, group, keywords: segs.join(" "), ownerOnly };
}

// Curated entries win; every other real route is auto-added. This means the
// list can never silently miss a page — the generator (predev/prebuild) keeps
// GENERATED_ROUTES current, and anything new shows up under "More" until it's
// given a nicer label here.
const CURATED_HREFS = new Set(COMMANDS.map((c) => c.href));
const ALL_COMMANDS: Command[] = [
  ...COMMANDS,
  ...GENERATED_ROUTES.filter((href) => !CURATED_HREFS.has(href)).map(synthesize),
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [liveResults, setLiveResults] = useState<Command[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve platform-owner once so owner/admin destinations only show for them.
  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        const email = String(data?.user?.email || "").toLowerCase();
        if (!cancelled) setIsOwner(OWNER_EMAILS.includes(email));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const available = useMemo(() => ALL_COMMANDS.filter((c) => !c.ownerOnly || isOwner), [isOwner]);

  // Live "jump to a report" search — hits the scoped inspections endpoint as the
  // user types (debounced), so typing an address lands them on that report.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setLiveResults([]);
      return;
    }
    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/inspections/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}) as any);
        if (Array.isArray(data.results)) {
          setLiveResults(
            data.results.map((r: any) => ({
              label: r.label,
              href: r.href,
              sublabel: r.sublabel,
              icon: "📋",
              group: "Reports" as const,
            })),
          );
        }
      } catch {
        /* aborted or failed — leave prior results */
      }
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(id);
    };
  }, [query]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = !q
      ? available
      : available.filter((command) =>
          `${command.label} ${command.keywords || ""} ${command.group}`.toLowerCase().includes(q),
        );
    // Live report hits first, then the static destinations — all grouped.
    return [...liveResults, ...matched].sort(
      (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
    );
  }, [query, available, liveResults]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const run = useCallback(
    (command: Command) => {
      close();
      router.push(command.href);
    },
    [close, router],
  );

  // Global ⌘K / Ctrl+K toggle.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("flow:open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("flow:open-command-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setActive(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  let prevGroup: string | null = null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--fl-raised)] px-4 py-3">
          <span className="text-[var(--fl-faint)]">🔎</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              } else if (event.key === "Enter" && results[active]) {
                event.preventDefault();
                run(results[active]);
              }
            }}
            placeholder="Search FLOW — jump anywhere, start anything…"
            className="flex-1 bg-transparent text-base text-[var(--fl-text)] outline-none placeholder:text-[var(--fl-faint)]"
          />
          <kbd className="rounded-md border border-[var(--fl-line)] px-2 py-1 text-xs font-semibold text-[var(--fl-faint)]">
            ESC
          </kbd>
        </div>

        <div className="max-h-[56vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--fl-faint)]">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((command, index) => {
              const showHeader = command.group !== prevGroup;
              prevGroup = command.group;
              return (
                <div key={command.href}>
                  {showHeader && (
                    <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--fl-faint)]">
                      {command.group}
                    </p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(command)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      index === active ? "bg-teal-500/15" : "hover:bg-[var(--fl-raised)]"
                    }`}
                  >
                    <span className="text-lg">{command.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[var(--fl-text)]">{command.label}</span>
                      {command.sublabel && (
                        <span className="block truncate text-xs text-[var(--fl-muted)]">{command.sublabel}</span>
                      )}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
