"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

function formatTime(time: string | null) {
  if (!time) return "No time";

  const [hourStr, minuteStr] = time.split(":");
  let hour = Number(hourStr);
  const minute = minuteStr || "00";

  const ampm = hour >= 12 ? "PM" : "AM";

  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${hour}:${minute} ${ampm}`;
}

function formatDate(date: string | null) {
  if (!date) return "No date";

  const [year, month, day] = date.split("-");

  return `${month}/${day}/${year}`;
}

export default function DashboardPage() {
  const [inspections, setInspections] = useState<any[]>([]);

  useEffect(() => {
    loadInspections();
  }, []);

  async function loadInspections() {
    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .order("inspection_date", { ascending: true })
      .order("inspection_time", { ascending: true });

    if (error) {
      alert(error.message);
      return;
    }

    setInspections(data || []);
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-4xl font-bold text-teal-400">
              Inspection Dashboard
            </h1>
            <p className="mt-2 text-zinc-400">
              View scheduled inspections and open reports.
            </p>
          </div>

          <Link
            href="/new"
            className="rounded-xl bg-teal-500 px-6 py-4 text-center font-bold text-black hover:bg-teal-400"
          >
            Schedule New Inspection
          </Link>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-[#050816] p-6">
          <h2 className="mb-6 text-2xl font-bold text-white">
            Scheduled Inspections
          </h2>

          {inspections.length === 0 ? (
            <p className="text-zinc-500">No inspections scheduled yet.</p>
          ) : (
            <div className="grid gap-4">
              {inspections.map((inspection) => (
                <Link
                  key={inspection.id}
                  href={`/inspections/${inspection.id}`}
                  className="rounded-2xl border border-zinc-800 bg-black p-5 hover:border-teal-500"
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {inspection.property_address || "No address"}
                      </h3>

                      <p className="mt-1 text-zinc-400">
                        {inspection.city}, {inspection.state} {inspection.zip}
                      </p>

                      <p className="mt-3 text-sm text-zinc-500">
                        Client: {inspection.client_name || "N/A"}
                      </p>

                      <p className="text-sm text-zinc-500">
                        Realtor: {inspection.realtor_name || "N/A"}
                      </p>

                      <p className="mt-2 text-sm text-zinc-500">
                        Services: {inspection.services || "Home Inspection"}
                      </p>
                    </div>

                    <div className="text-left md:text-right">
                      <p className="font-bold text-teal-400">
                        {formatDate(inspection.inspection_date)}
                      </p>

                      <p className="text-lg font-bold text-white">
                        {formatTime(inspection.inspection_time)}
                      </p>

                      <p className="mt-2 rounded-full bg-zinc-900 px-3 py-1 text-sm text-zinc-300">
                        {inspection.inspection_status || "Scheduled"}
                      </p>

                      <p className="mt-2 text-sm text-zinc-500">
                        Report: {inspection.report_status || "Draft"}
                      </p>

                      {inspection.price && (
                        <p className="mt-2 text-sm font-bold text-teal-400">
                          ${inspection.price}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}