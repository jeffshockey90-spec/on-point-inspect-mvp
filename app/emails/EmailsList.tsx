"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatAppValue } from "../../lib/app-time";

type EmailLog = {
  id: string | number;
  email_type: string | null;
  recipient: string;
  inspection_id: string | number | null;
  property_address: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  failed_at: string | null;
  status: string | null;
  subject: string | null;
  html: string | null;
  message: string | null;
};

// Remove the invisible open-tracking pixel before previewing, so the inspector
// viewing a sent copy doesn't get counted as the client opening the email.
// (Click-tracking links are already inert: the iframe sandbox blocks navigation.)
function sanitizeForPreview(html: string) {
  return html.replace(/<img[^>]*email-open[^>]*>/gi, "");
}

function formatEmailType(value: string | null) {
  const type = String(value || "").toLowerCase();

  if (type === "appointment_confirmed") return "Schedule Confirmation";
  if (type === "agreement_email") return "Agreement";
  if (type === "agreement_realtor_email") return "Agreement (Realtor Forward)";
  if (type === "inspection_report") return "Report";
  if (type === "environmental_report") return "Environmental Report";
  if (type === "repair_request") return "Repair Request";
  if (type === "review_request") return "Review Request";

  return (
    type
      .split("_")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ") || "Email"
  );
}

function getStatus(log: EmailLog) {
  if (log.bounced_at || log.failed_at || log.status === "failed") {
    return { label: "Failed", tone: "border-red-500/40 bg-red-500/10 text-red-300" };
  }

  if (log.clicked_at) {
    return { label: "Clicked", tone: "border-teal-400/40 bg-teal-500/10 text-teal-200" };
  }

  if (log.opened_at) {
    return { label: "Opened", tone: "border-blue-400/40 bg-blue-500/10 text-blue-200" };
  }

  if (log.delivered_at) {
    return { label: "Delivered", tone: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" };
  }

  return { label: "Sent", tone: "border-slate-600 bg-slate-800/60 text-slate-300" };
}

function formatDate(value: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return formatAppValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TYPE_FILTERS = [
  { value: "all", label: "All Types" },
  { value: "appointment_confirmed", label: "Schedule Confirmation" },
  { value: "agreement_email", label: "Agreement" },
  { value: "agreement_realtor_email", label: "Agreement (Realtor Forward)" },
  { value: "inspection_report", label: "Report" },
  { value: "environmental_report", label: "Environmental Report" },
  { value: "repair_request", label: "Repair Request" },
  { value: "review_request", label: "Review Request" },
];

export default function EmailsList({ logs }: { logs: EmailLog[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return logs.filter((log) => {
      if (typeFilter !== "all" && String(log.email_type || "").toLowerCase() !== typeFilter) {
        return false;
      }

      if (!query) return true;

      return (
        log.recipient.toLowerCase().includes(query) ||
        log.property_address.toLowerCase().includes(query) ||
        formatEmailType(log.email_type).toLowerCase().includes(query)
      );
    });
  }, [logs, search, typeFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by recipient or property address..."
          className="w-full min-w-0 flex-1 rounded-xl border border-slate-700 bg-[#0b1220] p-3 text-white outline-none focus:border-teal-400"
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-[#0b1220] p-3 text-white outline-none focus:border-teal-400 sm:w-64"
        >
          {TYPE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {filtered.length} of {logs.length} emails
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-[#0b1220] p-8 text-center text-slate-400">
          {logs.length === 0 ? "No emails sent yet." : "No emails match your search."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((log) => {
            const status = getStatus(log);
            const expanded = expandedId === log.id;

            return (
              <div
                key={log.id}
                className={`rounded-xl border bg-[#0b1220] transition ${
                  expanded ? "border-teal-500/70" : "border-slate-700"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : log.id)}
                  className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="font-black text-white">{formatEmailType(log.email_type)}</p>
                    <p className="mt-1 truncate text-sm text-slate-400">
                      {log.recipient} · {log.property_address}
                    </p>
                    {log.subject && (
                      <p className="mt-1 truncate text-xs text-slate-500">
                        Subject: {log.subject}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${status.tone}`}
                    >
                      {status.label}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {formatDate(log.sent_at)}
                    </span>
                    <span className="text-xs font-bold text-teal-400">
                      {expanded ? "Hide ▲" : "View email ▼"}
                    </span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-slate-800 p-4">
                    {log.html ? (
                      <iframe
                        title={`Email to ${log.recipient}`}
                        srcDoc={sanitizeForPreview(log.html)}
                        sandbox=""
                        className="h-[520px] w-full rounded-lg border border-slate-700 bg-white"
                      />
                    ) : (
                      <div className="rounded-lg border border-slate-700 bg-[#0f172a] p-4 text-sm text-slate-300">
                        <p className="font-bold text-slate-200">
                          The exact copy of this email wasn&apos;t captured.
                        </p>
                        <p className="mt-1 text-slate-400">
                          Emails are saved in full going forward. Older sends only kept a summary:
                        </p>
                        {log.message && (
                          <p className="mt-2 whitespace-pre-wrap rounded bg-black/30 p-3 text-slate-300">
                            {log.message}
                          </p>
                        )}
                      </div>
                    )}

                    {log.inspection_id && (
                      <Link
                        href={`/reports/${log.inspection_id}`}
                        className="mt-3 inline-block rounded-lg border border-slate-600 px-4 py-2 text-xs font-black text-slate-200 transition hover:border-teal-500/70"
                      >
                        Open inspection →
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
