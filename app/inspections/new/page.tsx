"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

declare global {
  interface Window {
    google: any;
  }
}

const timeOptions = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
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

function buildDateOptions() {
  const dates = [];

  for (let i = 0; i < 90; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);

    dates.push({
      value: date.toISOString().split("T")[0],
      label: date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    });
  }

  return dates;
}

function buildMailto(email: string, subject: string, body: string) {
  return `mailto:${email}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

export default function NewInspectionPage() {
  const router = useRouter();
  const addressInputRef = useRef<HTMLInputElement | null>(null);

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

  const [yearBuilt, setYearBuilt] = useState("");
  const [propertyStyle, setPropertyStyle] = useState("");
  const [roofStyle, setRoofStyle] = useState("");
  const [propertyImage, setPropertyImage] = useState("");

  const [saving, setSaving] = useState(false);
  const [loadingProperty, setLoadingProperty] = useState(false);
  const [createdReportId, setCreatedReportId] = useState<string | number | null>(
    null
  );

  const dateOptions = buildDateOptions();

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
        const sqft = String(
          data.square_feet || data.squareFeet || data.livingArea
        );

        setSquareFeet(sqft);
        setPrice(calculateInspectionPrice(sqft));
      }

      if (data.year_built || data.yearBuilt) {
        setYearBuilt(String(data.year_built || data.yearBuilt));
      }

      if (data.style || data.propertyStyle) {
        setPropertyStyle(data.style || data.propertyStyle);
      }

      if (data.roof_style || data.roofStyle) {
        setRoofStyle(data.roof_style || data.roofStyle);
      }

      if (data.property_image || data.image || data.photo) {
        setPropertyImage(data.property_image || data.image || data.photo);
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
        if (types.includes("administrative_area_level_1"))
          adminArea = component.short_name;
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

  async function scheduleInspection(openReportNow = true) {
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
            year_built: yearBuilt || null,
            roof_style: roofStyle || null,
            property_image: propertyImage || null,
            report_status: "Draft",
          },
        ])
        .select()
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      setCreatedReportId(data.id);

      if (openReportNow) {
        router.push(`/reports/${data.id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  const fullAddress = `${propertyAddress}, ${city}, ${stateValue} ${zip}`;
  const readableTime = formatTime(inspectionTime);

  const clientSubject = `Home Inspection Scheduled - ${propertyAddress}`;
  const clientBody = `Hi ${clientName},

Your home inspection has been scheduled.

Property:
${fullAddress}

Date:
${inspectionDate}

Time:
${readableTime}

Services:
${services}

Price:
$${price}

Please be sure to review and complete any required agreement and payment prior to the inspection.

I look forward to meeting you.

Jeff Shockey
On Point Home Inspections LLC
240-527-7172`;

  const realtorSubject = `Inspection Scheduled - ${propertyAddress}`;
  const realtorBody = `Hi ${realtorName || ""},

The home inspection has been scheduled.

Property:
${fullAddress}

Client:
${clientName}

Date:
${inspectionDate}

Time:
${readableTime}

Services:
${services}

Price:
$${price}

I will keep the report clear, professional, and easy to understand.

Jeff Shockey
On Point Home Inspections LLC
240-527-7172`;

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

          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Schedule the inspection, auto-calculate the quote, prepare emails,
            and open the report from one page.
          </p>
        </header>

        {createdReportId && (
          <section className="mb-6 rounded-2xl border border-teal-700 bg-teal-500/10 p-5">
            <p className="text-lg font-black text-teal-400">
              Inspection saved successfully.
            </p>

            <p className="mt-2 text-sm text-zinc-300">
              You can now send the client/realtor emails or open the report.
            </p>
          </section>
        )}

        <section className="mb-6 rounded-2xl border border-teal-700 bg-[#0b1220] p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-bold uppercase text-zinc-400">
                Auto Quote
              </p>

              <p className="mt-1 text-4xl font-black text-teal-400">${price}</p>

              <p className="mt-2 text-xs text-zinc-500">
                $500 base. Over 2,000 sqft adds $50 per additional 1,000 sqft.
              </p>
            </div>

            <button
              onClick={() => scheduleInspection(false)}
              disabled={saving}
              className="rounded-xl bg-zinc-800 px-5 py-4 font-black text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save + Stay Here"}
            </button>

            <button
              onClick={() => scheduleInspection(true)}
              disabled={saving}
              className="rounded-xl bg-teal-500 px-5 py-4 font-black text-black hover:bg-teal-400 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Save + Open Report"}
            </button>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card title="Client Info">
            <Input label="Client Name" value={clientName} onChange={setClientName} />
            <Input label="Client Email" value={clientEmail} onChange={setClientEmail} />
            <Input label="Client Phone" value={clientPhone} onChange={setClientPhone} />
          </Card>

          <Card title="Realtor Info">
            <Input label="Realtor Name" value={realtorName} onChange={setRealtorName} />
            <Input label="Realtor Email" value={realtorEmail} onChange={setRealtorEmail} />
          </Card>

          <Card title="Property Info">
            <Input
              refInput={addressInputRef}
              label="Property Address"
              value={propertyAddress}
              onChange={setPropertyAddress}
              placeholder="Start typing property address..."
            />

            <div className="grid gap-4 md:grid-cols-3">
              <Input label="City" value={city} onChange={setCity} />

              <div>
                <label className="mb-2 block text-sm font-bold text-zinc-300">
                  State
                </label>

                <select
                  value={stateValue}
                  onChange={(e) => setStateValue(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                >
                  <option>MD</option>
                  <option>WV</option>
                  <option>PA</option>
                </select>
              </div>

              <Input label="Zip" value={zip} onChange={setZip} />
            </div>
          </Card>

          <Card title="Schedule + Quote">
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Inspection Date"
                value={inspectionDate}
                onChange={setInspectionDate}
                options={dateOptions}
                placeholder="Select Date"
              />

              <Select
                label="Inspection Time"
                value={inspectionTime}
                onChange={setInspectionTime}
                options={timeOptions.map((time) => ({
                  value: time,
                  label: formatTime(time),
                }))}
                placeholder="Select Time"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Square Feet"
                value={squareFeet}
                onChange={setSquareFeet}
                placeholder={loadingProperty ? "Loading..." : "Square Feet"}
              />

              <Input label="Price" value={price} onChange={setPrice} />
            </div>

            <Input label="Services" value={services} onChange={setServices} />

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
              />
            </div>
          </Card>
        </section>

        {propertyImage && (
          <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b1220]">
            <img
              src={propertyImage}
              alt="Property Preview"
              className="h-[320px] w-full object-cover"
            />

            <div className="p-5">
              <h2 className="text-2xl font-black text-white">{propertyAddress}</h2>

              <p className="mt-2 text-zinc-400">
                {city}, {stateValue} {zip}
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <PreviewInfo label="Built" value={yearBuilt || "N/A"} />
                <PreviewInfo label="Style" value={propertyStyle || "N/A"} />
                <PreviewInfo label="Roof" value={roofStyle || "N/A"} />
              </div>
            </div>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-[#0b1220] p-5">
          <h2 className="mb-4 text-2xl font-bold text-teal-400">
            Email Actions
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            <a
              href={
                clientEmail
                  ? buildMailto(clientEmail, clientSubject, clientBody)
                  : "#"
              }
              className="rounded-xl bg-teal-500 px-5 py-4 text-center font-black text-black hover:bg-teal-400"
            >
              Email Client
            </a>

            <a
              href={
                realtorEmail
                  ? buildMailto(realtorEmail, realtorSubject, realtorBody)
                  : "#"
              }
              className="rounded-xl bg-zinc-800 px-5 py-4 text-center font-black text-white hover:bg-zinc-700"
            >
              Email Realtor
            </a>

            <button
              onClick={() => {
                if (createdReportId) router.push(`/reports/${createdReportId}`);
                else alert("Save the inspection first.");
              }}
              className="rounded-xl bg-zinc-800 px-5 py-4 font-black text-white hover:bg-zinc-700"
            >
              Open Report
            </button>
          </div>
        </section>
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
  label,
  value,
  onChange,
  placeholder,
  refInput,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  refInput?: any;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-zinc-300">
        {label}
      </label>

      <input
        ref={refInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-zinc-300">
        {label}
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
      >
        <option value="">{placeholder}</option>

        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PreviewInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="text-lg text-white">{value}</p>
    </div>
  );
}