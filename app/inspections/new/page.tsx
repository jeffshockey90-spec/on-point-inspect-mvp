"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCompanyId } from "../../../lib/getCompanyId";

declare global {
  interface Window {
    google: any;
  }
}

const timeOptions = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00",
];

function formatTime(value: string) {
  if (!value) return "";
  const [hour, minute] = value.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute));

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function calculateInspectionPrice(squareFeet: string) {
  const sqft = Number(squareFeet);
  if (!sqft || sqft <= 2000) return "500";
  return String(500 + Math.ceil((sqft - 2000) / 1000) * 50);
}

export default function NewInspectionPage() {
  const router = useRouter();
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

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

  const [yearBuilt, setYearBuilt] = useState("");
  const [propertyStyle, setPropertyStyle] = useState("");
  const [roofStyle, setRoofStyle] = useState("");
  const [propertyImage, setPropertyImage] = useState("");

  const [loadingProperty, setLoadingProperty] = useState(false);
  const [saving, setSaving] = useState(false);

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

      const sqft =
        data.square_feet ||
        data.squareFeet ||
        data.livingArea ||
        data.living_area;

      if (sqft) {
        setSquareFeet(String(sqft));
        setPrice(calculateInspectionPrice(String(sqft)));
      }

      const image = data.property_image || data.image || data.photo || "";
      if (image) setPropertyImage(image);

      const built = data.year_built || data.yearBuilt || "";
      if (built) setYearBuilt(String(built));

      const style =
        data.propertyStyle ||
        data.style ||
        data.property_type ||
        data.house_style ||
        "";

      if (style) setPropertyStyle(String(style));

      const roof = data.roof_style || data.roofStyle || "";
      if (roof) setRoofStyle(String(roof));
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
        if (types.includes("administrative_area_level_1"))
          adminArea = component.short_name;
        if (types.includes("postal_code")) postalCode = component.long_name;
      });

      const streetAddress = `${streetNumber} ${route}`.trim();
      const finalAddress = streetAddress || place.formatted_address || "";

      setPropertyAddress(finalAddress);
      setCity(locality);
      setStateValue(adminArea || "MD");
      setZip(postalCode);

      autofillPropertyDetails(
        finalAddress,
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

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        alert("You must be logged in to create an inspection.");
        router.push("/login");
        return;
      }

      const companyId = await getCompanyId();

      if (!companyId) {
        alert("No company found for logged in user.");
        return;
      }

      const { data, error } = await supabase
        .from("inspections")
        .insert([
          {
            inspector_id: user.id,
            company_id: companyId,

            client_name: clientName,
            client_email: clientEmail.trim().toLowerCase(),
            client_phone: clientPhone,

            property_address: propertyAddress,
            city,
            state: stateValue,
            zip,

            inspection_date: inspectionDate,
            inspection_time: inspectionTime,
            inspection_status: "Scheduled",

            square_feet: squareFeet ? Number(squareFeet) : null,
            sqft: squareFeet || null,
            price: price ? Number(price) : 500,

            services,
            notes,

            year_built: yearBuilt || null,
            property_style: propertyStyle || null,
            house_style: propertyStyle || null,
            roof_style: roofStyle || null,
            property_image: propertyImage || null,

            report_status: "Draft",
            is_published: false,
          },
        ])
        .select()
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      router.push(`/reports/${data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050816] px-4 pb-24 pt-6 text-white md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 rounded-2xl border border-zinc-800 bg-[#0b1220] p-5 md:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-400">
            On Point Home Inspections
          </p>

          <h1 className="mt-2 text-3xl font-black md:text-5xl">
            Schedule Inspection
          </h1>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card title="Client Info">
            <Input value={clientName} onChange={setClientName} placeholder="Client Name" />
            <Input value={clientEmail} onChange={setClientEmail} placeholder="Client Email" />
            <Input value={clientPhone} onChange={setClientPhone} placeholder="Client Phone" />
          </Card>

          <Card title="Property Info">
            <input
              ref={addressInputRef}
              value={propertyAddress}
              onChange={(e) => setPropertyAddress(e.target.value)}
              placeholder="Start typing property address..."
              className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
            />

            <div className="grid gap-4 md:grid-cols-3">
              <Input value={city} onChange={setCity} placeholder="City" />
              <Input value={stateValue} onChange={setStateValue} placeholder="State" />
              <Input value={zip} onChange={setZip} placeholder="Zip" />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Input value={yearBuilt} onChange={setYearBuilt} placeholder="Year Built" />
              <Input value={propertyStyle} onChange={setPropertyStyle} placeholder="House Type / Style" />
              <Input value={roofStyle} onChange={setRoofStyle} placeholder="Roof Style" />
            </div>

            {propertyImage && (
              <img
                src={propertyImage}
                alt="Property preview"
                className="max-h-80 w-full rounded-xl border border-zinc-700 object-cover"
              />
            )}
          </Card>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-[#0b1220] p-5">
          <h2 className="mb-4 text-xl font-bold text-teal-400">
            Schedule + Quote
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Inspection Date
              </label>

              <select
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
              >
                <option value="">Select Date</option>

                {Array.from({ length: 90 }).map((_, i) => {
                  const date = new Date();
                  date.setDate(date.getDate() + i);

                  const value = date.toISOString().split("T")[0];

                  const label = date.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Inspection Time
              </label>

              <select
                value={inspectionTime}
                onChange={(e) => setInspectionTime(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
              >
                <option value="">Select Time</option>

                {timeOptions.map((time) => (
                  <option key={time} value={time}>
                    {formatTime(time)}
                  </option>
                ))}
              </select>
            </div>

            <Input
              value={squareFeet}
              onChange={setSquareFeet}
              placeholder={
                loadingProperty
                  ? "Attempting property lookup..."
                  : "Square Feet (auto-fill when available)"
              }
            />

            <Input value={price} onChange={setPrice} placeholder="Price" />
          </div>

          <Input
            value={services}
            onChange={setServices}
            placeholder="Services"
            className="mt-4"
          />

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Notes"
            className="mt-4 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
          />
        </section>

        <button
          onClick={scheduleInspection}
          disabled={saving}
          className="mt-6 w-full rounded-xl bg-teal-500 px-5 py-4 text-lg font-black text-black hover:bg-teal-400 disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create Inspection"}
        </button>
      </div>
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-5">
      <h2 className="mb-4 text-xl font-bold text-teal-400">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white ${className}`}
    />
  );
}