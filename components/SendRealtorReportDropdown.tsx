"use client";

import { useMemo, useState } from "react";

 type InspectionOption = {
  id: string;
  label: string;
};

type MessageType = "success" | "error" | "warning" | "";

export default function SendRealtorReportDropdown({
  realtorEmail,
  inspections,
}: {
  realtorEmail?: string | null;
  inspections: InspectionOption[];
}) {
  const [selectedInspectionId, setSelectedInspectionId] = useState("");
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("📧 Send Report To Realtor");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");

  const selectedInspection = useMemo(() => {
    return inspections.find(
      (inspection) => inspection.id === selectedInspectionId
    );
  }, [inspections, selectedInspectionId]);

  function showMessage(type: MessageType, text: string) {
    setMessageType(type);
    setMessage(text);
  }

  function clearMessage() {
    setMessageType("");
    setMessage("");
  }

  async function checkDeliveryRequirements(inspectionId: string) {
    setStatusText("Checking Requirements...");

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
    if (sending) return;

    clearMessage();

    if (!realtorEmail) {
      showMessage("error", "This realtor does not have an email address saved.");
      return;
    }

    if (!selectedInspectionId) {
      showMessage("warning", "Select an inspection first.");
      return;
    }

    const confirmed = window.confirm(
      `Send ${
        selectedInspection?.label || "this report"
      } to ${realtorEmail}?`
    );

    if (!confirmed) return;

    setSending(true);
    setStatusText("Starting...");

    try {
      await checkDeliveryRequirements(selectedInspectionId);

      setStatusText("Sending...");

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
        throw new Error(data.error || "Report email failed to send.");
      }

      setStatusText("Sent!");
      showMessage("success", data.message || `Report sent to ${realtorEmail}.`);
    } catch (error: any) {
      setStatusText("Failed");
      showMessage("error", error?.message || "Report email failed to send.");
    } finally {
      window.setTimeout(() => {
        setSending(false);
        setStatusText("📧 Send Report To Realtor");
      }, 900);
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
          onChange={(e) => {
            setSelectedInspectionId(e.target.value);
            clearMessage();
          }}
          disabled={sending}
          className="w-full rounded-xl border border-slate-700 bg-[#020617] px-4 py-3 font-bold text-white outline-none focus:border-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
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
          disabled={sending || !realtorEmail || !selectedInspectionId}
          aria-busy={sending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-5 py-3 font-black text-white transition active:scale-[0.98] hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto [touch-action:manipulation]"
        >
          {sending && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {statusText}
        </button>

        {selectedInspectionId && (
          <a
            href={`/reports/${selectedInspectionId}`}
            className="w-full rounded-xl border border-teal-500 px-5 py-3 text-center font-black text-teal-300 transition active:scale-[0.98] hover:bg-teal-500/10 sm:w-auto [touch-action:manipulation]"
          >
            Open Selected Report
          </a>
        )}
      </div>

      {message && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold whitespace-pre-line ${
            messageType === "success"
              ? "border-emerald-500 bg-emerald-950/30 text-emerald-300"
              : messageType === "warning"
                ? "border-yellow-500 bg-yellow-950/30 text-yellow-300"
                : "border-red-500 bg-red-950/30 text-red-300"
          }`}
        >
          {message}
        </div>
      )}

      {!realtorEmail && (
        <p className="mt-3 text-sm font-bold text-yellow-300">
          Add an email address to this realtor before sending reports.
        </p>
      )}
    </div>
  );
}
