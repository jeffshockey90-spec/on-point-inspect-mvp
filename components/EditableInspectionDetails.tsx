"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function EditableInspectionDetails({
  inspection,
}: {
  inspection: any;
}) {
  const [form, setForm] = useState({
    property_address: inspection.property_address || inspection.address || "",
    client_name: inspection.client_name || "",
    client_email: inspection.client_email || "",
    realtor_name: inspection.realtor_name || "",
    realtor_email: inspection.realtor_email || "",
    inspection_date: inspection.inspection_date || inspection.date || "",
    sqft: inspection.sqft || inspection.square_feet || "",
    house_style: inspection.house_style || "",
    roof_style: inspection.roof_style || "",
    garage: inspection.garage || "",
    weather: inspection.weather || "",
    temperature: inspection.temperature || "",
    attendance: inspection.attendance || "",
    inspection_method: inspection.inspection_method || "",
    occupancy: inspection.occupancy || "",
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function updateField(field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    setSaved(false);
  }

  async function saveDetails() {
    setSaving(true);
    setSaved(false);

    const { error } = await supabase
      .from("inspections")
      .update({
        property_address: form.property_address,
        client_name: form.client_name,
        client_email: form.client_email,
        realtor_name: form.realtor_name,
        realtor_email: form.realtor_email,
        inspection_date: form.inspection_date,
        sqft: form.sqft,
        house_style: form.house_style,
        roof_style: form.roof_style,
        garage: form.garage,
        weather: form.weather,
        temperature: form.temperature,
        attendance: form.attendance,
        inspection_method: form.inspection_method,
        occupancy: form.occupancy,
      })
      .eq("id", inspection.id);

    setSaving(false);

    if (error) {
      alert("Error saving inspection details.");
      console.error(error);
      return;
    }

    setSaved(true);
  }

  return (
    <section className="mt-10 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-6 print:border-slate-400 print:bg-white print:text-black">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">
          Inspection Details
        </h2>

        <button
          type="button"
          onClick={saveDetails}
          disabled={saving}
          className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-black transition hover:bg-teal-400 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Details"}
        </button>
      </div>

      {saved && (
        <p className="mb-4 rounded-xl border border-green-500/40 bg-green-500/10 p-3 text-sm font-bold text-green-300 print:hidden">
          Inspection details saved.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-4 text-xl font-bold text-[var(--fl-accent-text)] print:text-black">
            Inspection Information
          </h3>

          <div className="space-y-4">
            <DetailInput
              label="Property Address"
              value={form.property_address}
              onChange={(value) =>
                updateField("property_address", value)
              }
            />

            <DetailInput
              label="Client"
              value={form.client_name}
              onChange={(value) =>
                updateField("client_name", value)
              }
            />

            <DetailInput
              label="Client Email"
              value={form.client_email}
              onChange={(value) =>
                updateField("client_email", value)
              }
            />

            <DetailInput
              label="Realtor"
              value={form.realtor_name}
              onChange={(value) =>
                updateField("realtor_name", value)
              }
            />

            <DetailInput
              label="Realtor Email"
              value={form.realtor_email}
              onChange={(value) =>
                updateField("realtor_email", value)
              }
            />

            <DetailInput
              label="Inspection Date"
              value={form.inspection_date}
              onChange={(value) =>
                updateField("inspection_date", value)
              }
            />
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-xl font-bold text-[var(--fl-accent-text)] print:text-black">
            Property / Site Information
          </h3>

          <div className="space-y-4">
            <DetailInput
              label="Square Feet"
              value={form.sqft}
              onChange={(value) => updateField("sqft", value)}
            />

            <DetailInput
              label="House Style"
              value={form.house_style}
              onChange={(value) =>
                updateField("house_style", value)
              }
            />

            <DetailInput
              label="Roof Style"
              value={form.roof_style}
              onChange={(value) =>
                updateField("roof_style", value)
              }
            />

            <DetailInput
              label="Garage"
              value={form.garage}
              onChange={(value) => updateField("garage", value)}
            />

            <DetailInput
              label="Weather"
              value={form.weather}
              onChange={(value) => updateField("weather", value)}
            />

            <DetailInput
              label="Temperature"
              value={form.temperature}
              onChange={(value) =>
                updateField("temperature", value)
              }
            />

            <DetailInput
              label="Attendance"
              value={form.attendance}
              onChange={(value) =>
                updateField("attendance", value)
              }
            />

            <DetailInput
              label="Inspection Method"
              value={form.inspection_method}
              onChange={(value) =>
                updateField("inspection_method", value)
              }
            />

            <DetailInput
              label="Occupancy"
              value={form.occupancy}
              onChange={(value) =>
                updateField("occupancy", value)
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-[var(--fl-muted)] print:text-black">
        {label}
      </span>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none transition focus:border-teal-400 print:border-none print:bg-white print:p-0 print:text-black"
      />
    </label>
  );
}