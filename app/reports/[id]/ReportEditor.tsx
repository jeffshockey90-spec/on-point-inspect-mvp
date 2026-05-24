"use client";

import Link from "next/link";
import ReportFindingsSortable from "./ReportFindingsSortable";

export default function ReportEditor({
  inspectionId,
}: {
  inspectionId: string;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Report Editor</h2>

            <p className="mt-2 text-sm text-slate-400">
              Add findings, photos, AI comments, and organize the inspection
              report.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/reports/${inspectionId}/summary`}
              className="rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm font-bold text-teal-300 hover:bg-teal-500/20"
            >
              View Summary
            </Link>

            <Link
              href={`/repair-request/${inspectionId}`}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-slate-200 hover:border-teal-400"
            >
              Repair Request
            </Link>
          </div>
        </div>
      </div>

      <ReportFindingsSortable inspectionId={inspectionId} />
    </div>
  );
}