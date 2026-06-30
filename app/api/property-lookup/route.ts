import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  "";

// Server-only admin client for writing public-record lookup results to the
// properties cache. Falls back to the existing client if the service key is
// not configured, but auto-save requires the service role key to bypass RLS.
const propertyDb =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : supabase;

const openaiApiKey = process.env.OPENAI_API_KEY || "";
const houseStyleModel = process.env.OPENAI_HOUSE_STYLE_MODEL || "gpt-4o-mini";
const rentcastApiKey =
  process.env.RENTCAST_API_KEY ||
  process.env.NEXT_PUBLIC_RENTCAST_API_KEY ||
  "";

type PropertyLookupBody = {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type NormalizedProperty = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  square_feet?: string | number | null;
  sqft?: string | number | null;
  living_area?: string | number | null;
  squareFootage?: string | number | null;
  livingArea?: string | number | null;
  year_built?: string | number | null;
  yearBuilt?: string | number | null;
  property_type?: string | null;
  propertyType?: string | null;
  propertyStyle?: string | null;
  property_style?: string | null;
  house_style?: string | null;
  style?: string | null;
  roof_style?: string | null;
  roofStyle?: string | null;
  lot_size?: string | number | null;
  acres?: string | number | null;
  property_image_url?: string | null;
  property_image?: string | null;
  street_view_url?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  photoUrl?: string | null;
  primaryPhotoUrl?: string | null;
  primary_photo_url?: string | null;
  photos?: any[] | null;
  SQFTSTRC?: string | number | null;
  YEARBLT?: string | number | null;
  DESCBLDG?: string | null;
  DESCSTYL?: string | null;
  DESCLU?: string | null;
  ACRES?: string | number | null;
};

const MARYLAND_PROPERTY_DATA_URL =
  "https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0/query";

const WEST_VIRGINIA_SITE_ADDRESS_URL =
  "https://services.wvgis.wvu.edu/arcgis/rest/services/Planning_Cadastre/WV_Parcels/MapServer/5/query";

const WEST_VIRGINIA_PARCEL_SUMMARY_URL =
  "https://services.wvgis.wvu.edu/arcgis/rest/services/Planning_Cadastre/WV_Parcels/MapServer/11/query";

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanZip(value: unknown) {
  return cleanText(value).slice(0, 5);
}

