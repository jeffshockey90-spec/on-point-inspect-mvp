"use client";


import { formatAppValue, toLocalDateKey } from "../../../lib/app-time";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { getCompanyId } from "../../../lib/getCompanyId";
import { calculateHomeInspectionPrice } from "../../../lib/propertyPricing";
import {
  DEFAULT_PRICING_CONFIG,
  calculateSqftFormulaPrice,
  getService,
  type InspectorPricingConfig,
} from "../../../lib/inspectorPricing";
import { useAddressAutocomplete } from "../../../hooks/useAddressAutocomplete";
import NewInspectionAgreementPicker from "../../../components/NewInspectionAgreementPicker";
import { isIOSNativeApp, openInSystemBrowser } from "../../../lib/nativePlatform";

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

type CoClient = {
  id: string;
  name: string;
  email: string;
  phone: string;
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

  return formatAppValue(date, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
  config,
}: {
  squareFeet: string | number;
  serviceMode: ServiceMode;
  moldAirSamples: string | number;
  moldSurfaceSamples: string | number;
  travelFee: string | number;
  discount: string | number;
  config: InspectorPricingConfig;
}) {
  const includesHome = hasHomeInspection(serviceMode);
  const includesRadon = hasRadon(serviceMode);
  const includesMold = hasMold(serviceMode);

  // Price from the inspector's saved pricing config (same source as the Quote
  // calculator) instead of hardcoded rates, so the saved inspection matches
  // what was quoted (audit finding H6). Falls back to default rates per service
  // when the inspector hasn't customized one.
  const homeService = getService(config, "home");
  const radonService = getService(config, "radon");
  const moldService = getService(config, "mold");

  const base =
    includesHome && homeService
      ? calculateSqftFormulaPrice(homeService, getNumber(squareFeet))
      : includesHome
        ? calculateHomeInspectionPrice(squareFeet)
        : 0;

  const radonFee = includesRadon
    ? includesHome && radonService?.pairedPrice !== undefined
      ? Number(radonService.pairedPrice)
      : Number(radonService?.flatPrice ?? (includesHome ? 175 : 225))
    : 0;

  const airSamples = includesMold
    ? Math.max(0, Math.floor(getNumber(moldAirSamples)))
    : 0;
  const surfaceSamples = includesMold
    ? Math.max(0, Math.floor(getNumber(moldSurfaceSamples)))
    : 0;
  const totalMoldSamples = airSamples + surfaceSamples;

  const moldSetupFee = includesMold
    ? includesHome && moldService?.pairedBaseFee !== undefined
      ? Number(moldService.pairedBaseFee)
      : Number(moldService?.baseFee ?? (includesHome ? 175 : 225))
    : 0;
  const moldPerSample = Number(moldService?.perUnitFee ?? 75);
  const moldAirFee = airSamples * moldPerSample;
  const moldSurfaceFee = surfaceSamples * moldPerSample;
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


function cleanImageUrl(value: any) {
  const text = String(value || "").trim();

  if (!text) return "";

  return text;
}

function getUploadImageUrl(result: any) {
  return cleanImageUrl(
    result?.url ||
      result?.publicUrl ||
      result?.public_url ||
      result?.signedUrl ||
      result?.signed_url ||
      result?.propertyImageUrl ||
      result?.property_image_url ||
      result?.imageUrl ||
      result?.image_url
  );
}

export default function NewInspectionPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#050816] p-10 text-white">
          Loading...
        </main>
      }
    >
      <NewInspectionPageContent />
    </Suspense>
  );
}

function NewInspectionPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const addressInputRef = useAddressAutocomplete((parsed) => {
    clearPropertyAutofill();
    setPropertyAddress(parsed.address);
    setCity(parsed.city);
    setStateValue(parsed.state);
    setZip(parsed.zip);
    autofillPropertyDetails(parsed.address, parsed.city, parsed.state, parsed.zip);
  });
  const propertyLookupRequestId = useRef(0);

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientOrganization, setClientOrganization] = useState("");
  const [coClients, setCoClients] = useState<CoClient[]>([]);

  const [realtorId, setRealtorId] = useState("");
  const [realtorName, setRealtorName] = useState("");
  const [realtorEmail, setRealtorEmail] = useState("");
  const [realtorPhone, setRealtorPhone] = useState("");
  const [realtors, setRealtors] = useState<RealtorContact[]>([]);
  const [showRealtorMatches, setShowRealtorMatches] = useState(false);

  const [propertyAddress, setPropertyAddress] = useState(
    () => searchParams.get("address") || ""
  );
  const [city, setCity] = useState(() => searchParams.get("city") || "");
  const [stateValue, setStateValue] = useState(
    () => searchParams.get("state") || "MD"
  );
  const [zip, setZip] = useState(() => searchParams.get("zip") || "");

  const [inspectionDate, setInspectionDate] = useState("");
  const [inspectionTime, setInspectionTime] = useState("");

  const [squareFeet, setSquareFeet] = useState(
    () => searchParams.get("squareFeet") || ""
  );
  const [serviceMode, setServiceMode] = useState<ServiceMode>(
    () => (searchParams.get("serviceMode") as ServiceMode) || "home"
  );
  const [price, setPrice] = useState("500");
  // True once the inspector types a custom price, so auto-pricing stops
  // overwriting it. They can reset back to auto at any time.
  const [priceOverridden, setPriceOverridden] = useState(false);
  const [services, setServices] = useState("Home Inspection");
  const [notes, setNotes] = useState("");

  const [moldAirSamples, setMoldAirSamples] = useState(
    () => searchParams.get("moldAirSamples") || "0"
  );
  const [moldSurfaceSamples, setMoldSurfaceSamples] = useState(
    () => searchParams.get("moldSurfaceSamples") || "0"
  );
  const [travelFee, setTravelFee] = useState(
    () => searchParams.get("travelFee") || "0"
  );
  const [discount, setDiscount] = useState(
    () => searchParams.get("discount") || "0"
  );

  const [yearBuilt, setYearBuilt] = useState("");
  const [propertyStyle, setPropertyStyle] = useState("");
  const [roofStyle, setRoofStyle] = useState("");
  const [propertyImage, setPropertyImage] = useState("");
  const [propertyImagePreview, setPropertyImagePreview] = useState("");
  const [propertyImageLoadError, setPropertyImageLoadError] = useState(false);
  const [propertyPhotoUploading, setPropertyPhotoUploading] = useState(false);
  const [propertyPhotoError, setPropertyPhotoError] = useState("");
  const [propertyPhotoDragging, setPropertyPhotoDragging] = useState(false);

  const [loadingProperty, setLoadingProperty] = useState(false);
  const [propertyLookupStatus, setPropertyLookupStatus] = useState("");

  const [agreementState, setAgreementState] = useState("MD");
  const [agreementTemplateIds, setAgreementTemplateIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showBillingPopup, setShowBillingPopup] = useState(false);
  const [billingMessage, setBillingMessage] = useState("");
  const [pricingConfig, setPricingConfig] = useState<InspectorPricingConfig>(
    DEFAULT_PRICING_CONFIG,
  );

  useEffect(() => {
    fetch("/api/pricing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.config) setPricingConfig(data.config);
      })
      .catch(() => {});
  }, []);

  const quote = useMemo(
    () =>
      calculateFullInspectionPrice({
        squareFeet,
        serviceMode,
        moldAirSamples,
        moldSurfaceSamples,
        travelFee,
        discount,
        config: pricingConfig,
      }),
    [
      squareFeet,
      serviceMode,
      moldAirSamples,
      moldSurfaceSamples,
      travelFee,
      discount,
      pricingConfig,
    ]
  );

  // The price actually used (and saved): the inspector's custom price when
  // they've overridden (and left the field non-empty), otherwise the
  // auto-calculated total. Either way the Discount is subtracted, so the
  // discount box works even after a custom price is entered.
  const effectiveTotal =
    priceOverridden && String(price).trim() !== ""
      ? Math.max(0, (Number(price) || 0) - quote.discount)
      : quote.total;

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
    loadRealtors();
  }, []);

  useEffect(() => {
    // Only auto-fill the price while the inspector hasn't set a custom one.
    if (!priceOverridden) setPrice(String(quote.total));
    setServices(quote.serviceLabel);
  }, [quote.total, quote.serviceLabel, priceOverridden]);

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

  function addCoClient() {
    setCoClients((current) => [
      ...current,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${current.length}`,
        name: "",
        email: "",
        phone: "",
      },
    ]);
  }

  function updateCoClient(id: string, field: keyof Omit<CoClient, "id">, value: string) {
    setCoClients((current) =>
      current.map((client) =>
        client.id === id ? { ...client, [field]: value } : client
      )
    );
  }

  function removeCoClient(id: string) {
    setCoClients((current) => current.filter((client) => client.id !== id));
  }

  function getCompletedCoClients() {
    return coClients
      .map((client) => ({
        name: client.name.trim(),
        email: client.email.trim().toLowerCase(),
        phone: client.phone.trim(),
      }))
      .filter((client) => client.name || client.email || client.phone);
  }

  async function uploadPropertyPhoto(file: File | null) {
    setPropertyPhotoError("");

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPropertyPhotoError("Please upload an image file.");
      return;
    }

    const localPreviewUrl = URL.createObjectURL(file);
    setPropertyImagePreview(localPreviewUrl);
    setPropertyImageLoadError(false);

    try {
      setPropertyPhotoUploading(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("context", "inspection-schedule");

      const response = await fetch("/api/property-photo/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "Property photo upload failed.");
      }

      const uploadedUrl = getUploadImageUrl(result);

      if (!uploadedUrl) {
        throw new Error("Photo uploaded, but no image URL was returned.");
      }

      setPropertyImage(uploadedUrl);
      setPropertyImageLoadError(false);
      setPropertyLookupStatus("Property photo updated. This photo will be used for the report.");
    } catch (error: any) {
      setPropertyPhotoError(error?.message || "Property photo upload failed.");
    } finally {
      setPropertyPhotoUploading(false);
    }
  }

  function handlePropertyPhotoDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setPropertyPhotoDragging(false);

    if (propertyPhotoUploading) return;

    const file = event.dataTransfer.files?.[0] || null;
    void uploadPropertyPhoto(file);
  }

  function handlePropertyPhotoDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!propertyPhotoUploading) {
      setPropertyPhotoDragging(true);
    }
  }

  function handlePropertyPhotoDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setPropertyPhotoDragging(false);
  }

  function clearPropertyAutofill() {
    setSquareFeet("");
    setYearBuilt("");
    setPropertyStyle("");
    setRoofStyle("");
    setPropertyImage("");
    setPropertyImagePreview("");
    setPropertyImageLoadError(false);
    setPropertyLookupStatus("");
  }

  function handleAddressInputChange(value: string) {
    setPropertyAddress(value);
    propertyLookupRequestId.current += 1;
    clearPropertyAutofill();
  }

  async function runManualPropertyLookup() {
    if (!propertyAddress.trim()) {
      setPropertyLookupStatus("Enter an address first.");
      return;
    }

    await autofillPropertyDetails(
      propertyAddress,
      city,
      stateValue || "MD",
      zip
    );
  }

  async function autofillPropertyDetails(
    address: string,
    cityName: string,
    stateName: string,
    zipCode: string
  ) {
    const lookupId = propertyLookupRequestId.current + 1;
    propertyLookupRequestId.current = lookupId;

    try {
      setLoadingProperty(true);
      setPropertyLookupStatus("Looking up property info...");

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

      if (lookupId !== propertyLookupRequestId.current) return;

      const sqft =
        data.square_feet ||
        data.squareFeet ||
        data.livingArea ||
        data.living_area;

      if (sqft) {
        setSquareFeet(String(sqft));
      }

      const image = data.property_image || data.image || data.photo || "";

      if (image) {
        setPropertyImage(String(image));
        setPropertyImagePreview("");
        setPropertyImageLoadError(false);
      }

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

      const foundData = Boolean(sqft || built || style || roof);
      if (foundData) {
        setPropertyLookupStatus("Property info found. Please verify before creating the inspection.");
      } else if (image) {
        setPropertyLookupStatus("No saved property details found yet. Street View loaded; enter details manually and FLOW will remember them next time.");
      } else {
        setPropertyLookupStatus("No saved property details found yet. Enter details manually and FLOW will remember them next time.");
      }
    } catch (error) {
      console.log("Property autofill skipped:", error);
      setPropertyLookupStatus("Property lookup was skipped. You can still enter the details manually.");
    } finally {
      if (lookupId === propertyLookupRequestId.current) {
        setLoadingProperty(false);
      }
    }
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
        `Your free trial is over - you've used all ${limit} free inspections. Activate your FLOW subscription to keep creating inspections.`
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
    if (saving) return;

    if (!clientName || !propertyAddress || !inspectionDate || !inspectionTime) {
      alert("Client name, address, date, and time are required.");
      return;
    }

    const completedCoClients = getCompletedCoClients();
    const incompleteCoClient = completedCoClients.find(
      (client) => !client.name || !client.email
    );

    if (incompleteCoClient) {
      alert("Each co-buyer needs at least a name and email.");
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

      const totalPrice = Number(effectiveTotal) || quote.total || 500;

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
            client_organization_name: clientOrganization.trim() || null,

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
        const blockedByTrialLimit =
          error.code === "42501" ||
          /row-level security/i.test(error.message || "");

        if (blockedByTrialLimit) {
          setBillingMessage(
            "Your free trial is over - you've used all 3 free inspections. Activate your FLOW subscription to keep creating inspections."
          );
          setShowBillingPopup(true);
          return;
        }

        alert(error.message);
        return;
      }

      // Best-effort: geocode the property and cache driving distance from
      // the company's office address, if set. Never blocks inspection
      // creation - the report page just won't show a distance yet if this
      // is still slow or fails.
      fetch("/api/inspections/enrich-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId: data.id }),
      }).catch((enrichError) => {
        console.warn("Location enrichment failed:", enrichError);
      });

      // Save every completed inspection's property details into FLOW's
      // property cache so future inspections can auto-fill instantly.
      // IMPORTANT: this matches the exact properties table columns:
      // property_image_url exists, property_image does not.
      const { data: propertyCacheData, error: propertyCacheError } = await supabase
        .from("properties")
        .insert({
          address: propertyAddress,
          city: city || null,
          state: stateValue || null,
          zip: zip || null,

          square_feet: quote.includesHome && squareFeet ? String(squareFeet) : null,
          year_built: yearBuilt || null,
          bedrooms: null,
          bathrooms: null,

          property_type: propertyStyle || null,
          property_style: propertyStyle || null,
          house_style: propertyStyle || null,
          roof_type: null,
          roof_style: roofStyle || null,

          property_image_url: finalPropertyImage || null,
          source: "inspection_created",
          updated_at: new Date().toISOString(),
        })
        .select();

      if (propertyCacheError) {
        console.warn("Property cache was not saved:", propertyCacheError.message);
        alert(`Property cache was not saved: ${propertyCacheError.message}`);
      } else {
        console.log("Property cache saved:", propertyCacheData);
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

      completedCoClients.forEach((coClient) => {
        inspectionContacts.push({
          inspection_id: data.id,
          inspector_id: user.id,
          name: coClient.name,
          email: coClient.email,
          phone: coClient.phone || null,
          role: "co-client",
          agreement_required: true,
          portal_access: true,
        });
      });

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

      const hasAgreement = agreementTemplateIds.length > 0;

      const sendResults = await Promise.allSettled([
        hasAgreement
          ? fetch("/api/update-agreement-state", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                inspectionId: data.id,
                agreementState,
                agreementTemplateIds,
              }),
            })
          : Promise.resolve(null),
        fetch("/api/send-schedule-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inspectionId: data.id }),
        }),
        hasAgreement
          ? fetch("/api/send-agreement-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ inspectionId: data.id }),
            })
          : Promise.resolve(null),
      ]);

      sendResults.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn(
            `Post-creation step ${index} failed:`,
            result.reason
          );
        }
      });

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
            FLOW
          </p>

          <h1 className="mt-2 text-3xl font-black md:text-5xl">
            Schedule Inspection
          </h1>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card title="Client Info">
            <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
              <p className="mb-3 text-sm font-black uppercase tracking-wide text-teal-300">
                Primary Client
              </p>

              <div className="space-y-4">
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

                <Input
                  value={clientOrganization}
                  onChange={setClientOrganization}
                  placeholder="Business/Organization (optional, if hiring on behalf of one)"
                />
              </div>
            </div>

            {coClients.map((coClient, index) => (
              <div
                key={coClient.id}
                className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-black uppercase tracking-wide text-teal-300">
                    Co-Buyer {index + 1}
                  </p>

                  <button
                    type="button"
                    onClick={() => removeCoClient(coClient.id)}
                    className="rounded-lg border border-red-500/40 px-3 py-1 text-xs font-black text-red-300 hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                </div>

                <div className="space-y-4">
                  <Input
                    value={coClient.name}
                    onChange={(value) => updateCoClient(coClient.id, "name", value)}
                    placeholder="Co-Buyer Name"
                  />

                  <Input
                    value={coClient.email}
                    onChange={(value) => updateCoClient(coClient.id, "email", value)}
                    placeholder="Co-Buyer Email"
                  />

                  <Input
                    value={coClient.phone}
                    onChange={(value) => updateCoClient(coClient.id, "phone", value)}
                    placeholder="Co-Buyer Phone"
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addCoClient}
              className="w-full rounded-xl border border-teal-500/50 bg-teal-500/10 px-4 py-3 text-sm font-black text-teal-300 transition hover:bg-teal-500/20"
            >
              + Add Co-Buyer
            </button>

            <p className="text-sm leading-6 text-zinc-400">
              Co-buyers will be added as agreement-required contacts and will receive portal access.
            </p>
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
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Property Address
              </label>
              <input
                ref={addressInputRef}
                value={propertyAddress}
                onChange={(e) => handleAddressInputChange(e.target.value)}
                placeholder="Start typing property address..."
                className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <LabeledInput label="City" value={city} onChange={setCity} placeholder="City" />

              <LabeledInput
                label="State"
                value={stateValue}
                onChange={setStateValue}
                placeholder="State"
              />

              <LabeledInput label="Zip" value={zip} onChange={setZip} placeholder="Zip" />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <LabeledInput
                label="Year Built"
                value={yearBuilt}
                onChange={setYearBuilt}
                placeholder="Year Built"
              />

              <LabeledInput
                label="House Type / Style"
                value={propertyStyle}
                onChange={setPropertyStyle}
                placeholder="House Type / Style"
              />

              <LabeledInput
                label="Roof Style"
                value={roofStyle}
                onChange={setRoofStyle}
                placeholder="Roof Style"
              />
            </div>

            <button
              type="button"
              onClick={runManualPropertyLookup}
              disabled={loadingProperty || !propertyAddress.trim()}
              className="w-full rounded-xl border border-teal-500/60 bg-teal-500/10 px-4 py-3 font-black text-teal-300 hover:bg-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingProperty ? "Looking Up Property..." : "Lookup Property Info"}
            </button>

            {propertyLookupStatus && (
              <p className="rounded-xl border border-zinc-800 bg-black/40 px-4 py-3 text-sm text-zinc-300">
                {propertyLookupStatus}
              </p>
            )}

            <div
              onDrop={handlePropertyPhotoDrop}
              onDragOver={handlePropertyPhotoDragOver}
              onDragLeave={handlePropertyPhotoDragLeave}
              className={`rounded-xl border p-4 transition ${
                propertyPhotoDragging
                  ? "border-teal-400 bg-teal-500/10"
                  : "border-zinc-800 bg-black/30"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-wide text-teal-300">
                    Property Photo
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Use the lookup photo, upload the correct house photo, or drag and drop a photo here if the lookup pulls the wrong property.
                  </p>
                </div>

                <label className="inline-flex cursor-pointer rounded-xl border border-teal-500/50 bg-teal-500/10 px-4 py-3 text-sm font-black text-teal-300 transition hover:bg-teal-500/20">
                  {propertyPhotoUploading
                    ? "Uploading..."
                    : propertyImage
                    ? "Change Property Photo"
                    : "Upload Property Photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={propertyPhotoUploading}
                    onChange={(event) =>
                      void uploadPropertyPhoto(event.target.files?.[0] || null)
                    }
                  />
                </label>
              </div>

              {(propertyImagePreview || propertyImage) && !propertyImageLoadError ? (
                <div className="mt-4 overflow-hidden rounded-xl border border-zinc-700 bg-black">
                  <img
                    src={propertyImagePreview || propertyImage}
                    alt="Property preview"
                    className="h-56 w-full object-cover sm:h-72"
                    onLoad={() => setPropertyImageLoadError(false)}
                    onError={() => setPropertyImageLoadError(true)}
                  />
                </div>
              ) : (
                <label
                  className={`mt-4 flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-5 text-center text-sm leading-6 transition ${
                    propertyPhotoDragging
                      ? "border-teal-400 bg-teal-500/10 text-teal-100"
                      : "border-zinc-700 bg-black/40 text-zinc-400 hover:border-teal-500/50 hover:bg-teal-500/5"
                  }`}
                >
                  <span className="text-3xl">📷</span>
                  <span className="mt-2 block font-black text-teal-300">
                    {propertyPhotoUploading ? "Uploading property photo..." : "Drop or upload property photo"}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-400">
                    {propertyImageLoadError
                      ? "The selected photo could not be displayed. Upload a different image."
                      : "Lookup may add one automatically, or you can choose the correct front photo."}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={propertyPhotoUploading}
                    onChange={(event) =>
                      void uploadPropertyPhoto(event.target.files?.[0] || null)
                    }
                  />
                </label>
              )}

              <div className="mt-3 flex flex-wrap gap-3">
                {(propertyImagePreview || propertyImage) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPropertyImage("");
                      setPropertyImagePreview("");
                      setPropertyImageLoadError(false);
                      setPropertyPhotoError("");
                      setPropertyLookupStatus("Property photo removed. Street View may be used when the inspection is created.");
                    }}
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-black text-zinc-300 transition hover:border-red-400 hover:text-red-200"
                  >
                    Remove Photo
                  </button>
                ) : null}
              </div>

              {propertyPhotoError ? (
                <p className="mt-3 text-sm font-bold text-red-300">
                  {propertyPhotoError}
                </p>
              ) : null}
            </div>
          </Card>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-[#0b1220] p-5">
          <h2 className="mb-4 text-xl font-bold text-teal-400">Agreement</h2>

          <p className="mb-4 text-sm text-zinc-400">
            This will be emailed to the client automatically once the inspection is created. The
            realtor is never sent the agreement. You can still change it later from the report.
          </p>

          <NewInspectionAgreementPicker
            propertyState={stateValue}
            onChange={(state, templateIds) => {
              setAgreementState(state);
              setAgreementTemplateIds(templateIds);
            }}
          />
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

                  const value = toLocalDateKey(date);

                  const label = formatAppValue(date, {
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

            <LabeledInput
              label="Price"
              value={price}
              onChange={(value) => {
                setPrice(value);
                setPriceOverridden(true);
              }}
              placeholder="Price"
            />

            {quote.includesHome && (
              <LabeledInput
                label="Square Feet"
                value={squareFeet}
                onChange={setSquareFeet}
                placeholder={
                  loadingProperty
                    ? "Attempting property lookup..."
                    : "Square Feet"
                }
              />
            )}

            <LabeledInput
              label="Travel Fee"
              value={travelFee}
              onChange={setTravelFee}
              placeholder="Travel Fee"
            />

            {quote.includesMold && (
              <>
                <LabeledInput
                  label="Mold Air Samples"
                  value={moldAirSamples}
                  onChange={setMoldAirSamples}
                  placeholder="Mold Air Samples"
                />

                <LabeledInput
                  label="Mold Surface/Tape/Swab Samples"
                  value={moldSurfaceSamples}
                  onChange={setMoldSurfaceSamples}
                  placeholder="Mold Surface/Tape/Swab Samples"
                />
              </>
            )}

            <LabeledInput
              label="Discount"
              value={discount}
              onChange={setDiscount}
              placeholder="Discount"
            />
          </div>

          <div className="mt-5 rounded-2xl border border-teal-500/40 bg-teal-500/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-zinc-400">
                  {priceOverridden ? "Custom Price" : "Auto Pricing"}
                </p>
                <p className="mt-2 text-4xl font-black text-teal-300">
                  ${effectiveTotal}
                </p>
              </div>
              {priceOverridden && (
                <button
                  type="button"
                  onClick={() => setPriceOverridden(false)}
                  className="shrink-0 rounded-lg border border-teal-500/50 px-3 py-1.5 text-xs font-black text-teal-200 transition hover:bg-teal-500/10"
                >
                  Reset to auto (${quote.total})
                </button>
              )}
            </div>
            <div className="mt-4 grid gap-2 text-sm text-zinc-300 md:grid-cols-2">
              <p>Home Inspection: ${quote.base}</p>
              <p>Radon: ${quote.radonFee}</p>
              <p>Mold Setup/Admin: ${quote.moldSetupFee}</p>
              <p>Mold Air Samples: ${quote.moldAirFee}</p>
              <p>Mold Surface Samples: ${quote.moldSurfaceFee}</p>
              <p>Travel Fee: ${quote.travelFee}</p>
              <p>Discount: -${quote.discount}</p>
              <p className="font-bold text-white">Total: ${effectiveTotal}</p>
            </div>
            {priceOverridden && (
              <p className="mt-3 text-xs text-teal-200/80">
                Using your custom price
                {quote.discount > 0
                  ? ` of $${Number(price) || 0}, minus the $${quote.discount} discount`
                  : ""}
                . The breakdown above shows the auto-calculated amounts for
                reference.
              </p>
            )}
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
          className="mt-6 w-full rounded-xl bg-teal-500 px-5 py-4 text-lg font-black text-black transition active:scale-[0.99] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create Inspection"}
        </button>
      </div>

      {showBillingPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-teal-500 bg-[#0b1220] p-6 shadow-2xl">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-teal-400">
              FLOW Billing
            </p>

            <h2 className="mt-3 text-3xl font-black text-white">
              Your Trial Has Ended
            </h2>

            <p className="mt-4 leading-7 text-zinc-300">
              {billingMessage}
            </p>

            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Activate your subscription to keep creating inspections.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  isIOSNativeApp()
                    ? openInSystemBrowser("/billing")
                    : router.push("/billing")
                }
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

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-bold text-zinc-300">
        {label}
      </label>
      <Input value={value} onChange={onChange} placeholder={placeholder} />
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
        placeholder.toLowerCase().includes("services") ||
        placeholder.toLowerCase().includes("business") ||
        placeholder.toLowerCase().includes("organization")
          ? "text"
          : "number"
      }
      min="0"
      className={`w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white ${className}`}
    />
  );
}
