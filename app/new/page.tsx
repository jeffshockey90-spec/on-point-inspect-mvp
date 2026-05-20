"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

declare global {
  interface Window {
    google: any;
  }
}

const timeOptions = [
  { value: "08:00", label: "8:00 AM" },
  { value: "08:30", label: "8:30 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "09:30", label: "9:30 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "10:30", label: "10:30 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "11:30", label: "11:30 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "12:30", label: "12:30 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "13:30", label: "1:30 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "14:30", label: "2:30 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "15:30", label: "3:30 PM" },
  { value: "16:00", label: "4:00 PM" },
  { value: "16:30", label: "4:30 PM" },
  { value: "17:00", label: "5:00 PM" },
];

function calculateInspectionPrice(squareFeet: string) {
  const sqft = Number(squareFeet);

  if (!sqft || sqft <= 2000) {
    return "500";
  }

  const extraThousands = Math.ceil((sqft - 2000) / 1000);
  const price = 500 + extraThousands * 50;

  return String(price);
}

function buildDateOptions() {
  const dates = [];

  for (let i = 0; i < 90; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);

    const value = date.toISOString().split("T")[0];

    const label = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    dates.push({ value, label });
  }

  return dates;
}

export default function NewInspectionPage() {
  const router = useRouter();
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const dateOptions = buildDateOptions();

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const [realtorName, setRealtorName] = useState("");
  const [realtorEmail, setRealtorEmail] = useState("");

  const [propertyAddress, setPropertyAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateValue, setStateValue] = useState("MD");
  const [zip, setZip] = useState("");

  const [inspectionDate, setInspectionDate] = useState("");
  const [inspectionTime, setInspectionTime] = useState("");

  const [squareFeet, setSquareFeet] = useState("");
  const [price, setPrice] = useState("500");
  const [services, setServices] = useState("Home Inspection");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [loadingProperty, setLoadingProperty] = useState(false);

  useEffect(() => {
    loadGooglePlaces();
  }, []);

  useEffect(() => {
    setPrice(calculateInspectionPrice(squareFeet));
  }, [squareFeet]);

  function loadGooglePlaces() {
    if (window.google?.maps?.places) {
      setupAutocomplete();
      return;
    }

    const existingScript = document.getElementById("google-places-script");
    if (existingScript) return;

    const script = document.createElement("script");
    script.id = "google-places-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = setupAutocomplete;

    document.body.appendChild(script);
  }

  async function autofillPropertyDetails(
    address: string,
    cityName: string,
    stateName: string,
    zipCode: string
  ) {
    try {
      setLoadingProperty(true);

      const res = await fetch("/api/property-lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address,
          city: cityName,
          state: stateName,
          zip: zipCode,
        }),
      });

      if (!res.ok) return;

      const data = await res.json();

      if (data.square_feet || data.squareFeet || data.livingArea) {
        const sqft = String(data.square_feet || data.squareFeet || data.livingArea);
        setSquareFeet(sqft);
        setPrice(calculateInspectionPrice(sqft));
      }
    } catch (error) {
      console.log("Property autofill skipped:", error);
    } finally {
      setLoadingProperty(false);
    }
  }

  function setupAutocomplete() {
    if (!addressInputRef.current || !window.google?.maps?.places) return;

    const autocomplete = new window.google.maps.places.Autocomplete(
      addressInputRef.current,
      {
        types: ["address"],
        componentRestrictions: { country: "us" },
        fields: ["address_components", "formatted_address"],
      }
    );

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();

      if (!place.address_components) return;

      let streetNumber = "";
      let route = "";
      let locality = "";
      let adminArea = "";
      let postalCode = "";

      place.address_components.forEach((component: any) => {
        const types = component.types;

        if (types.includes("street_number")) streetNumber = component.long_name;
        if (types.includes("route")) route = component.long_name;
        if (types.includes("locality")) locality = component.long_name;
        if (types.includes("administrative_area_level_1")) adminArea = component.short_name;
        if (types.includes("postal_code")) postalCode = component.long_name;
      });

      const streetAddress = `${streetNumber} ${route}`.trim();

      setPropertyAddress(streetAddress || place.formatted_address || "");
      setCity(locality);
      setStateValue(adminArea || "MD");
      setZip(postalCode);

      autofillPropertyDetails(
        streetAddress || place.formatted_address || "",
        locality,
        adminArea || "MD",
        postalCode
      );
    });
  }

  async function scheduleInspection() {
    if (!clientName || !propertyAddress || !inspectionDate || !inspectionTime) {
      alert("Client name, address, date, and time are required.");
      return;
    }

    try {
      setSaving(true);

      const { data, error } = await supabase
        .from("inspections")
        .insert([
          {
            client_name: clientName,
            client_email: clientEmail,
            client_phone: clientPhone,
            realtor_name: realtorName,
            realtor_email: realtorEmail,
            property_address: propertyAddress,
            city,
            state: stateValue,
            zip,
            inspection_date: inspectionDate,
            inspection_time: inspectionTime,
            inspection_status: "Scheduled",
            square_feet: squareFeet ? Number(squareFeet) : null,
            price: price ? Number(price) : 500,
            services,
            notes,
            report_status: "Draft",
          },
        ])
        .select()
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      router.push(`/inspections/${data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-10">
      <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-800 bg-[#050816] p-6 md:p-8">
        <h1 className="text-4xl font-bold text-teal-400">
          Schedule Inspection
        </h1>

        <div className="mt-8 grid gap-5">
          <h2 className="text-2xl font-bold text-white">Client Info</h2>

          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Client Name"
            className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
          />

          <input
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            placeholder="Client Email"
            className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
          />

          <input
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            placeholder="Client Phone"
            className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
          />

          <h2 className="pt-4 text-2xl font-bold text-white">Realtor Info</h2>

          <input
            value={realtorName}
            onChange={(e) => setRealtorName(e.target.value)}
            placeholder="Realtor Name"
            className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
          />

          <input
            value={realtorEmail}
            onChange={(e) => setRealtorEmail(e.target.value)}
            placeholder="Realtor Email"
            className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
          />

          <h2 className="pt-4 text-2xl font-bold text-white">Property Info</h2>

          <input
            ref={addressInputRef}
            value={propertyAddress}
            onChange={(e) => setPropertyAddress(e.target.value)}
            placeholder="Start typing property address..."
            className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
          />

          <div className="grid gap-5 md:grid-cols-3">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
            />

            <select
              value={stateValue}
              onChange={(e) => setStateValue(e.target.value)}
              className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
            >
              <option value="MD">MD</option>
              <option value="WV">WV</option>
              <option value="PA">PA</option>
            </select>

            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="Zip"
              className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
            />
          </div>

          <h2 className="pt-4 text-2xl font-bold text-white">
            Schedule Details
          </h2>

          <div className="grid gap-5 md:grid-cols-2">
            <select
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
              className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
            >
              <option value="">Select Date</option>
              {dateOptions.map((date) => (
                <option key={date.value} value={date.value}>
                  {date.label}
                </option>
              ))}
            </select>

            <select
              value={inspectionTime}
              onChange={(e) => setInspectionTime(e.target.value)}
              className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
            >
              <option value="">Select Time</option>
              {timeOptions.map((time) => (
                <option key={time.value} value={time.value}>
                  {time.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <input
              value={squareFeet}
              onChange={(e) => setSquareFeet(e.target.value)}
              placeholder={loadingProperty ? "Loading square feet..." : "Square Feet"}
              className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
            />

            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price"
              className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
            />
          </div>

          <p className="text-sm text-zinc-500">
            Pricing rule: $500 base up to 2,000 sq ft, then +$50 for each additional 1,000 sq ft.
          </p>

          <input
            value={services}
            onChange={(e) => setServices(e.target.value)}
            placeholder="Services"
            className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
          />

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            rows={4}
            className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
          />

          <button
            onClick={scheduleInspection}
            disabled={saving}
            className="mt-4 rounded-xl bg-teal-500 px-6 py-4 font-bold text-black hover:bg-teal-400 disabled:bg-zinc-700"
          >
            {saving ? "Scheduling..." : "Schedule Inspection"}
          </button>
        </div>
      </div>
    </main>
  );
}