function normalizeForCompare(value: unknown) {
  return cleanText(value)
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bLANE\b/g, "LN")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/\bCIRCLE\b/g, "CIR")
    .replace(/\bTERRACE\b/g, "TER")
    .replace(/\bHIGHWAY\b/g, "HWY")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeSqlString(value: string) {
  return value.replace(/'/g, "''");
}

function getHouseNumber(address: string) {
  return (
    normalizeForCompare(address)
      .split(" ")[0]
      ?.replace(/[^0-9]/g, "") || ""
  );
}

function getStreetWords(address: string) {
  const normalized = normalizeForCompare(address);
  const parts = normalized.split(" ").filter(Boolean);
  return parts
    .slice(1)
    .filter(
      (part) =>
        ![
          "ST",
          "AVE",
          "RD",
          "DR",
          "CT",
          "LN",
          "BLVD",
          "PL",
          "CIR",
          "TER",
          "HWY",
        ].includes(part),
    );
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
    fullAddress,
  )}&key=${googleMapsApiKey}`;
}

function getSquareFeet(property: NormalizedProperty | any) {
  return (
    property?.square_feet ||
    property?.SQFTSTRC ||
    property?.sqft ||
    property?.living_area ||
    property?.livingArea ||
    property?.squareFootage ||
    ""
  );
}

function getYearBuilt(property: NormalizedProperty | any) {
  return property?.year_built || property?.YEARBLT || property?.yearBuilt || "";
}

function getPropertyType(property: NormalizedProperty | any) {
  return (
    property?.property_type ||
    property?.propertyType ||
    property?.DESCBLDG ||
    property?.propertyStyle ||
    property?.property_style ||
    property?.house_style ||
    property?.style ||
    property?.DESCLU ||
    ""
  );
}

function getPropertyStyle(property: NormalizedProperty | any) {
  return (
    property?.property_style ||
    property?.propertyStyle ||
    property?.house_style ||
    property?.DESCSTYL ||
    property?.style ||
    getPropertyType(property) ||
    ""
  );
}

function getLotSize(property: NormalizedProperty | any) {
  return property?.lot_size || property?.acres || property?.ACRES || "";
}

function getFirstImageFromArray(value: any) {
  if (!Array.isArray(value)) return "";

  for (const item of value) {
    if (typeof item === "string" && item.trim()) return item.trim();

    const url =
      item?.url ||
      item?.href ||
      item?.imageUrl ||
      item?.photoUrl ||
      item?.largeUrl ||
      item?.mediumUrl ||
      item?.smallUrl ||
      "";

    if (String(url || "").trim()) return String(url).trim();
  }

  return "";
}

function getImage(property: NormalizedProperty | any, streetViewImage: string) {
  return (
    property?.property_image_url ||
    property?.property_image ||
    property?.street_view_url ||
    property?.image ||
    property?.imageUrl ||
    property?.photoUrl ||
    property?.primaryPhotoUrl ||
    property?.primary_photo_url ||
    getFirstImageFromArray(property?.photos) ||
    streetViewImage ||
    ""
  );
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
  property?: NormalizedProperty | any;
  address: string;
  city: string;
  state: string;
  zip: string;
  streetViewImage: string;
}) {
  const squareFeet = getSquareFeet(property || {});
  const yearBuilt = getYearBuilt(property || {});
  const propertyType = getPropertyType(property || {});
  const propertyStyle = getPropertyStyle(property || {});
  const roofStyle = property?.roof_style || property?.roofStyle || "";
  const lotSize = getLotSize(property || {});
  const image = getImage(property || {}, streetViewImage);

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
    propertyStyle: propertyStyle || propertyType,
    property_style: propertyStyle || propertyType,
    style: propertyStyle || propertyType,
    house_style: propertyStyle || propertyType,
    roof_style: roofStyle,
    roofStyle,
    lot_size: lotSize,
    acres: lotSize,
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
  property: NormalizedProperty | any;
  source: string;
  streetViewImage: string;
}) {
  if (!address) return;

  const squareFeet = getSquareFeet(property);
  const yearBuilt = getYearBuilt(property);
  const propertyType = getPropertyType(property);
  const propertyStyle = getPropertyStyle(property);
  const roofStyle = property?.roof_style || property?.roofStyle || null;
  const image = getImage(property, streetViewImage);

  // Keep this payload matched to the properties table you already created.
  // Add extra columns later only after they exist in Supabase.
  const payload: any = {
    address,
    city: city || property?.city || null,
    state: state || property?.state || null,
    zip: zip || property?.zip || null,
    square_feet: squareFeet
      ? Number(String(squareFeet).replace(/[^0-9.]/g, ""))
      : null,
    year_built: yearBuilt ? String(yearBuilt) : null,
    property_type: propertyType || null,
    property_style: propertyStyle || propertyType || null,
    roof_style: roofStyle,
    property_image_url: image || null,
    source,
    updated_at: new Date().toISOString(),
  };

  let existingQuery = propertyDb
    .from("properties")
    .select("id")
    .eq("address", address);
  if (zip) existingQuery = existingQuery.eq("zip", zip);
  if (state) existingQuery = existingQuery.eq("state", state);

  const { data: existing, error: existingError } = await existingQuery
    .limit(1)
    .maybeSingle();

  if (existingError)
    console.warn("Property cache lookup failed:", existingError.message);

  if (existing?.id) {
    const { error } = await propertyDb
      .from("properties")
      .update(payload)
      .eq("id", existing.id);
    if (error) console.warn("Property cache update failed:", error.message);
    return;
  }

  const { error } = await propertyDb.from("properties").insert(payload);
  if (error) console.warn("Property cache insert failed:", error.message);
}

function getRentCastImage(property: any) {
  return (
    property?.property_image_url ||
    property?.property_image ||
    property?.imageUrl ||
    property?.photoUrl ||
    property?.primaryPhotoUrl ||
    property?.primary_photo_url ||
    getFirstImageFromArray(property?.photos) ||
    getFirstImageFromArray(property?.images) ||
    getFirstImageFromArray(property?.propertyPhotos) ||
    getFirstImageFromArray(property?.listingPhotos) ||
    ""
  );
}

function parseRentCastRecord(record: any): NormalizedProperty | null {
  if (!record) return null;

  const squareFeet =
    record.squareFootage ||
    record.livingArea ||
    record.living_area ||
    record.lotAndBuilding?.livingArea ||
    record.features?.livingArea ||
    record.features?.squareFootage ||
    "";

  const yearBuilt =
    record.yearBuilt ||
    record.year_built ||
    record.lotAndBuilding?.yearBuilt ||
    record.features?.yearBuilt ||
    "";

  const propertyType =
    record.propertyType ||
    record.property_type ||
    record.type ||
    record.propertyUse ||
    "";

  const propertyStyle =
    record.architectureType ||
    record.architecture_type ||
    record.propertyStyle ||
    record.style ||
    record.features?.architectureType ||
    propertyType ||
    "";

  const lotSize =
    record.lotSize || record.lot_size || record.lotAndBuilding?.lotSize || "";

  const image = getRentCastImage(record);

  if (
    !squareFeet &&
    !yearBuilt &&
    !propertyType &&
    !propertyStyle &&
    !lotSize &&
    !image
  ) {
    return null;
  }

  return {
    address:
      record.formattedAddress ||
      record.addressLine1 ||
      record.address ||
      record.streetAddress ||
      null,
    city: record.city || null,
    state: record.state || null,
    zip: record.zipCode || record.zip || null,
    square_feet: squareFeet || null,
    squareFootage: squareFeet || null,
    living_area: squareFeet || null,
    livingArea: squareFeet || null,
    year_built: yearBuilt || null,
    yearBuilt: yearBuilt || null,
    property_type: propertyType || null,
    propertyType: propertyType || null,
    property_style: propertyStyle || propertyType || null,
    propertyStyle: propertyStyle || propertyType || null,
    house_style: propertyStyle || propertyType || null,
    style: propertyStyle || propertyType || null,
    lot_size: lotSize || null,
    acres: lotSize || null,
    property_image_url: image || null,
    property_image: image || null,
    image: image || null,
    imageUrl: image || null,
  };
}

async function lookupRentCastProperty({
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
  if (!rentcastApiKey || !address) return null;

  const fullAddress = buildFullAddress({ address, city, state, zip });
  const params = new URLSearchParams({
    address: fullAddress,
    limit: "1",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `https://api.rentcast.io/v1/properties?${params.toString()}`,
      {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "X-Api-Key": rentcastApiKey,
        },
      },
    );

    if (!response.ok) {
      console.warn("RentCast property lookup failed:", response.status);
      return null;
    }

    const data = await response.json();
    const record = Array.isArray(data)
      ? data[0]
      : data?.properties?.[0] || data?.data?.[0] || data;

    return parseRentCastRecord(record);
  } catch (error) {
    console.warn("RentCast property lookup skipped:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseMarylandRecord(attributes: any): NormalizedProperty | null {
  if (!attributes) return null;

  const squareFeet = attributes.SQFTSTRC || "";
  const yearBuilt = attributes.YEARBLT || "";
  const buildingType = attributes.DESCBLDG || "";
  const buildingStyle = attributes.DESCSTYL || "";
  const landUse = attributes.DESCLU || "";
  const acres = attributes.ACRES || "";

  if (
    !squareFeet &&
    !yearBuilt &&
    !buildingType &&
    !buildingStyle &&
    !landUse &&
    !acres
  )
    return null;

  const builtAddress = `${attributes.PREMSNUM || attributes.STRTNUM || ""} ${
    attributes.PREMSDIR || attributes.STRTDIR || ""
  } ${attributes.PREMSNAM || attributes.STRTNAM || ""} ${
    attributes.PREMSTYP || attributes.STRTTYP || ""
  }`
    .replace(/\s+/g, " ")
    .trim();

  return {
    address: attributes.ADDRESS || builtAddress || null,
    city: attributes.CITY || attributes.PREMCITY || null,
    state: "MD",
    zip: attributes.ZIPCODE || attributes.PREMZIP || null,
    square_feet: squareFeet || null,
    year_built: yearBuilt || null,
    property_type: buildingType || landUse || null,
    property_style: buildingStyle || buildingType || landUse || null,
    house_style: buildingStyle || null,
    lot_size: acres || null,
    acres: acres || null,
  };
}

type AiHouseStyleResult = {
  style: string;
  confidence: number;
  reason?: string;
};

const HOUSE_STYLE_OPTIONS = [
  "Ranch",
  "Colonial",
  "Cape Cod",
  "Split Foyer",
  "Split Level",
  "Townhouse",
  "Craftsman",
  "Victorian",
  "Contemporary",
  "Traditional",
  "Manufactured",
  "Other",
];

function normalizeHouseStyle(value: unknown) {
  const raw = cleanText(value);

  if (!raw) return "";

  const directMatch = HOUSE_STYLE_OPTIONS.find(
    (option) => option.toLowerCase() === raw.toLowerCase(),
  );

  if (directMatch) return directMatch;

  const lower = raw.toLowerCase();

  if (lower.includes("split foyer")) return "Split Foyer";
  if (lower.includes("split level")) return "Split Level";
  if (lower.includes("cape")) return "Cape Cod";
  if (lower.includes("colonial")) return "Colonial";
  if (lower.includes("ranch")) return "Ranch";
  if (lower.includes("town")) return "Townhouse";
  if (lower.includes("craftsman")) return "Craftsman";
  if (lower.includes("victorian")) return "Victorian";
  if (lower.includes("contemporary") || lower.includes("modern")) {
    return "Contemporary";
  }
  if (lower.includes("manufactured") || lower.includes("mobile")) {
    return "Manufactured";
  }

  return "Other";
}

function extractJsonObject(text: string) {
  const trimmed = cleanText(text);

  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {}

  const match = trimmed.match(/\{[\s\S]*\}/);

  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function detectHouseStyleFromStreetView({
  address,
  city,
  state,
  zip,
  publicRecord,
  streetViewImage,
}: {
  address: string;
  city: string;
  state: string;
  zip: string;
  publicRecord: NormalizedProperty;
  streetViewImage: string;
}): Promise<AiHouseStyleResult | null> {
  if (!openaiApiKey || !streetViewImage) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const publicRecordContext = [
      getSquareFeet(publicRecord)
        ? `Square feet: ${getSquareFeet(publicRecord)}`
        : "",
      getYearBuilt(publicRecord)
        ? `Year built: ${getYearBuilt(publicRecord)}`
        : "",
      getPropertyType(publicRecord)
        ? `Public record building type: ${getPropertyType(publicRecord)}`
        : "",
      getPropertyStyle(publicRecord)
        ? `Public record building style: ${getPropertyStyle(publicRecord)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: houseStyleModel,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You classify residential home architectural style from a property image. Return JSON only.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Address: ${address}, ${city}, ${state} ${zip}\n` +
                  `${publicRecordContext}\n\n` +
                  "Look at the image and identify the most likely architectural house style. " +
                  "Choose only one of these exact values: Ranch, Colonial, Cape Cod, Split Foyer, Split Level, Townhouse, Craftsman, Victorian, Contemporary, Traditional, Manufactured, Other. " +
                  "Do not use public-record wording like '1 Story With Basement' as the style. " +
                  'Return JSON exactly like: {"style":"Ranch","confidence":0.82,"reason":"short reason"}',
              },
              {
                type: "image_url",
                image_url: {
                  url: streetViewImage,
                },
              },
            ],
          },
        ],
        max_tokens: 160,
      }),
    });

    if (!response.ok) {
      console.warn("AI house style lookup failed:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJsonObject(content);

    if (!parsed) return null;

    const style = normalizeHouseStyle(parsed.style);
    const confidence = Number(parsed.confidence || 0);

    if (!style || style === "Other") {
      return {
        style: style || "Other",
        confidence: Number.isFinite(confidence) ? confidence : 0,
        reason: cleanText(parsed.reason),
      };
    }

    return {
      style,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      reason: cleanText(parsed.reason),
    };
  } catch (error) {
    console.warn("AI house style lookup skipped:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichWithAiHouseStyle({
  address,
  city,
  state,
  zip,
  publicRecord,
  streetViewImage,
}: {
  address: string;
  city: string;
  state: string;
  zip: string;
  publicRecord: NormalizedProperty;
  streetViewImage: string;
}) {
  const aiStyle = await detectHouseStyleFromStreetView({
    address,
    city,
    state,
    zip,
    publicRecord,
    streetViewImage,
  });

  if (
    !aiStyle?.style ||
    aiStyle.style === "Other" ||
    aiStyle.confidence < 0.45
  ) {
    return {
      property: publicRecord,
      source: "maryland_imap_public_records",
    };
  }

  return {
    property: {
      ...publicRecord,
      house_style: aiStyle.style,
      property_style: aiStyle.style,
      propertyStyle: aiStyle.style,
      style: aiStyle.style,
    },
    source: "maryland_imap_public_records_ai_house_style",
  };
}

function marylandAddressFromAttributes(attributes: any) {
  return normalizeForCompare(
    attributes?.ADDRESS ||
      `${attributes?.PREMSNUM || attributes?.STRTNUM || ""} ${
        attributes?.PREMSDIR || attributes?.STRTDIR || ""
      } ${attributes?.PREMSNAM || attributes?.STRTNAM || ""} ${
        attributes?.PREMSTYP || attributes?.STRTTYP || ""
      }`,
  );
}

function recordLooksLikeTargetAddress(attributes: any, targetAddress: string) {
  const recordAddress = marylandAddressFromAttributes(attributes);
  if (!recordAddress) return false;
  if (recordAddress === targetAddress) return true;

  const targetHouseNumber = targetAddress.split(" ")[0];
  const recordHouseNumber = recordAddress.split(" ")[0];

  if (!targetHouseNumber || targetHouseNumber !== recordHouseNumber)
    return false;

  const targetWords = getStreetWords(targetAddress);
  if (targetWords.length === 0) return false;

  return targetWords.every((word) => recordAddress.includes(word));
}

async function fetchMarylandFeatures(
  where: string,
  resultRecordCount = "1000",
) {
  const params = new URLSearchParams({
    f: "json",
    where,
    outFields:
      "ADDRESS,STRTNUM,STRTDIR,STRTNAM,STRTTYP,PREMSNUM,PREMSDIR,PREMSNAM,PREMSTYP,CITY,PREMCITY,ZIPCODE,PREMZIP,SQFTSTRC,YEARBLT,DESCBLDG,DESCSTYL,DESCLU,ACRES,BLDG_STORY,SDATWEBADR,SDATDATE,MDPVDATE",
    returnGeometry: "false",
    resultRecordCount,
  });

  const res = await fetch(
    `${MARYLAND_PROPERTY_DATA_URL}?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!res.ok) return [];

  const data = await res.json();
  return Array.isArray(data?.features) ? data.features : [];
}

async function lookupMarylandPublicRecords({
  address,
  city,
  zip,
}: {
  address: string;
  city: string;
  zip: string;
}) {
  const targetAddress = normalizeForCompare(address);
  const targetCity = normalizeForCompare(city);
  const houseNumber = getHouseNumber(address);
  const streetWords = getStreetWords(address);
  const safeZip = escapeSqlString(zip);
  const safeCity = escapeSqlString(targetCity);
  const safeHouseNumber = escapeSqlString(houseNumber);
  const primaryStreetWord = escapeSqlString(streetWords[0] || "");

  const whereAttempts: string[] = [];

  // Best search: house number + zip. This prevents missing properties because
  // the old ZIP-only search only returned the first chunk of parcels.
  if (safeHouseNumber && safeZip) {
    whereAttempts.push(
      `(STRTNUM=${safeHouseNumber} OR PREMSNUM='${safeHouseNumber}') AND (ZIPCODE='${safeZip}' OR PREMZIP='${safeZip}')`,
    );
  }

  // Next search: house number + city.
  if (safeHouseNumber && safeCity) {
    whereAttempts.push(
      `(STRTNUM=${safeHouseNumber} OR PREMSNUM='${safeHouseNumber}') AND (UPPER(CITY)='${safeCity}' OR UPPER(PREMCITY)='${safeCity}')`,
    );
  }

  // Next search: street word + zip for records where the house number field is blank/weird.
  if (primaryStreetWord && safeZip) {
    whereAttempts.push(
      `(UPPER(ADDRESS) LIKE '%${primaryStreetWord}%' OR UPPER(STRTNAM) LIKE '%${primaryStreetWord}%' OR UPPER(PREMSNAM) LIKE '%${primaryStreetWord}%') AND (ZIPCODE='${safeZip}' OR PREMZIP='${safeZip}')`,
    );
  }

  // Last reasonable search: zip only, larger limit.
  if (safeZip) {
    whereAttempts.push(`(ZIPCODE='${safeZip}' OR PREMZIP='${safeZip}')`);
  }

  // Final fallback if ZIP was missing.
  if (!safeZip && safeCity) {
    whereAttempts.push(
      `(UPPER(CITY)='${safeCity}' OR UPPER(PREMCITY)='${safeCity}')`,
    );
  }

  for (const where of whereAttempts) {
    const features = await fetchMarylandFeatures(where, "1000");
    const exactFeature = features.find((feature: any) =>
      recordLooksLikeTargetAddress(feature?.attributes || {}, targetAddress),
    );

    if (exactFeature?.attributes)
      return parseMarylandRecord(exactFeature.attributes);
  }

  return null;
}

function getFirstValue(attributes: any, keys: string[]) {
  if (!attributes) return "";

  for (const key of keys) {
    const value = attributes[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function westVirginiaAddressFromAttributes(attributes: any) {
  const directAddress = getFirstValue(attributes, [
    "FULLADDR",
    "FULL_ADDR",
    "FULL_ADDRES",
    "FULL_ADDRESS",
    "ADDRESS",
    "SITE_ADDRESS",
    "SITEADDR",
    "SITUS_ADDRESS",
    "SITUSADDR",
    "PHYSICAL_ADDRESS",
    "PHYSADDR",
    "ADDR",
    "LOCADDR",
    "LOCATION",
  ]);

  if (directAddress) return normalizeForCompare(directAddress);

  const houseNumber = getFirstValue(attributes, [
    "ADDNUM",
    "ADDRNUM",
    "HOUSE_NUM",
    "HOUSENUM",
    "STREET_NO",
    "STNO",
    "NUMBER",
    "SITE_NUM",
  ]);

  const streetName = getFirstValue(attributes, [
    "STREET",
    "ST_NAME",
    "STREETNAME",
    "RDNAME",
    "ROADNAME",
    "NAME",
  ]);

  const streetType = getFirstValue(attributes, [
    "ST_TYPE",
    "STREETTYPE",
    "STTYPE",
    "ROADTYPE",
    "TYPE",
  ]);

  return normalizeForCompare(
    `${houseNumber || ""} ${streetName || ""} ${streetType || ""}`,
  );
}

function westVirginiaRecordLooksLikeTargetAddress(
  attributes: any,
  targetAddress: string,
) {
  const recordAddress = westVirginiaAddressFromAttributes(attributes);
  if (!recordAddress) return false;
  if (recordAddress === targetAddress) return true;

  const targetHouseNumber = targetAddress.split(" ")[0];
  const recordHouseNumber = recordAddress.split(" ")[0];

  if (!targetHouseNumber || targetHouseNumber !== recordHouseNumber)
    return false;

  const targetWords = getStreetWords(targetAddress);
  if (targetWords.length === 0) return false;

  return targetWords.every((word) => recordAddress.includes(word));
}

function parseWestVirginiaRecord(attributes: any): NormalizedProperty | null {
  if (!attributes) return null;

  const squareFeet = getFirstValue(attributes, [
    "SQFT",
    "SQFTSTRC",
    "STRUCTURE_SQFT",
    "BLDG_SQFT",
    "BUILDING_SQFT",
    "LIVING_AREA",
    "LIV_AREA",
    "FIN_SQFT",
    "TOTAL_SQFT",
    "AREA",
  ]);

  const yearBuilt = getFirstValue(attributes, [
    "YEAR_BUILT",
    "YR_BUILT",
    "YEARBLT",
    "BUILT_YEAR",
    "BLT_YR",
    "YRBLT",
  ]);

  const propertyType = getFirstValue(attributes, [
    "PROPERTY_TYPE",
    "PROP_TYPE",
    "CLASS_DESC",
    "CLASSDESC",
    "LAND_USE",
    "LANDUSE",
    "USE_DESC",
    "DESCLU",
    "TYPE",
  ]);

  const propertyStyle = getFirstValue(attributes, [
    "STYLE",
    "BLDG_STYLE",
    "HOUSE_STYLE",
    "DESCSTYL",
    "STRUCTURE_STYLE",
  ]);

  const acres = getFirstValue(attributes, [
    "ACRES",
    "ACREAGE",
    "LOT_ACRES",
    "PARCEL_ACRES",
    "LOT_SIZE",
  ]);

  const parsedAddress =
    getFirstValue(attributes, [
      "FULLADDR",
      "FULL_ADDR",
      "FULL_ADDRES",
      "FULL_ADDRESS",
      "ADDRESS",
      "SITE_ADDRESS",
      "SITEADDR",
      "SITUS_ADDRESS",
      "SITUSADDR",
      "PHYSICAL_ADDRESS",
      "PHYSADDR",
      "ADDR",
      "LOCADDR",
      "LOCATION",
    ]) || "";

  const parsedCity = getFirstValue(attributes, [
    "CITY",
    "MUNICIPALITY",
    "POSTCOMM",
    "COMMUNITY",
  ]);

  const parsedZip = getFirstValue(attributes, [
    "ZIP",
    "ZIPCODE",
    "ZIP_CODE",
    "POSTCODE",
  ]);

  if (
    !parsedAddress &&
    !squareFeet &&
    !yearBuilt &&
    !propertyType &&
    !propertyStyle &&
    !acres
  ) {
    return null;
  }

  return {
    address: parsedAddress || null,
    city: parsedCity || null,
    state: "WV",
    zip: parsedZip ? String(parsedZip).slice(0, 5) : null,
    square_feet: squareFeet || null,
    year_built: yearBuilt || null,
    property_type: propertyType || null,
    property_style: propertyStyle || propertyType || null,
    house_style: propertyStyle || null,
    lot_size: acres || null,
    acres: acres || null,
  };
}

async function fetchWestVirginiaFeatures(
  url: string,
  where: string,
  resultRecordCount = "1000",
) {
  const params = new URLSearchParams({
    f: "json",
    where,
    outFields: "*",
    returnGeometry: "false",
    resultRecordCount,
  });

  const res = await fetch(`${url}?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) return [];

  const data = await res.json();
  return Array.isArray(data?.features) ? data.features : [];
}

async function lookupWestVirginiaPublicRecords({
  address,
  city,
  zip,
}: {
  address: string;
  city: string;
  zip: string;
}) {
  const targetAddress = normalizeForCompare(address);
  const targetCity = normalizeForCompare(city);
  const houseNumber = getHouseNumber(address);
  const streetWords = getStreetWords(address);
  const safeZip = escapeSqlString(zip);
  const safeCity = escapeSqlString(targetCity);
  const safeHouseNumber = escapeSqlString(houseNumber);
  const primaryStreetWord = escapeSqlString(streetWords[0] || "");

  const whereAttempts: string[] = [];

  if (safeHouseNumber && primaryStreetWord && safeZip) {
    whereAttempts.push(
      `(UPPER(FULLADDR) LIKE '%${safeHouseNumber}%' OR UPPER(ADDRESS) LIKE '%${safeHouseNumber}%' OR UPPER(SITEADDR) LIKE '%${safeHouseNumber}%') AND (UPPER(FULLADDR) LIKE '%${primaryStreetWord}%' OR UPPER(ADDRESS) LIKE '%${primaryStreetWord}%' OR UPPER(SITEADDR) LIKE '%${primaryStreetWord}%') AND (ZIP='${safeZip}' OR ZIPCODE='${safeZip}' OR ZIP_CODE='${safeZip}')`,
    );
  }

  if (safeHouseNumber && primaryStreetWord && safeCity) {
    whereAttempts.push(
      `(UPPER(FULLADDR) LIKE '%${safeHouseNumber}%' OR UPPER(ADDRESS) LIKE '%${safeHouseNumber}%' OR UPPER(SITEADDR) LIKE '%${safeHouseNumber}%') AND (UPPER(FULLADDR) LIKE '%${primaryStreetWord}%' OR UPPER(ADDRESS) LIKE '%${primaryStreetWord}%' OR UPPER(SITEADDR) LIKE '%${primaryStreetWord}%') AND (UPPER(CITY)='${safeCity}' OR UPPER(MUNICIPALITY)='${safeCity}' OR UPPER(POSTCOMM)='${safeCity}')`,
    );
  }

  if (safeZip) {
    whereAttempts.push(
      `(ZIP='${safeZip}' OR ZIPCODE='${safeZip}' OR ZIP_CODE='${safeZip}')`,
    );
  }

  if (!safeZip && safeCity) {
    whereAttempts.push(
      `(UPPER(CITY)='${safeCity}' OR UPPER(MUNICIPALITY)='${safeCity}' OR UPPER(POSTCOMM)='${safeCity}')`,
    );
  }

  for (const where of whereAttempts) {
    const addressFeatures = await fetchWestVirginiaFeatures(
      WEST_VIRGINIA_SITE_ADDRESS_URL,
      where,
      "1000",
    );

    const addressMatch = addressFeatures.find((feature: any) =>
      westVirginiaRecordLooksLikeTargetAddress(
        feature?.attributes || {},
        targetAddress,
      ),
    );

    if (addressMatch?.attributes) {
      const parsedAddressRecord = parseWestVirginiaRecord(
        addressMatch.attributes,
      );

      // Try the parcel summary table too. Some WV services expose richer parcel
      // attributes there than on the address-point layer.
      const parcelFeatures = await fetchWestVirginiaFeatures(
        WEST_VIRGINIA_PARCEL_SUMMARY_URL,
        where,
        "1000",
      );

      const parcelMatch = parcelFeatures.find((feature: any) =>
        westVirginiaRecordLooksLikeTargetAddress(
          feature?.attributes || {},
          targetAddress,
        ),
      );

      const parsedParcelRecord = parseWestVirginiaRecord(
        parcelMatch?.attributes || {},
      );

      return {
        ...(parsedAddressRecord || {}),
        ...(parsedParcelRecord || {}),
        address:
          parsedAddressRecord?.address ||
          parsedParcelRecord?.address ||
          address,
        city: parsedAddressRecord?.city || parsedParcelRecord?.city || city,
        state: "WV",
        zip: parsedAddressRecord?.zip || parsedParcelRecord?.zip || zip,
      };
    }

    const parcelFeatures = await fetchWestVirginiaFeatures(
      WEST_VIRGINIA_PARCEL_SUMMARY_URL,
      where,
      "1000",
    );

    const parcelMatch = parcelFeatures.find((feature: any) =>
      westVirginiaRecordLooksLikeTargetAddress(
        feature?.attributes || {},
        targetAddress,
      ),
    );

    if (parcelMatch?.attributes) {
      const parsedParcelRecord = parseWestVirginiaRecord(
        parcelMatch.attributes,
      );

      if (parsedParcelRecord) {
        return {
          ...parsedParcelRecord,
          address: parsedParcelRecord.address || address,
          city: parsedParcelRecord.city || city,
          state: "WV",
          zip: parsedParcelRecord.zip || zip,
        };
      }
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PropertyLookupBody;

    const address = cleanText(body.address);
    const city = cleanText(body.city);
    const state = cleanText(body.state || "MD").toUpperCase();
    const zip = cleanZip(body.zip);

    if (!address)
      return NextResponse.json({ error: "Missing address" }, { status: 400 });

    const fullAddress = buildFullAddress({ address, city, state, zip });
    const streetViewImage = buildStreetViewImage(fullAddress);

    // 1) RentCast first. This runs during scheduling/property lookup and can
    // provide square footage and any available property image before falling
    // back to public records, Google Street View, and On Point cache/history.
    const rentCastProperty = await lookupRentCastProperty({
      address,
      city,
      state,
      zip,
    });

    if (rentCastProperty) {
      await saveToPropertiesTable({
        address,
        city,
        state,
        zip,
        property: rentCastProperty,
        source: "rentcast_property_records",
        streetViewImage,
      });

      return NextResponse.json(
        responsePayload({
          source: "rentcast_property_records",
          property: rentCastProperty,
          address,
          city,
          state,
          zip,
          streetViewImage,
        }),
      );
    }

    // 2) Public records for Maryland. If found, save immediately.
    if (state === "MD") {
      const publicRecord = await lookupMarylandPublicRecords({
        address,
        city,
        zip,
      });

      if (publicRecord) {
        const enriched = await enrichWithAiHouseStyle({
          address,
          city,
          state,
          zip,
          publicRecord,
          streetViewImage,
        });

        await saveToPropertiesTable({
          address,
          city,
          state,
          zip,
          property: enriched.property,
          source: enriched.source,
          streetViewImage,
        });

        return NextResponse.json(
          responsePayload({
            source: enriched.source,
            property: enriched.property,
            address,
            city,
            state,
            zip,
            streetViewImage,
          }),
        );
      }
    }

    // 3) Public records for West Virginia. This is best-effort because WV's
    // statewide parcel/address service has less consistent building-detail
    // coverage than Maryland. If it finds a match, it still saves immediately.
    if (state === "WV") {
      const publicRecord = await lookupWestVirginiaPublicRecords({
        address,
        city,
        zip,
      });

      if (publicRecord) {
        const enriched = await enrichWithAiHouseStyle({
          address,
          city,
          state,
          zip,
          publicRecord,
          streetViewImage,
        });

        await saveToPropertiesTable({
          address,
          city,
          state,
          zip,
          property: enriched.property,
          source:
            enriched.source === "maryland_imap_public_records_ai_house_style"
              ? "west_virginia_public_records_ai_house_style"
              : "west_virginia_public_records",
          streetViewImage,
        });

        return NextResponse.json(
          responsePayload({
            source:
              enriched.source === "maryland_imap_public_records_ai_house_style"
                ? "west_virginia_public_records_ai_house_style"
                : "west_virginia_public_records",
            property: enriched.property,
            address,
            city,
            state,
            zip,
            streetViewImage,
          }),
        );
      }
    }

    // 4) On Point property cache fallback. Exact match only.
    let cacheQuery = propertyDb
      .from("properties")
      .select(
        "address, city, state, zip, square_feet, year_built, property_type, property_style, roof_style, property_image_url, source, updated_at",
      )
      .eq("address", address);

    if (zip) cacheQuery = cacheQuery.eq("zip", zip);
    if (state) cacheQuery = cacheQuery.eq("state", state);

    const { data: cachedProperty, error: cachedError } = await cacheQuery
      .order("updated_at", { ascending: false })
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
        }),
      );
    }

    // 5) Previous inspection fallback. Exact match only.
    let inspectionQuery = supabase
      .from("inspections")
      .select(
        "address, property_address, city, state, zip, square_feet, sqft, year_built, property_type, property_style, house_style, roof_style, property_image, property_image_url, street_view_url, created_at",
      )
      .eq("address", address);

    if (zip) inspectionQuery = inspectionQuery.eq("zip", zip);
    if (state) inspectionQuery = inspectionQuery.eq("state", state);

    let { data: savedInspection } = await inspectionQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!savedInspection) {
      let legacyQuery = supabase
        .from("inspections")
        .select(
          "address, property_address, city, state, zip, square_feet, sqft, year_built, property_type, property_style, house_style, roof_style, property_image, property_image_url, street_view_url, created_at",
        )
        .eq("property_address", address);

      if (zip) legacyQuery = legacyQuery.eq("zip", zip);
      if (state) legacyQuery = legacyQuery.eq("state", state);

      const legacyResult = await legacyQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      savedInspection = legacyResult.data;
    }

    if (
      savedInspection?.square_feet ||
      savedInspection?.sqft ||
      savedInspection?.year_built ||
      savedInspection?.property_type ||
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
        }),
      );
    }

    // 6) Manual fallback.
    return NextResponse.json(
      responsePayload({
        source: "manual_needed_google_streetview_only",
        property: {},
        address,
        city,
        state,
        zip,
        streetViewImage,
      }),
    );
  } catch (error) {
    console.error("Property lookup failed:", error);
    return NextResponse.json(
      { error: "Failed to look up property" },
      { status: 500 },
    );
  }
}
