"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Inspection = {
  id: string;
  address: string;
  client_name: string;
  client_email: string;
  inspection_date: string;
  inspection_time: string;
};

type EmailType =
  | "inspection_confirmation"
  | "agreement_reminder"
  | "payment_reminder"
  | "report_published"
  | "review_request";

export default function EmailWorkflowPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [selectedInspection, setSelectedInspection] = useState("");

  const [emailType, setEmailType] =
    useState<EmailType>("inspection_confirmation");

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [inspectionTime, setInspectionTime] = useState("");
  const [reportLink, setReportLink] = useState("");

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadInspections();
  }, []);

  async function loadInspections() {
    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setInspections(data || []);
  }

  function handleInspectionSelect(id: string) {
    setSelectedInspection(id);

    const inspection = inspections.find((i) => i.id === id);

    if (!inspection) return;

    setClientName(inspection.client_name || "");
    setClientEmail(inspection.client_email || "");
    setPropertyAddress(inspection.address || "");
    setInspectionDate(inspection.inspection_date || "");
    setInspectionTime(inspection.inspection_time || "");
  }

  async function generateEmail() {
    setLoading(true);

    try {
      const res = await fetch("/api/email-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emailType,
          clientName,
          propertyAddress,
          inspectionDate,
          inspectionTime,
          reportLink,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed");
        return;
      }

      setSubject(data.subject);
      setMessage(data.message);
    } catch (error) {
      console.error(error);
      alert("Error generating email");
    } finally {
      setLoading(false);
    }
  }

  async function copyEmail() {
    const full = `Subject: ${subject}\n\n${message}`;

    await navigator.clipboard.writeText(full);

    alert("Copied");
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        <div>
          <h1 className="text-4xl font-bold">
            Email + Client Workflow
          </h1>

          <p className="text-zinc-400 mt-2">
            Generate client and realtor workflow emails.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">

          <div>
            <label className="block mb-2 text-sm text-zinc-400">
              Select Inspection
            </label>

            <select
              value={selectedInspection}
              onChange={(e) => handleInspectionSelect(e.target.value)}
              className="w-full bg-black border border-zinc-700 rounded-xl p-3"
            >
              <option value="">Choose Inspection</option>

              {inspections.map((inspection) => (
                <option
                  key={inspection.id}
                  value={inspection.id}
                >
                  {inspection.address}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-2 text-sm text-zinc-400">
              Email Type
            </label>

            <select
              value={emailType}
              onChange={(e) =>
                setEmailType(e.target.value as EmailType)
              }
              className="w-full bg-black border border-zinc-700 rounded-xl p-3"
            >
              <option value="inspection_confirmation">
                Inspection Confirmation
              </option>

              <option value="agreement_reminder">
                Agreement Reminder
              </option>

              <option value="payment_reminder">
                Payment Reminder
              </option>

              <option value="report_published">
                Report Published
              </option>

              <option value="review_request">
                Review Request
              </option>
            </select>
          </div>

          <div className="grid md:grid-cols-2 gap-4">

            <div>
              <label className="block mb-2 text-sm text-zinc-400">
                Client Name
              </label>

              <input
                value={clientName}
                onChange={(e) =>
                  setClientName(e.target.value)
                }
                className="w-full bg-black border border-zinc-700 rounded-xl p-3"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-400">
                Client Email
              </label>

              <input
                value={clientEmail}
                onChange={(e) =>
                  setClientEmail(e.target.value)
                }
                className="w-full bg-black border border-zinc-700 rounded-xl p-3"
              />
            </div>

          </div>

          <div>
            <label className="block mb-2 text-sm text-zinc-400">
              Property Address
            </label>

            <input
              value={propertyAddress}
              onChange={(e) =>
                setPropertyAddress(e.target.value)
              }
              className="w-full bg-black border border-zinc-700 rounded-xl p-3"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">

            <div>
              <label className="block mb-2 text-sm text-zinc-400">
                Inspection Date
              </label>

              <input
                value={inspectionDate}
                onChange={(e) =>
                  setInspectionDate(e.target.value)
                }
                className="w-full bg-black border border-zinc-700 rounded-xl p-3"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-400">
                Inspection Time
              </label>

              <input
                value={inspectionTime}
                onChange={(e) =>
                  setInspectionTime(e.target.value)
                }
                className="w-full bg-black border border-zinc-700 rounded-xl p-3"
              />
            </div>

          </div>

          <div>
            <label className="block mb-2 text-sm text-zinc-400">
              Report Link
            </label>

            <input
              value={reportLink}
              onChange={(e) =>
                setReportLink(e.target.value)
              }
              className="w-full bg-black border border-zinc-700 rounded-xl p-3"
            />
          </div>

          <button
            onClick={generateEmail}
            disabled={loading}
            className="bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl px-6 py-3"
          >
            {loading ? "Generating..." : "Generate Email"}
          </button>

        </div>

        {subject && message && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">

            <div>
              <label className="block mb-2 text-sm text-zinc-400">
                Subject
              </label>

              <input
                value={subject}
                onChange={(e) =>
                  setSubject(e.target.value)
                }
                className="w-full bg-black border border-zinc-700 rounded-xl p-3"
              />
            </div>

            <div>
              <label className="block mb-2 text-sm text-zinc-400">
                Message
              </label>

              <textarea
                rows={14}
                value={message}
                onChange={(e) =>
                  setMessage(e.target.value)
                }
                className="w-full bg-black border border-zinc-700 rounded-xl p-3"
              />
            </div>

            <button
              onClick={copyEmail}
              className="bg-white text-black hover:bg-zinc-200 rounded-xl px-6 py-3 font-bold"
            >
              Copy Email
            </button>

          </div>
        )}

      </div>
    </main>
  );
}