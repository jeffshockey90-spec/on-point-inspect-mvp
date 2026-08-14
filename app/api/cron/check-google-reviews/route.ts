import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { sendPushNotification } from "../../../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLACES_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  const authHeader = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

async function fetchPlaceDetails(placeId: string) {
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

function normalizeReview(review: any, companyId: any, placeId: string, mapsUrl: string) {
  const text =
    review?.text?.text || review?.originalText?.text || review?.text || "";

  return {
    company_id: companyId,
    google_place_id: placeId,
    google_review_name: String(
      review?.name || `${placeId}-${review?.publishTime || ""}`
    ),
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
    publish_time: review?.publishTime || review?.time || null,
    original_text_language_code: String(
      review?.originalText?.languageCode || review?.text?.languageCode || ""
    ),
    google_maps_uri: mapsUrl,
    is_enabled: true,
    updated_at: new Date().toISOString(),
  };
}

// Resolve the email addresses of a company's own members so the alert reaches
// that company's owner only -- never the SaaS owner or other tenants.
async function getCompanyMemberEmails(admin: any, companyId: any): Promise<string[]> {
  const emails = new Set<string>();

  const { data: members } = await admin
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId);

  const userIds = (members || [])
    .map((row: any) => String(row.user_id || ""))
    .filter(Boolean);

  if (userIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id,email")
      .in("user_id", userIds);
    for (const row of profiles || []) {
      if (row.email) emails.add(String(row.email).toLowerCase());
    }
  }

  const { data: company } = await admin
    .from("companies")
    .select("email")
    .eq("id", companyId)
    .maybeSingle();
  if (company?.email) emails.add(String(company.email).toLowerCase());

  return Array.from(emails);
}

async function processCompany(admin: any, company: any) {
  const placeId = String(company.google_place_id || "").trim();
  if (!placeId) return { id: company.id, skipped: "no-place-id" };

  const place = await fetchPlaceDetails(placeId);
  const now = new Date().toISOString();
  const googleMapsUrl = String(place.googleMapsUri || company.google_maps_url || "");

  const prevCount = Number(company.google_review_count || 0);
  const newCount = Number(place.userRatingCount || 0);
  const rating = place.rating || null;

  // Keep the stored rating/count/reviews fresh on every check so the public
  // profile reflects reality without anyone pressing "Sync".
  await admin
    .from("companies")
    .update({
      google_place_name: place.displayName?.text || company.google_place_name || "",
      google_place_address: place.formattedAddress || company.google_place_address || "",
      google_maps_url: googleMapsUrl,
      google_rating: rating,
      google_review_count: newCount,
      google_reviews_synced_at: now,
      google_review_alerts_checked_at: now,
    })
    .eq("id", company.id);

  const reviews = (place.reviews || [])
    .map((r: any) => normalizeReview(r, company.id, place.id, googleMapsUrl))
    .filter((r: any) => r.google_review_name);

  if (reviews.length > 0) {
    await admin
      .from("public_google_reviews")
      .upsert(reviews, { onConflict: "company_id,google_review_name" });
  }

  // Only alert on a real increase. A first-ever run (prevCount 0) just sets the
  // baseline so we don't fire a bogus "N new reviews" burst.
  const delta = newCount - prevCount;
  if (prevCount <= 0 || delta <= 0) {
    return { id: company.id, prevCount, newCount, alerted: false };
  }

  // Newest review (if Google returned it) makes for a richer notification.
  const newest = (place.reviews || [])[0];
  const author = String(newest?.authorAttribution?.displayName || "").trim();
  const newestRating = Number(newest?.rating || 0) || 0;
  const stars = newestRating ? "★".repeat(Math.round(newestRating)) : "";

  const title = delta === 1 ? "New Google review ⭐" : `${delta} new Google reviews ⭐`;
  let body: string;
  if (delta === 1 && author) {
    body = `${stars ? stars + " " : ""}${author} left you a review — ${newCount} total${
      rating ? `, ${rating}★ average` : ""
    }.`;
  } else {
    body = `You have ${delta} new Google review${delta === 1 ? "" : "s"} — ${newCount} total${
      rating ? `, ${rating}★ average` : ""
    }.`;
  }

  const memberEmails = await getCompanyMemberEmails(admin, company.id);
  let pushed = 0;
  for (const email of memberEmails) {
    try {
      await sendPushNotification({
        title,
        body,
        url: "/settings/public-profile",
        eventType: "google_review_new",
        targetUserEmail: email,
      });
      pushed += 1;
    } catch (error) {
      console.error("Google review push failed:", error);
    }
  }

  return { id: company.id, prevCount, newCount, delta, alerted: true, recipients: pushed };
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!PLACES_API_KEY) {
      return NextResponse.json({ error: "Missing GOOGLE_PLACES_API_KEY." }, { status: 500 });
    }

    const admin = createAdminClient();

    const { data: companies, error } = await admin
      .from("companies")
      .select(
        "id, email, google_place_id, google_place_name, google_place_address, google_maps_url, google_rating, google_review_count, google_review_alerts_enabled"
      )
      .not("google_place_id", "is", null)
      .neq("google_review_alerts_enabled", false);

    if (error) throw error;

    const results: any[] = [];
    for (const company of companies || []) {
      try {
        results.push(await processCompany(admin, company));
      } catch (err: any) {
        results.push({ id: company.id, error: err?.message || "check failed" });
      }
    }

    const alerted = results.filter((r) => r.alerted).length;
    return NextResponse.json({ ok: true, checked: results.length, alerted, results });
  } catch (error: any) {
    console.error("check-google-reviews cron error:", error);
    return NextResponse.json(
      { error: error?.message || "Google review check failed." },
      { status: 500 }
    );
  }
}
