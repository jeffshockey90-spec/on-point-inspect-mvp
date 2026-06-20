import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

type PropertyLookupBody = {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function normalizeAddress(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFullAddress({
  address,
  city,
  state,
  zip,
}: {
  address: string;
  city: string;
  state: string;
  zip: string;
}) {
  return [address, city, state, zip].filter(Boolean).join(", ").trim();
}

function buildStreetViewImage(fullAddress: string) {
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!googleMapsApiKey || !fullAddress) return "";

  return `https://maps.googleapis.com/maps/api/streetview?size=900x500&location=${encodeURIComponent(
    fullAddress
  )}&key=${googleMapsApiKey}`;
}

function responsePayload({
  source,
  property,
  address,
  city,
  state,
  zip,
  streetViewImage,
}: {
  source: string;
  property?: any;
  address: string;
  city: string;
  state: string;
  zip: string;
  streetViewImage: string;
}) {
  const squareFeet =
    property?.square_feet || property?.sqft || property?.living_area || "";

  const yearBuilt = property?.year_built || property?.yearBuilt || "";

  const propertyType =
    property?.property_type ||
    property?.propertyStyle ||
    property?.property_style ||
    property?.house_style ||
    property?.style ||
    "";

  const roofStyle = property?.roof_style || property?.roofStyle || "";

  const image =
    property?.property_image ||
    property?.property_image_url ||
    property?.street_view_url ||
    property?.image ||
    streetViewImage ||
    "";

  return {
    source,

    square_feet: squareFeet,
    squareFeet,
    livingArea: squareFeet,
    living_area: squareFeet,

    year_built: yearBuilt,
    yearBuilt,

    property_type: propertyType,
    propertyType,
    propertyStyle: propertyType,
    style: propertyType,
    house_style: propertyType,

    roof_style: roofStyle,
    roofStyle,

    property_image: image,
    property_image_url: image,
    image,
    photo: image,

    address,
    city,
    state,
    zip,
  };
}

async function saveToPropertiesTable({
  address,
  city,
  state,
  zip,
  property,
  source,
  streetViewImage,
}: {
  address: string;
  city: string;
  state: string;
  zip: string;
  property: any;
  source: string;
  streetViewImage: string;
}) {
  const normalizedAddress = normalizeAddress(address);

  if (!normalizedAddress) return;

  const payload: any = {
    address,
    city: city || null,
    state: state || null,
    zip: zip || null,
    square_feet:
      property?.square_feet || property?.sqft || property?.living_area || null,
    year_built: property?.year_built || null,
    property_type:
      property?.property_type || property?.property_style || property?.house_style || null,
    property_style: property?.property_style || property?.house_style || null,
    roof_style: property?.roof_style || null,
    property_image:
      property?.property_image || property?.street_view_url || streetViewImage || null,
    source,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("properties")
    .select("id")
    .ilike("address", address)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("properties").update(payload).eq("id", existing.id);
    return;
  }

  await supabase.from("properties").insert(payload);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PropertyLookupBody;

    const address = cleanText(body.address);
    const city = cleanText(body.city);
    const state = cleanText(body.state || "MD");
    const zip = cleanText(body.zip);

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    const fullAddress = buildFullAddress({ address, city, state, zip });
    const streetViewImage = buildStreetViewImage(fullAddress);

    // 1) Check On Point's dedicated property cache first.
    // This is the fast, no-cost lookup that grows over time.
    const { data: cachedProperty, error: cachedError } = await supabase
      .from("properties")
      .select(
        "address, city, state, zip, square_feet, year_built, property_type, property_style, roof_style, property_image, source, updated_at"
      )
      .ilike("address", `%${address}%`)
      .limit(1)
      .maybeSingle();

    if (!cachedError && cachedProperty) {
      return NextResponse.json(
        responsePayload({
          source: cachedProperty.source || "on_point_property_cache",
          property: cachedProperty,
          address,
          city,
          state,
          zip,
          streetViewImage,
        })
      );
    }

    // 2) Fallback to previous inspections.
    // If any inspector has already entered this address/details, reuse it.
    const { data: savedInspection } = await supabase
      .from("inspections")
      .select(
        "square_feet, sqft, year_built, property_type, property_style, house_style, roof_style, property_image, street_view_url, created_at"
      )
      .or(`property_address.ilike.%${address}%,address.ilike.%${address}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      savedInspection?.square_feet ||
      savedInspection?.sqft ||
      savedInspection?.year_built ||
      savedInspection?.property_style ||
      savedInspection?.house_style ||
      savedInspection?.roof_style
    ) {
      await saveToPropertiesTable({
        address,
        city,
        state,
        zip,
        property: savedInspection,
        source: "inspection_history_cache",
        streetViewImage,
      });

      return NextResponse.json(
        responsePayload({
          source: "inspection_history_cache",
          property: savedInspection,
          address,
          city,
          state,
          zip,
          streetViewImage,
        })
      );
    }

    // 3) No paid API and no scraper here.
    // Return Street View image so the UI still feels useful, then manual fields can be saved.
    return NextResponse.json(
      responsePayload({
        source: "manual_needed_google_streetview_only",
        property: {},
        address,
        city,
        state,
        zip,
        streetViewImage,
      })
    );
  } catch (error) {
    console.error("Property lookup failed:", error);

    return NextResponse.json(
      { error: "Failed to look up property" },
      { status: 500 }
    );
  }
}
