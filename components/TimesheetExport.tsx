"use client";

import { Download } from "lucide-react";
import { saveOrShareFile } from "../lib/saveFile";

type Row = {
  inspector: string;
  date: string;
  property: string;
  arrived: string;
  departed: string;
  hours: string;
};

// Client-side CSV export of the timesheet rows (desktop blob download).
export default function TimesheetExport({
  rows,
  filename,
}: {
  rows: Row[];
  filename: string;
}) {
  function download() {
    const header = ["Inspector", "Date", "Property", "Arrived", "Departed", "Hours"];
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.map(esc).join(",")].concat(
      rows.map((r) =>
        [r.inspector, r.date, r.property, r.arrived, r.departed, r.hours].map(esc).join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    // Share sheet in the iOS/Android app (a plain download does nothing there).
    void saveOrShareFile(blob, filename, { title: "Timesheet" });
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={rows.length === 0}
      className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition enabled:hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Download className="h-4 w-4" />
      Export CSV
    </button>
  );
}
