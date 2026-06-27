
import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const PLACES_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCompanyForCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, company: null, error: "Not authenticated." };

  const { data: companyUser, error: companyUserError } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (companyUserError) {
    return { user, company: null, error: companyUserError.message };
  }

  if (!companyUser?.company_id) {
    return { user, company: null, error: "Company not found." };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyUser.company_id)
    .maybeSingle();

  if (companyError) {
    return { user, company: null, error: companyError.message };
  }

  if (!company) return { user, company: null, error: "Company not found." };

  return { user, company, error: "" };
}

function normalizeReview(review: any, companyId: any, placeId: string, mapsUrl: string) {
  const text =
    review?.text?.text ||
    review?.originalText?.text ||
    review?.text ||
    "";

  return {
    company_id: companyId,
    google_place_id: placeId,
    google_review_name: String(review?.name || `${placeId}-${review?.publishTime || Math.random()}`),
    author_name: String(review?.authorAttribution?.displayName || review?.author_name || "Google Reviewer"),
    author_photo_url: String(review?.authorAttribution?.photoUri || review?.profile_photo_url || ""),
    rating: Number(review?.rating || 0) || null,
    review_text: String(text || ""),
    relative_publish_time_description: String(review?.relativePublishTimeDescription || review?.relative_time_description || ""),
    publish_time: review?.publishTime || review?.time || null,
    original_text_language_code: String(review?.originalText?.languageCode || review?.text?.languageCode || ""),
    google_maps_uri: mapsUrl,
    is_enabled: true,
    updated_at: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    if (!PLACES_API_KEY) {
      return NextResponse.json({ error: "Missing GOOGLE_PLACES_API_KEY." }, { status: 500 });
    }

    const { error } = await getCompanyForCurrentUser();
    if (error) return NextResponse.json({ error }, { status: error === "Not authenticated." ? 401 : 400 });

    const body = await request.json().catch(() => ({}));
    const query = String(body.query || "").trim();

    if (!query) {
      return NextResponse.json({ error: "Enter a business name or location." }, { status: 400 });
    }

    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Google business search failed." },
        { status: 500 },
      );
    }

    const places = (data?.places || []).map((place: any) => ({
      placeId: place.id,
      name: place.displayName?.text || "Google Business",
      address: place.formattedAddress || "",
      rating: place.rating || null,
      reviewCount: place.userRatingCount || 0,
      googleMapsUrl: place.googleMapsUri || "",
    }));

    return NextResponse.json({ places });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Google business search failed." }, { status: 500 });
  }
}
