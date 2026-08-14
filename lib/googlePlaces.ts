// Shared Google Places helpers for keeping a company's rating, review count,
// and recent review snippets fresh (used by the manual sync route and the
// review-alert cron).
//
// Why two endpoints:
//  - The New Places API reliably gives the true rating + total userRatingCount,
//    but returns at most 5 review snippets sorted by "most relevant" with no way
//    to request newest -- so a brand-new review can be missing from the snippets.
//  - The legacy Place Details endpoint supports reviews_sort=newest, so we use it
//    to fetch the 5 NEWEST reviews. If it's not enabled on the project it throws,
//    and we fall back to the New API's snippets (no regression).

const PLACES_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

export function hasPlacesKey() {
  return Boolean(PLACES_API_KEY);
}

export async function fetchPlaceCore(placeId: string) {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": PLACES_API_KEY,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews",
      },
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "Unable to fetch Google place.");
  }
  return data;
}

async function fetchNewestReviewsLegacy(placeId: string): Promise<any[]> {
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&reviews_sort=newest` +
    `&fields=reviews` +
    `&key=${PLACES_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));

  if (data?.status && data.status !== "OK") {
    throw new Error(data.error_message || `Legacy reviews fetch failed: ${data.status}`);
  }
  return data?.result?.reviews || [];
}

function toIso(value: any): string | null {
  if (!value) return null;
  // Legacy reviews use a Unix-seconds integer; the New API uses an RFC3339 string.
  if (typeof value === "number") {
    try {
      return new Date(value * 1000).toISOString();
    } catch {
      return null;
    }
  }
  return String(value);
}

export function normalizeGoogleReview(
  review: any,
  companyId: any,
  placeId: string,
  mapsUrl: string
) {
  const text =
    review?.text?.text ||
    review?.originalText?.text ||
    (typeof review?.text === "string" ? review.text : "") ||
    "";
  const publish = review?.publishTime || review?.time || null;
  const stableName =
    review?.name ||
    `${placeId}-${review?.time || review?.publishTime || review?.author_name || ""}`;

  return {
    company_id: companyId,
    google_place_id: placeId,
    google_review_name: String(stableName),
    author_name: String(
      review?.authorAttribution?.displayName || review?.author_name || "Google Reviewer"
    ),
    author_photo_url: String(
      review?.authorAttribution?.photoUri || review?.profile_photo_url || ""
    ),
    rating: Number(review?.rating || 0) || null,
    review_text: String(text || ""),
    relative_publish_time_description: String(
      review?.relativePublishTimeDescription || review?.relative_time_description || ""
    ),
    publish_time: toIso(publish),
    original_text_language_code: String(
      review?.originalText?.languageCode || review?.text?.languageCode || review?.language || ""
    ),
    google_maps_uri: mapsUrl,
    is_enabled: true,
    updated_at: new Date().toISOString(),
  };
}

// Newest reviews (legacy) with New-API snippets as fallback, normalized for storage.
export async function fetchReviewsForStore(
  placeId: string,
  companyId: any,
  mapsUrl: string,
  fallbackReviews: any[] = []
) {
  let raw: any[] = [];
  try {
    raw = await fetchNewestReviewsLegacy(placeId);
  } catch {
    raw = fallbackReviews || [];
  }
  if (!raw.length) raw = fallbackReviews || [];

  return raw
    .map((r) => normalizeGoogleReview(r, companyId, placeId, mapsUrl))
    .filter((r) => r.google_review_name);
}

// Replace the company's stored review mirror with a fresh set. This keeps the
// newest reviews on top, drops reviews deleted on Google, and avoids duplicate
// rows from mixing the New-API and legacy id schemes. Never wipes on an empty
// fetch (which would blank the public profile on a transient error).
export async function replaceCompanyReviews(admin: any, companyId: any, reviews: any[]) {
  if (!reviews || reviews.length === 0) return;
  await admin.from("public_google_reviews").delete().eq("company_id", companyId);
  await admin
    .from("public_google_reviews")
    .upsert(reviews, { onConflict: "company_id,google_review_name" });
}
