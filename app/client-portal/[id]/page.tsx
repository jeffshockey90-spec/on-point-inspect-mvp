"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

function getPropertyPhoto(inspection: any) {
  return (
    inspection?.property_image ||
    inspection?.street_view_url ||
    inspection?.cover_photo_url ||
    inspection?.google_photo_url ||
    inspection?.property_photo_url ||
    inspection?.place_photo_url ||
    inspection?.photo_url ||
    inspection?.image_url ||
    ""
  );
}

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
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        Loading client portal...
      </main>
    );
  }

  if (!inspection) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        Inspection not found.
      </main>
    );
  }

  const propertyPhoto = getPropertyPhoto(inspection);

  return (
    <main className="min-h-screen bg-[#020617] p-6 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a] shadow-xl">
          {propertyPhoto && (
            <div className="border-b border-slate-800 bg-black">
              <img
                src={propertyPhoto}
                alt="Property"
                className="h-64 w-full object-cover"
              />
            </div>
          )}

          <div className="p-6">
            <h1 className="text-4xl font-extrabold text-teal-400">
              Client Portal
            </h1>

            <p className="mt-2 text-slate-400">
              On Point Home Inspections
            </p>
          </div>
        </div>

        {inspection.report_summary && (
          <div className="rounded-2xl border border-teal-500/40 bg-[#071224] p-6 shadow-xl">
            <h2 className="text-2xl font-extrabold text-teal-300">
              Report Summary
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Summary of notable report findings and recommendations.
            </p>

            <div className="mt-5 whitespace-pre-line rounded-xl border border-slate-700 bg-[#020817]/70 p-5 text-base leading-8 text-slate-100">
              {inspection.report_summary}
            </div>
          </div>
        )}

        <div className="space-y-4 rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="text-2xl font-bold text-teal-300">
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

          {inspection.year_built && (
            <p>
              <strong>Year Built:</strong>{" "}
              {inspection.year_built}
            </p>
          )}

          <p>
            <strong>Status:</strong>{" "}
            {inspection.report_status || "Draft"}
          </p>

          <p>
            <strong>Price:</strong>{" "}
            {inspection.price ? `$${inspection.price}` : "N/A"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
          <h2 className="mb-6 text-2xl font-bold text-teal-300">
            Client Actions
          </h2>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={() =>
                updateStatus("agreement_status", "Signed")
              }
              className="rounded-xl bg-teal-500 px-6 py-3 font-bold text-slate-950 hover:bg-teal-400"
            >
              Sign Agreement
            </button>

            <button
              onClick={() =>
                updateStatus("payment_status", "Paid")
              }
              className="rounded-xl bg-green-500 px-6 py-3 font-bold text-slate-950 hover:bg-green-400"
            >
              Pay Invoice
            </button>

            <button
              onClick={() =>
                updateStatus("review_status", "Submitted")
              }
              className="rounded-xl bg-yellow-500 px-6 py-3 font-bold text-slate-950 hover:bg-yellow-400"
            >
              Leave Review
            </button>

            <a
              href={`/reports/${inspectionId}`}
              target="_blank"
              className="rounded-xl border border-teal-500 bg-[#071224] px-6 py-3 font-bold text-teal-300 hover:bg-teal-500/10"
            >
              View Full Report
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
    <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-xl">
      <p className="text-sm text-slate-400">{title}</p>

      <p
        className={`mt-2 text-xl font-bold ${
          green ? "text-green-400" : "text-teal-400"
        }`}
      >
        {status}
      </p>
    </div>
  );
}