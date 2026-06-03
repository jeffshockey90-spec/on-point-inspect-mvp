"use client";

import { useMemo, useState } from "react";

type InspectionOption = {
  id: string;
  label: string;
};

export default function SendRealtorReportDropdown({
  realtorEmail,
  inspections,
}: {
  realtorEmail?: string | null;
  inspections: InspectionOption[];
}) {
  const [selectedInspectionId, setSelectedInspectionId] = useState("");
  const [sending, setSending] = useState(false);

  const selectedInspection = useMemo(() => {
    return inspections.find(
      (inspection) => inspection.id === selectedInspectionId
    );
  }, [inspections, selectedInspectionId]);

  async function checkDeliveryRequirements(inspectionId: string) {
    const res = await fetch(
      `/api/report-delivery-status?inspection_id=${inspectionId}`
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Could not check delivery requirements.");
    }

    if (!data.canDeliver) {
      throw new Error(
        `Report email is blocked until requirements are complete:\n\n${(
          data.blockers || []
        ).join("\n")}`
      );
    }

    return data;
  }

  async function sendReport() {
    if (!realtorEmail) {
      alert("This realtor does not have an email address saved.");
      return;
    }

    if (!selectedInspectionId) {
      alert("Select an inspection first.");
      return;
    }

    const confirmed = window.confirm(
      `Send ${
        selectedInspection?.label || "this report"
      } to ${realtorEmail}?`
    );

    if (!confirmed) return;

    setSending(true);

    try {
      await checkDeliveryRequirements(selectedInspectionId);

      const res = await fetch("/api/send-report-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId: selectedInspectionId,
          recipientType: "realtor",
          recipientEmail: realtorEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Report email failed to send.");
        return;
      }

      alert(data.message || `Report sent to ${realtorEmail}.`);
    } catch (error: any) {
      alert(error?.message || "Report email failed to send.");
    } finally {
      setSending(false);
    }
  }

  if (!inspections.length) {
    return (
      <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-slate-400">
        No inspections are linked to this realtor yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-[#020817]/70 p-5">
      <label className="block">
        <span className="mb-2 block text-sm font-black uppercase tracking-wide text-slate-400">
          Select Realtor Inspection
        </span>

        <select
          value={selectedInspectionId}
          onChange={(e) => setSelectedInspectionId(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 font-bold text-white outline-none focus:border-purple-400"
        >
          <option value="">Choose an inspection...</option>

          {inspections.map((inspection) => (
            <option key={inspection.id} value={inspection.id}>
              {inspection.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={sendReport}
          disabled={
            sending || !realtorEmail || !selectedInspectionId
          }
          className="w-full rounded-xl bg-purple-500 px-5 py-3 font-black text-white transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {sending ? "Checking..." : "📧 Send Report To Realtor"}
        </button>

        {selectedInspectionId && (
          <a
            href={`/reports/${selectedInspectionId}`}
            className="w-full rounded-xl border border-teal-500 px-5 py-3 text-center font-black text-teal-300 transition hover:bg-teal-500/10 sm:w-auto"
          >
            Open Selected Report
          </a>
        )}
      </div>

      {!realtorEmail && (
        <p className="mt-3 text-sm font-bold text-yellow-300">
          Add an email address to this realtor before sending reports.
        </p>
      )}
    </div>
  );
}