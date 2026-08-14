
import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  hasPlacesKey,
  fetchPlaceCore,
  fetchReviewsForStore,
  replaceCompanyReviews,
} from "../../../../lib/googlePlaces";

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

export async function POST() {
  try {
    if (!hasPlacesKey()) {
      return NextResponse.json({ error: "Missing GOOGLE_PLACES_API_KEY." }, { status: 500 });
    }

    const { company, error } = await getCompanyForCurrentUser();
    if (error || !company) {
      return NextResponse.json({ error: error || "Company not found." }, { status: error === "Not authenticated." ? 401 : 400 });
    }

    const placeId = String(company.google_place_id || "").trim();
    if (!placeId) {
      return NextResponse.json({ error: "Connect a Google Business Profile first." }, { status: 400 });
    }

    const place = await fetchPlaceCore(placeId);
    const admin = getAdminClient();
    const now = new Date().toISOString();
    const googleMapsUrl = String(place.googleMapsUri || company.google_maps_url || "");

    const { error: companyError } = await admin
      .from("companies")
      .update({
        google_place_name: place.displayName?.text || company.google_place_name || "",
        google_place_address: place.formattedAddress || company.google_place_address || "",
        google_maps_url: googleMapsUrl,
        google_rating: place.rating || null,
        google_review_count: place.userRatingCount || 0,
        google_reviews_synced_at: now,
      })
      .eq("id", company.id);

    if (companyError) throw companyError;

    // Pull the NEWEST reviews and replace the stored mirror so a just-posted
    // review shows up right away.
    const reviews = await fetchReviewsForStore(
      placeId,
      company.id,
      googleMapsUrl,
      place.reviews || []
    );
    await replaceCompanyReviews(admin, company.id, reviews);

    return NextResponse.json({
      ok: true,
      googleRating: place.rating || null,
      googleReviewCount: place.userRatingCount || 0,
      syncedReviews: reviews.length,
      syncedAt: now,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unable to sync Google reviews." }, { status: 500 });
  }
}
