"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import FastLinkButton from "./FastLinkButton";
import DeleteInspectionButton from "./DeleteInspectionButton";

export type PreparedReport = {
  id: number | string;
  address: string;
  cityStateZip: string;
  clientName: string;
  realtorName: string;
  inspectionDate: string;
  propertyPhoto: string;
  isInspectorOwner: boolean;
  createdAtMs: number;
  published: boolean;
  paymentComplete: boolean;
  agreementRequiredCount: number;
  agreementUnsignedCount: number;
  activity: {
    totalViews: number;
    clientViewed: boolean;
    realtorViewed: boolean;
    inspectorViewed: boolean;
    emailClicked: boolean;
    lastViewedAt: string | null;
    lastViewedLabel: string;
  };
};

type SortOption = "newest" | "oldest" | "address" | "most-viewed";
type StatusFilter =
  | "all"
  | "draft"
  | "published"
  | "unpaid"
  | "client-viewed"
  | "not-viewed";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
  { key: "unpaid", label: "Unpaid" },
  { key: "client-viewed", label: "Client Viewed" },
  { key: "not-viewed", label: "No Views" },
];

function matchesSearch(report: PreparedReport, query: string) {
  if (!query) return true;

  const haystack = [
    report.address,
    report.cityStateZip,
    report.clientName,
    report.realtorName,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function matchesStatus(report: PreparedReport, status: StatusFilter) {
  if (status === "all") return true;
  if (status === "draft") return !report.published;
  if (status === "published") return report.published;
  if (status === "unpaid") return !report.paymentComplete;
  if (status === "client-viewed") return report.activity.clientViewed;
  if (status === "not-viewed") return report.activity.totalViews === 0;
  return true;
}

export default function ReportsGrid({ reports }: { reports: PreparedReport[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  const visibleReports = useMemo(() => {
    const filtered = reports.filter(
      (report) => matchesSearch(report, search) && matchesStatus(report, status)
    );

    const sorted = [...filtered].sort((a, b) => {
      if (sort === "newest") return b.createdAtMs - a.createdAtMs;
      if (sort === "oldest") return a.createdAtMs - b.createdAtMs;
      if (sort === "most-viewed") return b.activity.totalViews - a.activity.totalViews;
      if (sort === "address") return a.address.localeCompare(b.address);
      return 0;
    });

    return sorted;
  }, [reports, search, status, sort]);

  const counts = useMemo(() => {
    const searched = reports.filter((report) => matchesSearch(report, search));
    return {
      all: searched.length,
      draft: searched.filter((report) => !report.published).length,
      published: searched.filter((report) => report.published).length,
      unpaid: searched.filter((report) => !report.paymentComplete).length,
      "client-viewed": searched.filter((report) => report.activity.clientViewed)
        .length,
      "not-viewed": searched.filter(
        (report) => report.activity.totalViews === 0,
      ).length,
    } as Record<StatusFilter, number>;
  }, [reports, search]);

  return (
    <div>
      <div className="mb-6 space-y-3 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2.5 focus-within:border-teal-400">
            <span className="text-[var(--fl-faint)]">🔎</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by address, client, or realtor..."
              className="flex-1 bg-transparent text-sm text-[var(--fl-text)] placeholder:text-[var(--fl-faint)] outline-none"
            />
          </div>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOption)}
            className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2.5 text-sm font-bold text-[var(--fl-text)] outline-none focus:border-teal-400"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="most-viewed">Most Viewed</option>
            <option value="address">Address A-Z</option>
          </select>

          <span className="text-xs font-bold text-[var(--fl-faint)] tabular-nums">
            {visibleReports.length} of {reports.length}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const isActive = status === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatus(tab.key)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "border-teal-400/60 bg-teal-500/15 text-[var(--fl-accent-text)]"
                    : "border-[var(--fl-line)] bg-[var(--fl-ground)] text-[var(--fl-muted)] hover:border-[var(--fl-faint)] hover:text-[var(--fl-text)]"
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    isActive
                      ? "bg-teal-500/25 text-teal-100"
                      : "bg-[var(--fl-raised)] text-[var(--fl-muted)]"
                  }`}
                >
                  {counts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {visibleReports.length === 0 ? (
        <div className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-8">
          <p className="text-[var(--fl-muted)]">
            {reports.length === 0
              ? "No saved inspections found."
              : "No reports match your search or filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleReports.map((report, index) => (
            <div
              key={report.id}
              className="group relative overflow-hidden rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] shadow-xl transition duration-150 hover:-translate-y-0.5 hover:border-teal-500/70 hover:bg-[#13213a] hover:shadow-[0_0_28px_rgba(20,184,166,0.14)] active:scale-[0.99]"
            >
              {/* Stretched link: makes the whole card clickable (opens the report).
                  The action buttons below sit above this overlay (relative z-20)
                  so Open/Delete still work. */}
              <Link
                href={`/reports/${report.id}`}
                aria-label={`Open report for ${report.address}`}
                className="absolute inset-0 z-10 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              />

              <div className="relative flex h-56 items-center justify-center overflow-hidden bg-[var(--fl-ground)] text-[var(--fl-faint)]">
                {!report.propertyPhoto ? (
                  <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm font-bold text-[var(--fl-faint)]">
                    No Property Photo
                  </span>
                ) : null}

                {report.propertyPhoto ? (
                  <Image
                    src={report.propertyPhoto}
                    alt="Property"
                    fill
                    sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
                    priority={index < 4}
                    className="relative z-10 object-cover transition duration-200 group-hover:scale-[1.03]"
                  />
                ) : null}
              </div>

              <div className="p-6">
                <h2 className="text-2xl font-bold text-[var(--fl-text)] transition group-hover:text-[var(--fl-accent-text)]">
                  {report.address}
                </h2>

                <p className="mt-3 text-[var(--fl-muted)]">{report.cityStateZip}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge
                    good={report.published}
                    goodLabel="✅ Published"
                    badLabel="📝 Draft"
                  />

                  <StatusBadge
                    good={report.paymentComplete}
                    goodLabel="💰 Paid"
                    badLabel="💰 Unpaid"
                  />

                  {report.agreementRequiredCount > 0 && (
                    <StatusBadge
                      good={report.agreementUnsignedCount === 0}
                      goodLabel="📝 Signed"
                      badLabel={`📝 Unsigned (${report.agreementUnsignedCount})`}
                    />
                  )}
                </div>

                <div className="mt-5 space-y-2 text-sm text-[var(--fl-muted)]">
                  <p>
                    <span className="font-bold text-[var(--fl-text)]">Client:</span>{" "}
                    {report.clientName}
                  </p>

                  <p>
                    <span className="font-bold text-[var(--fl-text)]">Realtor:</span>{" "}
                    {report.realtorName}
                  </p>

                  <p>
                    <span className="font-bold text-[var(--fl-text)]">Inspection Date:</span>{" "}
                    {report.inspectionDate}
                  </p>
                </div>

                <div className="mt-5 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
                    Report Engagement
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <EngagementBadge
                      active={report.activity.clientViewed}
                      activeLabel="👤 Client Viewed"
                      inactiveLabel="👤 Client Not Viewed"
                    />

                    <EngagementBadge
                      active={report.activity.realtorViewed}
                      activeLabel="🏡 Realtor Viewed"
                      inactiveLabel="🏡 Realtor Not Viewed"
                    />

                    <EngagementBadge
                      active={report.activity.emailClicked}
                      activeLabel="📧 Email Clicked"
                      inactiveLabel="📧 No Email Click"
                    />

                    {report.activity.inspectorViewed && (
                      <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                        🔎 Inspector Viewed
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-[var(--fl-muted)]">
                    <p>
                      <span className="font-bold text-[var(--fl-muted)]">Views:</span>{" "}
                      {report.activity.totalViews}
                    </p>

                    <p>
                      <span className="font-bold text-[var(--fl-muted)]">Last View:</span>{" "}
                      {report.activity.lastViewedLabel}
                    </p>
                  </div>
                </div>

                <div className="relative z-20 mt-6 flex flex-col gap-3">
                  <FastLinkButton
                    href={`/reports/${report.id}`}
                    loadingText="Opening Report..."
                    className="rounded-xl bg-teal-500 px-5 py-3 text-center font-bold text-black hover:bg-teal-400"
                  >
                    Open Report
                  </FastLinkButton>

                  {report.isInspectorOwner && (
                    <DeleteInspectionButton inspectionId={String(report.id)} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  good,
  goodLabel,
  badLabel,
}: {
  good: boolean;
  goodLabel: string;
  badLabel: string;
}) {
  return (
    <span
      className={
        good
          ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300"
          : "rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300"
      }
    >
      {good ? goodLabel : badLabel}
    </span>
  );
}

function EngagementBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={
        active
          ? "rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-300"
          : "rounded-full border border-[var(--fl-line)] bg-[var(--fl-raised)] px-3 py-1 text-xs font-semibold text-[var(--fl-muted)]"
      }
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
