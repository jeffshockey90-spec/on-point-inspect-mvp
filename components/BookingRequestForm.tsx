"use client";


import { formatAppValue } from "../lib/app-time";
import { useEffect, useMemo, useRef, useState } from "react";

const SERVICE_OPTIONS = [
  "Buyer Home Inspection",
  "Pre-Listing / Seller Inspection",
  "New Construction Inspection",
  "Maintenance / Safety Inspection",
  "Radon Testing",
  "Mold Visual / Air Sampling",
  "Water Quality Testing",
  "Drone Roof Inspection",
];

const TIME_OPTIONS = [
  { label: "Select a time", value: "" },
  { label: "8:00 AM", value: "08:00" },
  { label: "8:30 AM", value: "08:30" },
  { label: "9:00 AM", value: "09:00" },
  { label: "9:30 AM", value: "09:30" },
  { label: "10:00 AM", value: "10:00" },
  { label: "10:30 AM", value: "10:30" },
  { label: "11:00 AM", value: "11:00" },
  { label: "11:30 AM", value: "11:30" },
  { label: "12:00 PM", value: "12:00" },
  { label: "12:30 PM", value: "12:30" },
  { label: "1:00 PM", value: "13:00" },
  { label: "1:30 PM", value: "13:30" },
  { label: "2:00 PM", value: "14:00" },
  { label: "2:30 PM", value: "14:30" },
  { label: "3:00 PM", value: "15:00" },
  { label: "3:30 PM", value: "15:30" },
  { label: "4:00 PM", value: "16:00" },
  { label: "4:30 PM", value: "16:30" },
  { label: "5:00 PM", value: "17:00" },
  { label: "Flexible / Call Me", value: "Flexible" },
];

const STATE_OPTIONS = ["MD", "WV", "PA"];

type Option = string | { label: string; value: string };

type AdditionalClient = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

declare global {
  interface Window {
    google: any;
    __onPointGoogleMapsPromise?: Promise<void>;
  }
}

function loadGoogleMapsPlaces() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (window.__onPointGoogleMapsPromise) return window.__onPointGoogleMapsPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Address autocomplete will stay disabled.");
    return Promise.resolve();
  }

  window.__onPointGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-on-point-google-maps="true"]');

    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load.")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.onPointGoogleMaps = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });

  return window.__onPointGoogleMapsPromise;
}

function getAddressPart(place: any, type: string) {
  const component = place?.address_components?.find((item: any) => item.types?.includes(type));
  return component?.short_name || component?.long_name || "";
}

function buildStreetAddress(place: any) {
  const streetNumber = getAddressPart(place, "street_number");
  const route = getAddressPart(place, "route");
  const fallback = String(place?.formatted_address || "").split(",")[0] || "";
  return [streetNumber, route].filter(Boolean).join(" ") || fallback;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DAY_CODE_BY_WEEKDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function buildDateOptions(
  count = 45,
  availableDays?: string[],
  blockedDates?: string[],
) {
  const allowedDays =
    availableDays && availableDays.length > 0 ? new Set(availableDays) : null;
  const blocked = new Set(blockedDates || []);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayIso = toIsoDate(today);

  const options: { value: string; label: string }[] = [];

  for (let offset = 0; offset < 180 && options.length < count; offset += 1) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);

    const iso = toIsoDate(date);
    const dayCode = DAY_CODE_BY_WEEKDAY[date.getDay()];

    if (allowedDays && !allowedDays.has(dayCode)) continue;
    if (blocked.has(iso)) continue;

    options.push({
      value: iso,
      label:
        iso === todayIso
          ? `Today - ${formatAppValue(date, { weekday: "short", month: "short", day: "numeric" })}`
          : formatAppValue(date, { weekday: "short", month: "short", day: "numeric" }),
    });
  }

  return options;
}

