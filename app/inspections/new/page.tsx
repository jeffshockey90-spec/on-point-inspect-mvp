"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { getCompanyId } from "../../../lib/getCompanyId";

declare global {
  interface Window {
    google: any;
  }
}

type ServiceMode =
  | "home"
  | "radon_only"
  | "mold_only"
  | "radon_mold"
  | "home_radon"
  | "home_mold"
  | "home_radon_mold";


type RealtorContact = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  last_contact_date?: string | null;
};

const serviceOptions: { value: ServiceMode; label: string }[] = [
  { value: "home", label: "Home Inspection" },
  { value: "radon_only", label: "Radon Only" },
  { value: "mold_only", label: "Mold Only" },
  { value: "radon_mold", label: "Radon + Mold" },
  { value: "home_radon", label: "Home + Radon" },
  { value: "home_mold", label: "Home + Mold" },
  { value: "home_radon_mold", label: "Home + Radon + Mold" },
];

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

const DEFAULT_INSPECTION_DETAILS_FINDINGS = [
  {
    section: "Inspection Details",
    title: "In Attendance",
    observation:
      "In attendance at the time of inspection: Client, Listing Agent, Home Owner, Client's Agent, Inspector, or Other.",
    implication: "",
    recommendation:
      "Update this item as applicable to document who was present during the inspection.",
    severity: "Informational",
  },
  {
    section: "Inspection Details",
    title: "Occupancy",
    observation:
      "Occupancy status at the time of inspection: Furnished, Occupied, Vacant, Utilities Off, or Other.",
    implication: "",
    recommendation:
      "Update this item as applicable to document the occupancy and utility status observed during the inspection.",
    severity: "Informational",
  },
  {
    section: "Inspection Details",
    title: "Style",
    observation:
      "Home style/type observed: Manufactured, Rambler, Modular, Ranch, Modern, Multi-level, Bungalow, Contemporary, Victorian, Colonial, Row House, Townhouse, or Other.",
    implication: "",
    recommendation:
      "Update this item as applicable to document the observed home style.",
    severity: "Informational",
  },
  {
    section: "Inspection Details",
    title: "Temperature",
    observation:
      "Approximate exterior temperature at the time of inspection should be documented.",
    implication: "",
    recommendation:
      "Enter the approximate temperature observed during the inspection.",
    severity: "Informational",
  },
  {
    section: "Inspection Details",
    title: "Type of Building",
    observation:
      "Building type observed: Multi-Family, Attached, Single Family, Condominium / Townhouse, Detached, or Other.",
    implication: "",
    recommendation:
      "Update this item as applicable to document the building type.",
    severity: "Informational",
  },
  {
    section: "Inspection Details",
    title: "Weather Conditions",
    observation:
      "Weather conditions at the time of inspection: Snow, Dry, Cloudy, Hot, Heavy Rain, Clear, Light Rain, Humid, Recent Rain, or Other.",
    implication: "",
    recommendation:
      "Update this item as applicable to document weather conditions that may affect inspection visibility or limitations.",
    severity: "Informational",
  },
];

