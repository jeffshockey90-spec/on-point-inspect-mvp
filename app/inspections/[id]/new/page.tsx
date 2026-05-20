"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

export default function NewInspectionPage() {
  const router = useRouter();

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("MD");
  const [zip, setZip] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [inspectionTime, setInspectionTime] = useState("");
  const [squareFeet, setSquareFeet] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  function calculatePrice(value: string) {
    const sqft = Number(value);

    if (!sqft || sqft <= 0) {
      setPrice("");
      return;
    }

    let total = 500;

    if (sqft > 2000) {
      const extra = sqft - 2000;
      const blocks = Math.ceil(extra / 1000);
      total += blocks * 50;
    }

    setPrice(total);
  }

  async function createInspection() {
    if (!propertyAddress.trim()) {
      alert("Enter property address");
      return;
    }

    try {
      setSaving(true);

      const { data, error } = await supabase
        .from("inspections")
        .insert([
          {
            client_name: clientName || null,
            client_email: clientEmail || null,
            property_address: propertyAddress,
            city: city || null,
            state: state || null,
            zip: zip || null,
            inspection_date: inspectionDate || null,
            inspection_time: inspectionTime || null,
            square_feet: squareFeet ? Number(squareFeet) : null,
            price: price ? Number(price) : null,
            report_status: "Draft",
          },
        ])
        .select()
        .single();

      if (error) {
        console.error(error);
        alert(error.message);
        return;
      }

      router.push(`/inspections/${data.id}`);
    } catch (err) {
      console.error(err);
      alert("Failed to create inspection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        <div>
          <h1 className="text-4xl font-bold text-teal-400">
            Create New Inspection
          </h1>
          <p className="text-zinc-400 mt-2">
            Enter the client and property details.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">

          <div className="grid md:grid-cols-2 gap-4">
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client Name"
              className="bg-black border border-zinc-700 rounded-xl p-3"
            />

            <input
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="Client Email"
              className="bg-black border border-zinc-700 rounded-xl p-3"
            />
          </div>

          <input
            value={propertyAddress}
            onChange={(e) => setPropertyAddress(e.target.value)}
            placeholder="Property Address"
            className="w-full bg-black border border-zinc-700 rounded-xl p-3"
          />

          <div className="grid md:grid-cols-3 gap-4">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="bg-black border border-zinc-700 rounded-xl p-3"
            />

            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="State"
              className="bg-black border border-zinc-700 rounded-xl p-3"
            />

            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="Zip"
              className="bg-black border border-zinc-700 rounded-xl p-3"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <input
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
              placeholder="Inspection Date"
              className="bg-black border border-zinc-700 rounded-xl p-3"
            />

            <input
              value={inspectionTime}
              onChange={(e) => setInspectionTime(e.target.value)}
              placeholder="Inspection Time"
              className="bg-black border border-zinc-700 rounded-xl p-3"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <input
              value={squareFeet}
              onChange={(e) => {
                setSquareFeet(e.target.value);
                calculatePrice(e.target.value);
              }}
              placeholder="Square Feet"
              className="bg-black border border-zinc-700 rounded-xl p-3"
            />

            <input
              value={price}
              onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : "")}
              placeholder="Price"
              className="bg-black border border-zinc-700 rounded-xl p-3"
            />
          </div>

          <button
            onClick={createInspection}
            disabled={saving}
            className="bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl px-6 py-3 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Inspection"}
          </button>

        </div>
      </div>
    </main>
  );
}