
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

async function fetchPlaceDetails(placeId: string) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": PLACES_API_KEY,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews",
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || "Unable to load Google business details.");
  }

  return data;
}

export async function POST(request: Request) {
  try {
    if (!PLACES_API_KEY) {
      return NextResponse.json({ error: "Missing GOOGLE_PLACES_API_KEY." }, { status: 500 });
    }

    const { company, error } = await getCompanyForCurrentUser();
    if (error || !company) {
      return NextResponse.json({ error: error || "Company not found." }, { status: error === "Not authenticated." ? 401 : 400 });
    }

    const body = await request.json().catch(() => ({}));
    const placeId = String(body.placeId || "").trim();

    if (!placeId) {
      return NextResponse.json({ error: "Missing Google Place ID." }, { status: 400 });
    }

    const place = await fetchPlaceDetails(placeId);
    const admin = getAdminClient();
    const now = new Date().toISOString();
    const googleMapsUrl = String(place.googleMapsUri || "");

    const { error: companyError } = await admin
      .from("companies")
      .update({
        google_place_id: place.id,
        google_place_name: place.displayName?.text || "",
        google_place_address: place.formattedAddress || "",
        google_maps_url: googleMapsUrl,
        google_rating: place.rating || null,
        google_review_count: place.userRatingCount || 0,
        google_reviews_synced_at: now,
      })
      .eq("id", company.id);

    if (companyError) throw companyError;

    const reviews = (place.reviews || [])
      .map((review: any) => normalizeReview(review, company.id, place.id, googleMapsUrl))
      .filter((review: any) => review.google_review_name);

    if (reviews.length > 0) {
      const { error: reviewsError } = await admin
        .from("public_google_reviews")
        .upsert(reviews, { onConflict: "company_id,google_review_name" });

      if (reviewsError) throw reviewsError;
    }

    return NextResponse.json({
      ok: true,
      googlePlaceId: place.id,
      googlePlaceName: place.displayName?.text || "",
      googleRating: place.rating || null,
      googleReviewCount: place.userRatingCount || 0,
      googleMapsUrl,
      syncedReviews: reviews.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to connect Google business." }, { status: 500 });
  }
}