function getNumber(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

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

function calculateHomeInspectionPrice(squareFeet: string | number) {
  const sqft = getNumber(squareFeet);

  if (!sqft || sqft <= 0) return 500;
  if (sqft <= 2000) return 500;

  return 500 + Math.ceil((sqft - 2000) / 1000) * 50;
}

function hasHomeInspection(serviceMode: ServiceMode) {
  return (
    serviceMode === "home" ||
    serviceMode === "home_radon" ||
    serviceMode === "home_mold" ||
    serviceMode === "home_radon_mold"
  );
}

function hasRadon(serviceMode: ServiceMode) {
  return (
    serviceMode === "radon_only" ||
    serviceMode === "radon_mold" ||
    serviceMode === "home_radon" ||
    serviceMode === "home_radon_mold"
  );
}

function hasMold(serviceMode: ServiceMode) {
  return (
    serviceMode === "mold_only" ||
    serviceMode === "radon_mold" ||
    serviceMode === "home_mold" ||
    serviceMode === "home_radon_mold"
  );
}

function getServiceLabel(serviceMode: ServiceMode) {
  return (
    serviceOptions.find((option) => option.value === serviceMode)?.label ||
    "Home Inspection"
  );
}

function calculateFullInspectionPrice({
  squareFeet,
  serviceMode,
  moldAirSamples,
  moldSurfaceSamples,
  travelFee,
  discount,
}: {
  squareFeet: string | number;
  serviceMode: ServiceMode;
  moldAirSamples: string | number;
  moldSurfaceSamples: string | number;
  travelFee: string | number;
  discount: string | number;
}) {
  const includesHome = hasHomeInspection(serviceMode);
  const includesRadon = hasRadon(serviceMode);
  const includesMold = hasMold(serviceMode);

  const base = includesHome ? calculateHomeInspectionPrice(squareFeet) : 0;
  const radonFee = includesRadon ? (includesHome ? 175 : 225) : 0;

  const airSamples = includesMold
    ? Math.max(0, Math.floor(getNumber(moldAirSamples)))
    : 0;
  const surfaceSamples = includesMold
    ? Math.max(0, Math.floor(getNumber(moldSurfaceSamples)))
    : 0;
  const totalMoldSamples = airSamples + surfaceSamples;

  const moldSetupFee = includesMold ? (includesHome ? 175 : 225) : 0;
  const moldAirFee = airSamples * 75;
  const moldSurfaceFee = surfaceSamples * 75;
  const moldFee = moldSetupFee + moldAirFee + moldSurfaceFee;

  const safeTravelFee = Math.max(0, getNumber(travelFee));
  const safeDiscount = Math.max(0, getNumber(discount));

  const subtotal = base + radonFee + moldFee + safeTravelFee;
  const total = Math.max(0, subtotal - safeDiscount);

  return {
    base,
    radonFee,
    moldSetupFee,
    moldAirFee,
    moldSurfaceFee,
    moldFee,
    airSamples,
    surfaceSamples,
    totalMoldSamples,
    travelFee: safeTravelFee,
    discount: safeDiscount,
    subtotal,
    total,
    includesHome,
    includesRadon,
    includesMold,
    serviceLabel: getServiceLabel(serviceMode),
  };
}

export default function NewInspectionPage() {
  const router = useRouter();
  const supabase = createClient();
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const [realtorId, setRealtorId] = useState("");
  const [realtorName, setRealtorName] = useState("");
  const [realtorEmail, setRealtorEmail] = useState("");
  const [realtorPhone, setRealtorPhone] = useState("");
  const [realtors, setRealtors] = useState<RealtorContact[]>([]);
  const [showRealtorMatches, setShowRealtorMatches] = useState(false);

  const [propertyAddress, setPropertyAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateValue, setStateValue] = useState("MD");
  const [zip, setZip] = useState("");

  const [inspectionDate, setInspectionDate] = useState("");
  const [inspectionTime, setInspectionTime] = useState("");

  const [squareFeet, setSquareFeet] = useState("");
  const [serviceMode, setServiceMode] = useState<ServiceMode>("home");
  const [price, setPrice] = useState("500");
  const [services, setServices] = useState("Home Inspection");
  const [notes, setNotes] = useState("");

  const [moldAirSamples, setMoldAirSamples] = useState("0");
  const [moldSurfaceSamples, setMoldSurfaceSamples] = useState("0");
  const [travelFee, setTravelFee] = useState("0");
  const [discount, setDiscount] = useState("0");

  const [yearBuilt, setYearBuilt] = useState("");
  const [propertyStyle, setPropertyStyle] = useState("");
  const [roofStyle, setRoofStyle] = useState("");
  const [propertyImage, setPropertyImage] = useState("");

  const [loadingProperty, setLoadingProperty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showBillingPopup, setShowBillingPopup] = useState(false);
  const [billingMessage, setBillingMessage] = useState("");

  const quote = useMemo(
    () =>
      calculateFullInspectionPrice({
        squareFeet,
        serviceMode,
        moldAirSamples,
        moldSurfaceSamples,
        travelFee,
        discount,
      }),
    [squareFeet, serviceMode, moldAirSamples, moldSurfaceSamples, travelFee, discount]
  );

  const filteredRealtors = useMemo(() => {
    const search = realtorName.trim().toLowerCase();

    if (!search) return realtors.slice(0, 8);

    return realtors
      .filter((realtor) =>
        [realtor.name, realtor.email, realtor.phone]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search))
      )
      .slice(0, 8);
  }, [realtorName, realtors]);

  useEffect(() => {
    loadGooglePlaces();
  }, []);


  useEffect(() => {
    loadRealtors();
  }, []);

  useEffect(() => {
    setPrice(String(quote.total));
    setServices(quote.serviceLabel);
  }, [quote.total, quote.serviceLabel]);

  async function loadRealtors() {
    try {
      const res = await fetch("/api/realtors", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setRealtors(data.realtors || []);
      }
    } catch (error) {
      console.error("Failed to load realtors:", error);
    }
  }

  function selectRealtor(realtor: RealtorContact) {
    setRealtorId(realtor.id);
    setRealtorName(realtor.name || "");
    setRealtorEmail(realtor.email || "");
    setRealtorPhone(realtor.phone || "");
    setShowRealtorMatches(false);
  }

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

        if (types.includes("street_number")) {
          streetNumber = component.long_name;
        }

        if (types.includes("route")) {
          route = component.long_name;
        }

        if (types.includes("locality")) {
          locality = component.long_name;
        }

        if (types.includes("administrative_area_level_1")) {
          adminArea = component.short_name;
        }

        if (types.includes("postal_code")) {
          postalCode = component.long_name;
        }
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

  async function checkSubscriptionAccess(userId: string) {
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "subscription_status, subscription_exempt, subscription_required, free_inspection_limit, free_inspections_used"
      )
      .eq("id", userId)
      .single();

    if (!profile) {
      return {
        allowed: true,
        profile: null as any,
        used: 0,
        limit: 3,
      };
    }

    const { data: existingInspections } = await supabase
      .from("inspections")
      .select("id, is_demo")
      .eq("inspector_id", userId);

    const existingRealInspectionCount = (existingInspections || []).filter(
      (inspection: any) => inspection?.is_demo !== true
    ).length;

    const used = Math.max(
      Number(profile.free_inspections_used || 0),
      existingRealInspectionCount
    );

    const limit = Number(profile.free_inspection_limit || 3);
    const required = profile.subscription_required !== false;
    const exempt = profile.subscription_exempt === true;
    const status = String(profile.subscription_status || "").toLowerCase();

    const active = status === "active" || status === "trialing";

    if (!required || exempt || active) {
      return {
        allowed: true,
        profile,
        used,
        limit,
      };
    }

    if (used >= limit) {
      setBillingMessage(
        `You have used all ${limit} free inspections. Activate your On Point Inspect subscription to continue creating reports.`
      );
      setShowBillingPopup(true);

      return {
        allowed: false,
        profile,
        used,
        limit,
      };
    }

    return {
      allowed: true,
      profile,
      used,
      limit,
    };
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

      const billingAccess = await checkSubscriptionAccess(user.id);

      if (!billingAccess.allowed) {
        return;
      }

      const companyId = await getCompanyId();

      if (!companyId) {
        alert("No company found for logged in user.");
        return;
      }

      const totalPrice = Number(price || quote.total || 500);

      const fullAddressForImage = `${propertyAddress}, ${city || ""}, ${
        stateValue || ""
      } ${zip || ""}`.trim();

      const fallbackStreetViewImage =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && fullAddressForImage
          ? `https://maps.googleapis.com/maps/api/streetview?size=900x500&location=${encodeURIComponent(
              fullAddressForImage
            )}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
          : "";

      const finalPropertyImage = propertyImage || fallbackStreetViewImage || null;

      const { data, error } = await supabase
        .from("inspections")
        .insert([
          {
            inspector_id: user.id,
            company_id: companyId,

            client_name: clientName,
            client_email: clientEmail.trim().toLowerCase(),
            client_phone: clientPhone,

            realtor_id: realtorId || null,
            realtor_contact_id: realtorId || null,
            realtor_name: realtorName || null,
            realtor_email: realtorEmail.trim().toLowerCase() || null,
            realtor_phone: realtorPhone || null,
            agent_name: realtorName || null,
            agent_email: realtorEmail.trim().toLowerCase() || null,

            property_address: propertyAddress,
            address: propertyAddress,
            city,
            state: stateValue,
            zip,

            inspection_date: inspectionDate,
            inspection_time: inspectionTime,
            inspection_status: "Scheduled",

            square_feet: quote.includesHome && squareFeet ? Number(squareFeet) : null,
            sqft: quote.includesHome ? squareFeet || null : null,

            price: totalPrice,
            invoice_amount: totalPrice,
            balance_due: totalPrice,
            amount_paid: 0,
            invoice_status: "Pending",
            payment_status: "Pending",

            services,
            service_mode: serviceMode,
            inspection_type: services,
            notes,

            radon: quote.includesRadon,
            radon_fee: quote.radonFee,
            mold: quote.includesMold,
            mold_air_samples: quote.airSamples,
            mold_surface_samples: quote.surfaceSamples,
            mold_setup_fee: quote.moldSetupFee,
            mold_fee: quote.moldFee,
            travel_fee: quote.travelFee,
            discount: quote.discount,

            year_built: yearBuilt || null,
            property_style: propertyStyle || null,
            house_style: propertyStyle || null,
            roof_style: roofStyle || null,
            property_image: finalPropertyImage,
            street_view_url: finalPropertyImage,

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

      if (billingAccess.profile) {
        const nextFreeInspectionCount = Math.max(
          Number(billingAccess.used || 0) + 1,
          Number(billingAccess.profile.free_inspections_used || 0) + 1
        );

        const { error: freeInspectionUpdateError } = await supabase
          .from("profiles")
          .update({
            free_inspections_used: nextFreeInspectionCount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (freeInspectionUpdateError) {
          console.warn("Free inspection count was not updated.");
        }
      }

      const defaultFindings = DEFAULT_INSPECTION_DETAILS_FINDINGS.map(
        (finding) => ({
          inspection_id: data.id,
          inspector_id: user.id,
          company_id: companyId,
          ...finding,
        })
      );

      const { error: defaultFindingsError } = await supabase
        .from("findings")
        .insert(defaultFindings);

      if (defaultFindingsError) {
        // Do not block inspection creation if the optional default inspection
        // details findings cannot be inserted. This keeps the core scheduling
        // and report workflow stable.
        console.warn("Default inspection details were not inserted.");
      }

      const inspectionContacts = [];

      if (clientEmail.trim()) {
        inspectionContacts.push({
          inspection_id: data.id,
          inspector_id: user.id,
          name: clientName,
          email: clientEmail.trim().toLowerCase(),
          phone: clientPhone || null,
          role: "client",
          agreement_required: true,
          portal_access: true,
        });
      }

      if (realtorEmail.trim()) {
        inspectionContacts.push({
          inspection_id: data.id,
          inspector_id: user.id,
          name: realtorName || "Realtor",
          email: realtorEmail.trim().toLowerCase(),
          phone: realtorPhone || null,
          role: "realtor",
          agreement_required: false,
          portal_access: true,
        });
      }

      if (inspectionContacts.length > 0) {
        const { error: contactsError } = await supabase
          .from("inspection_contacts")
          .insert(inspectionContacts);

        if (contactsError) {
          console.warn("Inspection contacts were not inserted.");
        }
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
            <Input
              value={clientName}
              onChange={setClientName}
              placeholder="Client Name"
            />

            <Input
              value={clientEmail}
              onChange={setClientEmail}
              placeholder="Client Email"
            />

            <Input
              value={clientPhone}
              onChange={setClientPhone}
              placeholder="Client Phone"
            />
          </Card>

          <Card title="Realtor Info">
            <div className="relative">
              <input
                value={realtorName}
                onChange={(e) => {
                  setRealtorName(e.target.value);
                  setRealtorId("");
                  setShowRealtorMatches(true);
                }}
                onFocus={() => setShowRealtorMatches(true)}
                placeholder="Start typing realtor name..."
                className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
              />

              {showRealtorMatches && filteredRealtors.length > 0 && (
                <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-zinc-700 bg-[#020617] shadow-2xl">
                  {filteredRealtors.map((realtor) => (
                    <button
                      key={realtor.id}
                      type="button"
                      onClick={() => selectRealtor(realtor)}
                      className="block w-full border-b border-zinc-800 px-4 py-3 text-left hover:bg-teal-500/10"
                    >
                      <span className="block font-bold text-white">
                        {realtor.name}
                      </span>
                      <span className="mt-1 block text-sm text-zinc-400">
                        {[realtor.email, realtor.phone].filter(Boolean).join(" • ") ||
                          "No email or phone saved"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Input
              value={realtorEmail}
              onChange={setRealtorEmail}
              placeholder="Realtor Email"
            />

            <Input
              value={realtorPhone}
              onChange={setRealtorPhone}
              placeholder="Realtor Phone"
            />

            <p className="text-sm text-zinc-400">
              Saved realtor contacts will auto-fill here and will be included on report/schedule emails, but not pre-inspection agreement emails.
            </p>
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

              <Input
                value={stateValue}
                onChange={setStateValue}
                placeholder="State"
              />

              <Input value={zip} onChange={setZip} placeholder="Zip" />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Input
                value={yearBuilt}
                onChange={setYearBuilt}
                placeholder="Year Built"
              />

              <Input
                value={propertyStyle}
                onChange={setPropertyStyle}
                placeholder="House Type / Style"
              />

              <Input
                value={roofStyle}
                onChange={setRoofStyle}
                placeholder="Roof Style"
              />
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

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Service Type
              </label>
              <select
                value={serviceMode}
                onChange={(e) => setServiceMode(e.target.value as ServiceMode)}
                className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
              >
                {serviceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <Input value={price} onChange={setPrice} placeholder="Price" />

            {quote.includesHome && (
              <Input
                value={squareFeet}
                onChange={setSquareFeet}
                placeholder={
                  loadingProperty
                    ? "Attempting property lookup..."
                    : "Square Feet"
                }
              />
            )}

            <Input
              value={travelFee}
              onChange={setTravelFee}
              placeholder="Travel Fee"
            />

            {quote.includesMold && (
              <>
                <Input
                  value={moldAirSamples}
                  onChange={setMoldAirSamples}
                  placeholder="Mold Air Samples"
                />

                <Input
                  value={moldSurfaceSamples}
                  onChange={setMoldSurfaceSamples}
                  placeholder="Mold Surface/Tape/Swab Samples"
                />
              </>
            )}

            <Input
              value={discount}
              onChange={setDiscount}
              placeholder="Discount"
            />
          </div>

          <div className="mt-5 rounded-2xl border border-teal-500/40 bg-teal-500/10 p-5">
            <p className="text-sm font-bold uppercase tracking-wide text-zinc-400">
              Auto Pricing
            </p>
            <p className="mt-2 text-4xl font-black text-teal-300">
              ${quote.total}
            </p>
            <div className="mt-4 grid gap-2 text-sm text-zinc-300 md:grid-cols-2">
              <p>Home Inspection: ${quote.base}</p>
              <p>Radon: ${quote.radonFee}</p>
              <p>Mold Setup/Admin: ${quote.moldSetupFee}</p>
              <p>Mold Air Samples: ${quote.moldAirFee}</p>
              <p>Mold Surface Samples: ${quote.moldSurfaceFee}</p>
              <p>Travel Fee: ${quote.travelFee}</p>
              <p>Discount: -${quote.discount}</p>
              <p className="font-bold text-white">Total: ${quote.total}</p>
            </div>
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

      {showBillingPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-teal-500 bg-[#0b1220] p-6 shadow-2xl">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-teal-400">
              On Point Inspect Billing
            </p>

            <h2 className="mt-3 text-3xl font-black text-white">
              Subscription Required
            </h2>

            <p className="mt-4 leading-7 text-zinc-300">
              {billingMessage}
            </p>

            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Go to Billing to activate your subscription and continue creating inspections.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => router.push("/billing")}
                className="rounded-xl bg-teal-500 px-4 py-3 font-black text-black hover:bg-teal-400"
              >
                Go To Billing
              </button>

              <button
                type="button"
                onClick={() => setShowBillingPopup(false)}
                className="rounded-xl border border-zinc-700 px-4 py-3 font-black text-white hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
      type={
        placeholder.toLowerCase().includes("email") ||
        placeholder.toLowerCase().includes("phone") ||
        placeholder.toLowerCase().includes("city") ||
        placeholder.toLowerCase().includes("state") ||
        placeholder.toLowerCase().includes("zip") ||
        placeholder.toLowerCase().includes("name") ||
        placeholder.toLowerCase().includes("style") ||
        placeholder.toLowerCase().includes("services")
          ? "text"
          : "number"
      }
      min="0"
      className={`w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white ${className}`}
    />
  );
}
