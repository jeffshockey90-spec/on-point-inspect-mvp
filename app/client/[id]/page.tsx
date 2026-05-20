"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function ClientPortalPage() {
  const params = useParams();
  const inspectionId = params.id as string;

  const [inspection, setInspection] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInspection();
  }, [inspectionId]);

  async function loadInspection() {
    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", inspectionId)
      .single();

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setInspection(data);
    setLoading(false);
  }

  async function updateStatus(field: string, value: string) {
    const res = await fetch("/api/update-client-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inspectionId,
        field,
        value,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to update status");
      return;
    }

    await loadInspection();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading client portal...
      </main>
    );
  }

  if (!inspection) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Inspection not found.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h1 className="text-4xl font-bold text-teal-400">
            Client Portal
          </h1>

          <p className="text-zinc-400 mt-2">
            On Point Home Inspections
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-2xl font-bold">
            Inspection Details
          </h2>

          <p>
            <strong>Property:</strong>{" "}
            {inspection.property_address || inspection.address || "N/A"}
          </p>

          <p>
            <strong>Client:</strong>{" "}
            {inspection.client_name || "N/A"}
          </p>

          <p>
            <strong>Date:</strong>{" "}
            {inspection.inspection_date || "N/A"}
          </p>

          <p>
            <strong>Time:</strong>{" "}
            {inspection.inspection_time || "N/A"}
          </p>

          <p>
            <strong>Status:</strong>{" "}
            {inspection.report_status || "Draft"}
          </p>

          <p>
            <strong>Price:</strong>{" "}
            {inspection.price ? `$${inspection.price}` : "N/A"}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <PortalCard
            title="Agreement"
            status={inspection.agreement_status || "Pending"}
          />

          <PortalCard
            title="Payment"
            status={inspection.payment_status || "Pending"}
          />

          <PortalCard
            title="Report"
            status={inspection.report_status || "Draft"}
          />

          <PortalCard
            title="Review"
            status={inspection.review_status || "Not Requested"}
          />
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-2xl font-bold mb-6">
            Client Actions
          </h2>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={() =>
                updateStatus("agreement_status", "Signed")
              }
              className="rounded-xl bg-teal-500 px-6 py-3 font-bold text-black hover:bg-teal-400"
            >
              Sign Agreement
            </button>

            <button
              onClick={() =>
                updateStatus("payment_status", "Paid")
              }
              className="rounded-xl bg-green-500 px-6 py-3 font-bold text-black hover:bg-green-400"
            >
              Pay Invoice
            </button>

            <button
              onClick={() =>
                updateStatus("review_status", "Submitted")
              }
              className="rounded-xl bg-yellow-500 px-6 py-3 font-bold text-black hover:bg-yellow-400"
            >
              Leave Review
            </button>

            <a
              href={`/reports/${inspectionId}`}
              target="_blank"
              className="rounded-xl bg-white px-6 py-3 font-bold text-black hover:bg-zinc-200"
            >
              View Report PDF
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

function PortalCard({
  title,
  status,
}: {
  title: string;
  status: string;
}) {
  const green =
    status === "Signed" ||
    status === "Paid" ||
    status === "Published" ||
    status === "Submitted";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
      <p className="text-sm text-zinc-400">{title}</p>

      <p
        className={`text-xl font-bold mt-2 ${
          green ? "text-green-400" : "text-teal-400"
        }`}
      >
        {status}
      </p>
    </div>
  );
}