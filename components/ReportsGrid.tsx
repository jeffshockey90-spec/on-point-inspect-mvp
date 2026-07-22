"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
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
type StatusFilter = "all" | "client-viewed" | "not-viewed" | "email-clicked";

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
  if (status === "client-viewed") return report.activity.clientViewed;
  if (status === "not-viewed") return report.activity.totalViews === 0;
  if (status === "email-clicked") return report.activity.emailClicked;
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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by address, client, or realtor..."
          className="min-w-[220px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-teal-400"
        />

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-bold text-slate-200 outline-none focus:border-teal-400"
        >
          <option value="all">All Reports</option>
          <option value="client-viewed">Client Viewed</option>
          <option value="not-viewed">No Views Yet</option>
          <option value="email-clicked">Email Clicked</option>
        </select>

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortOption)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-bold text-slate-200 outline-none focus:border-teal-400"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="most-viewed">Most Viewed</option>
          <option value="address">Address A-Z</option>
        </select>

        <span className="text-xs font-bold text-slate-500">
          {visibleReports.length} of {reports.length}
        </span>
      </div>

      {visibleReports.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <p className="text-slate-300">
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
              className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl transition duration-150 hover:-translate-y-0.5 hover:border-teal-500/70 hover:bg-[#13213a] hover:shadow-[0_0_28px_rgba(20,184,166,0.14)] active:scale-[0.99]"
            >
              <div className="relative flex h-56 items-center justify-center overflow-hidden bg-slate-950 text-slate-500">
                {!report.propertyPhoto ? (
                  <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm font-bold text-slate-500">
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
                <h2 className="text-2xl font-bold text-white transition group-hover:text-teal-300">
                  {report.address}
                </h2>

                <p className="mt-3 text-slate-300">{report.cityStateZip}</p>

                <div className="mt-5 space-y-2 text-sm text-slate-300">
                  <p>
                    <span className="font-bold text-white">Client:</span>{" "}
                    {report.clientName}
                  </p>

                  <p>
                    <span className="font-bold text-white">Realtor:</span>{" "}
                    {report.realtorName}
                  </p>

                  <p>
                    <span className="font-bold text-white">Inspection Date:</span>{" "}
                    {report.inspectionDate}
                  </p>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-[#020617]/70 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-teal-300">
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
                      <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-300">
                        🔎 Inspector Viewed
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-400">
                    <p>
                      <span className="font-bold text-slate-300">Views:</span>{" "}
                      {report.activity.totalViews}
                    </p>

                    <p>
                      <span className="font-bold text-slate-300">Last View:</span>{" "}
                      {report.activity.lastViewedLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3">
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
          ? "rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-black text-green-300"
          : "rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-black text-slate-400"
      }
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