function formatTimeLabel(value: string) {
  const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return value;

  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${minutes} ${suffix}`;
}

function buildTimeOptions(availableTimes?: string[]) {
  if (!availableTimes || availableTimes.length === 0) return TIME_OPTIONS;

  return [
    { label: "Select a time", value: "" },
    ...availableTimes.map((time) => ({ label: formatTimeLabel(time), value: time })),
    { label: "Flexible / Call Me", value: "Flexible" },
  ];
}

export default function BookingRequestForm({
  companySlug,
  bookingEnabled = true,
  availableDays,
  availableTimes,
  blockedDates,
}: {
  companySlug?: string;
  bookingEnabled?: boolean;
  availableDays?: string[];
  availableTimes?: string[];
  blockedDates?: string[];
}) {
  const dateOptions = useMemo(
    () => buildDateOptions(45, availableDays, blockedDates),
    [availableDays, blockedDates],
  );
  const timeOptions = useMemo(() => buildTimeOptions(availableTimes), [availableTimes]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [services, setServices] = useState<string[]>(["Buyer Home Inspection"]);
  const [additionalClients, setAdditionalClients] = useState<AdditionalClient[]>([]);
  const [form, setForm] = useState({
    realtor_name: "",
    realtor_email: "",
    realtor_phone: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    property_address: "",
    city: "",
    state: "MD",
    zip: "",
    square_feet: "",
    preferred_date: "",
    preferred_time: "",
    alternate_date: "",
    alternate_time: "",
    notes: "",
    property_image_url: "",
  });

  const addressInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let autocomplete: any;
    let listener: any;
    let cancelled = false;

    loadGoogleMapsPlaces()
      .then(() => {
        if (cancelled || !addressInputRef.current || !window.google?.maps?.places) return;

        autocomplete = new window.google.maps.places.Autocomplete(addressInputRef.current, {
          componentRestrictions: { country: "us" },
          fields: ["address_components", "formatted_address", "geometry", "name"],
          types: ["address"],
        });

        listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const streetAddress = buildStreetAddress(place);
          const city =
            getAddressPart(place, "locality") ||
            getAddressPart(place, "postal_town") ||
            getAddressPart(place, "sublocality") ||
            getAddressPart(place, "administrative_area_level_3");
          const state = getAddressPart(place, "administrative_area_level_1");
          const zip = getAddressPart(place, "postal_code");

          setForm((current) => ({
            ...current,
            property_address: streetAddress || current.property_address,
            city: city || current.city,
            state: STATE_OPTIONS.includes(state) ? state : current.state,
            zip: zip || current.zip,
          }));
        });
      })
      .catch((error) => {
        console.warn("Address autocomplete unavailable:", error);
      });

    return () => {
      cancelled = true;
      if (listener?.remove) listener.remove();
    };
  }, []);

  function update(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function addAdditionalClient() {
    setAdditionalClients((current) => [
      ...current,
      { id: crypto.randomUUID(), name: "", email: "", phone: "" },
    ]);
  }

  function updateAdditionalClient(id: string, field: keyof Omit<AdditionalClient, "id">, value: string) {
    setAdditionalClients((current) =>
      current.map((client) =>
        client.id === id ? { ...client, [field]: value } : client
      )
    );
  }

  function removeAdditionalClient(id: string) {
    setAdditionalClients((current) => current.filter((client) => client.id !== id));
  }

  function cleanAdditionalClients() {
    return additionalClients
      .map((client) => ({
        name: client.name.trim(),
        email: client.email.trim(),
        phone: client.phone.trim(),
      }))
      .filter((client) => client.name || client.email || client.phone);
  }

  async function uploadPropertyPhoto(file: File | null) {
    setPhotoError("");

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please upload an image file.");
      return;
    }

    setPhotoUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("context", "booking-request");

      const response = await fetch("/api/property-photo/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "Property photo upload failed.");
      }

      update("property_image_url", result.url || result.publicUrl || "");
    } catch (err: any) {
      setPhotoError(err?.message || "Property photo upload failed.");
    } finally {
      setPhotoUploading(false);
    }
  }

  function toggleService(service: string) {
    setServices((current) => {
      if (current.includes(service)) {
        const next = current.filter((item) => item !== service);
        return next.length > 0 ? next : current;
      }

      return [...current, service];
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const requesterName = form.realtor_name || form.client_name;
      const requesterEmail = form.realtor_email || form.client_email;
      const requesterPhone = form.realtor_phone || form.client_phone;
      const requesterRole = form.realtor_name || form.realtor_email || form.realtor_phone ? "Realtor" : "Client";

      const response = await fetch("/api/booking-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          requester_name: requesterName,
          requester_email: requesterEmail,
          requester_phone: requesterPhone,
          requester_role: requesterRole,
          service_type: services.join(", "),
          services_requested: services,
          additional_clients: cleanAdditionalClients(),
          company_slug: companySlug || "",
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "Booking request could not be sent.");
      }

      setSuccess(true);
      setServices(["Buyer Home Inspection"]);
      setAdditionalClients([]);
      setForm((current) => ({
        ...current,
        realtor_name: "",
        realtor_email: "",
        realtor_phone: "",
        client_name: "",
        client_email: "",
        client_phone: "",
        property_address: "",
        city: "",
        zip: "",
        square_feet: "",
        preferred_date: "",
        alternate_date: "",
        notes: "",
        property_image_url: "",
      }));
    } catch (err: any) {
      setError(err?.message || "Booking request could not be sent.");
    } finally {
      setLoading(false);
    }
  }

  if (!bookingEnabled) {
    return (
      <div className="mx-auto box-border w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-800 bg-[#0f172a] p-6 text-center text-white shadow-2xl sm:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-teal-300">
          Request an Inspection
        </p>
        <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">
          Not Currently Accepting Online Requests
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          This inspector isn't accepting online booking requests right now. Please contact them
          directly to schedule an inspection.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto box-border w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-800 bg-[#0f172a] p-4 text-white shadow-2xl sm:p-5 md:p-6"
    >
      <div className="border-b border-slate-700 pb-5">
        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-teal-300">
          Request an Inspection
        </p>
        <h2 className="mt-2 text-2xl font-black leading-tight text-white sm:text-3xl">
          Booking Request
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Send the client, realtor, property, services, and preferred times. The inspector will confirm after reviewing availability.
        </p>
      </div>

      {success ? (
        <div className="mt-5 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">
          Request sent. You will receive confirmation after the inspector reviews it.
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm font-bold text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        <Section title="Realtor Information">
          <Field label="Realtor Name" value={form.realtor_name} onChange={(v) => update("realtor_name", v)} />
          <Field label="Realtor Email" type="email" value={form.realtor_email} onChange={(v) => update("realtor_email", v)} />
          <Field label="Realtor Phone" value={form.realtor_phone} onChange={(v) => update("realtor_phone", v)} />
        </Section>

        <Section title="Client Information">
          <Field label="Client Name" value={form.client_name} onChange={(v) => update("client_name", v)} required />
          <Field label="Client Email" type="email" value={form.client_email} onChange={(v) => update("client_email", v)} />
          <Field label="Client Phone" value={form.client_phone} onChange={(v) => update("client_phone", v)} required />

          {additionalClients.map((client, index) => (
            <div
              key={client.id}
              className="xl:col-span-2 rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-300">
                  Co-Client {index + 1}
                </p>
                <button
                  type="button"
                  onClick={() => removeAdditionalClient(client.id)}
                  className="rounded-lg border border-red-500/40 px-3 py-1 text-xs font-black text-red-200 transition hover:bg-red-500/10"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Field
                  label="Co-Client Name"
                  value={client.name}
                  onChange={(value) => updateAdditionalClient(client.id, "name", value)}
                />
                <Field
                  label="Co-Client Email"
                  type="email"
                  value={client.email}
                  onChange={(value) => updateAdditionalClient(client.id, "email", value)}
                />
                <Field
                  label="Co-Client Phone"
                  value={client.phone}
                  onChange={(value) => updateAdditionalClient(client.id, "phone", value)}
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addAdditionalClient}
            className="xl:col-span-2 rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm font-black text-teal-200 transition hover:bg-teal-500/20"
          >
            + Add Another Client
          </button>
        </Section>

        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-[#020817]/70 p-4 sm:p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-zinc-400">
            Services Requested
          </p>
          <p className="mt-1 text-xs text-zinc-500">Select all that apply.</p>

          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {SERVICE_OPTIONS.map((service) => {
              const checked = services.includes(service);

              return (
                <button
                  key={service}
                  type="button"
                  onClick={() => toggleService(service)}
                  className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    checked
                      ? "border-teal-400 bg-teal-500/15 text-white shadow-[0_0_0_1px_rgba(45,212,191,0.35)]"
                      : "border-zinc-700 bg-[#020617] text-zinc-200 hover:border-teal-500/50"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[12px] font-black ${
                      checked
                        ? "border-teal-300 bg-teal-400 text-black"
                        : "border-zinc-500 bg-black text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className="block min-w-0 flex-1 text-sm font-black leading-5 text-current">
                    {service}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Section title="Property Information">
          <div className="xl:col-span-2">
            <Field label="Property Address" value={form.property_address} onChange={(v) => update("property_address", v)} inputRef={addressInputRef} autoComplete="street-address" placeholder="Start typing the property address" required />
          </div>

          <div className="xl:col-span-2">
            <label className="block text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">
              Property Photo Override
            </label>

            {form.property_image_url ? (
              <div className="mt-2 overflow-hidden rounded-2xl border border-slate-700 bg-black">
                <img
                  src={form.property_image_url}
                  alt="Selected property"
                  className="h-44 w-full object-cover"
                />
              </div>
            ) : (
              <div className="mt-2 rounded-2xl border border-dashed border-slate-700 bg-[#020617] p-4 text-sm leading-6 text-zinc-400">
                Optional. Upload the correct front photo if the lookup or Street View image is wrong.
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm font-black text-teal-200 transition hover:bg-teal-500/20">
                {photoUploading ? "Uploading..." : form.property_image_url ? "Change Property Photo" : "Upload Property Photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={photoUploading}
                  onChange={(event) => void uploadPropertyPhoto(event.target.files?.[0] || null)}
                />
              </label>

              {form.property_image_url ? (
                <button
                  type="button"
                  onClick={() => update("property_image_url", "")}
                  className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-300 transition hover:border-red-400 hover:text-red-200"
                >
                  Remove Photo
                </button>
              ) : null}
            </div>

            {photoError ? (
              <p className="mt-2 text-xs font-bold text-red-300">{photoError}</p>
            ) : null}
          </div>

          <Field label="City" value={form.city} onChange={(v) => update("city", v)} required />
          <Select label="State" value={form.state} onChange={(v) => update("state", v)} options={STATE_OPTIONS} />
          <Field label="Zip" value={form.zip} onChange={(v) => update("zip", v)} />
          <Field label="Estimated Square Feet" value={form.square_feet} onChange={(v) => update("square_feet", v)} />
        </Section>

        <Section title="Preferred Appointment Time">
          <Select label="Preferred Date" value={form.preferred_date} onChange={(v) => update("preferred_date", v)} options={[{ label: "Select a date", value: "" }, ...dateOptions]} required />
          <Select label="Preferred Time" value={form.preferred_time} onChange={(v) => update("preferred_time", v)} options={timeOptions} required />
          <Select label="Alternate Date" value={form.alternate_date} onChange={(v) => update("alternate_date", v)} options={[{ label: "No alternate date", value: "" }, ...dateOptions]} />
          <Select label="Alternate Time" value={form.alternate_time} onChange={(v) => update("alternate_time", v)} options={timeOptions} />
        </Section>

        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
            rows={5}
            placeholder="Access details, deadlines, add-ons, concerns, or anything else the inspector should know."
            className="mt-2 box-border w-full max-w-full resize-y rounded-xl border border-slate-600 bg-[#020617] px-3 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-teal-400"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-teal-400 px-5 py-4 text-sm font-black text-black transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Sending..." : "Send Booking Request"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#020817]/70 p-4 sm:p-5">
      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-zinc-400">
        {title}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  inputRef,
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">
        {label} {required ? "*" : ""}
      </span>
      <input
        ref={inputRef}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 box-border h-12 w-full min-w-0 max-w-full rounded-xl border border-slate-600 bg-[#020617] px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-teal-400"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  required?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">
        {label} {required ? "*" : ""}
      </span>
      <select
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 box-border h-12 w-full min-w-0 max-w-full rounded-xl border border-slate-600 bg-[#020617] px-3 text-sm font-bold text-white outline-none transition focus:border-teal-400"
      >
        {options.map((option) => {
          const item = typeof option === "string" ? { label: option, value: option } : option;
          return (
            <option key={item.value} value={item.value} className="bg-slate-950 text-white">
              {item.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
