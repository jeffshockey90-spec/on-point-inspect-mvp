
import { formatAppValue } from "../../../lib/app-time";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import SharePublicSampleReportButton from "../../../components/SharePublicSampleReportButton";
import PublicProfileAnalyticsTracker from "../../../components/PublicProfileAnalyticsTracker";
import PublicProfileGallery from "../../../components/PublicProfileGallery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );
}

function cleanText(value: any) {
  return String(value || "").trim();
}

function splitLines(value: any) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getInitials(value: any) {
  const words = String(value || "Inspector")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function normalizeExternalUrl(value: any) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  if (clean.startsWith("/")) return clean;

  return `https://${clean}`;
}

function cleanImageUrl(value: any) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  if (clean.startsWith("/logo") || clean.includes("localhost:")) return "";

  return clean;
}

function getBookingHref(company: any) {
  const override = normalizeExternalUrl(company.public_booking_url);
  if (override) return override;

  const slug = String(company.profile_slug || "").trim();
  return slug ? `/book?inspector=${encodeURIComponent(slug)}` : "/book";
}

function getSampleReportHref(sample: any) {
  const direct = String(sample?.share_url || "").trim();
  if (direct) return direct;

  const inspectionId = sample?.inspection_id;
  return inspectionId ? `/share/${inspectionId}` : "";
}

function formatSampleDate(value: any) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return formatAppValue(date, {
    month: "short",
    year: "numeric",
  });
}

function getSampleType(sample: any) {
  const raw = String(
    sample?.inspection_type ||
      sample?.service_mode ||
      sample?.services ||
      sample?.description ||
      "Sample Report",
  ).trim();

  const lower = raw.toLowerCase();

  if (lower.includes("pre-list") || lower.includes("seller"))
    return "Pre-Listing";
  if (lower.includes("new construction")) return "New Construction";
  if (lower.includes("radon")) return "Radon";
  if (lower.includes("mold")) return "Mold";
  if (lower.includes("buyer")) return "Buyer Inspection";
  if (lower.includes("home")) return "Home Inspection";

  return raw.length > 28 ? "Sample Report" : raw;
}

function getCertificationBadge(certification: string) {
  const lower = certification.toLowerCase();

  if (lower.includes("internachi") || lower.includes("cpi")) {
    return {
      label: "InterNACHI",
      icon: "IN",
      description: "Certified Professional Inspector",
    };
  }
  if (
    lower.includes("faa") ||
    lower.includes("107") ||
    lower.includes("drone")
  ) {
    return { label: "FAA", icon: "FAA", description: "Part 107 Drone Pilot" };
  }
  if (lower.includes("nrpp") || lower.includes("radon")) {
    return {
      label: "NRPP",
      icon: "Rn",
      description: "Radon Measurement Professional",
    };
  }
  if (lower.includes("iac2") || lower.includes("mold")) {
    return {
      label: "IAC2",
      icon: "M",
      description: "Mold / Indoor Air Quality",
    };
  }
  if (lower.includes("ahit")) {
    return { label: "AHIT", icon: "AH", description: "Inspection Training" };
  }
  if (lower.includes("licensed") || lower.includes("license")) {
    return {
      label: "Licensed",
      icon: "✓",
      description: "Professional License",
    };
  }

  return {
    label: "Credential",
    icon: "★",
    description: "Professional Certification",
  };
}

function getServiceIcon(service: string) {
  const lower = service.toLowerCase();

  if (lower.includes("mold")) return "🦠";
  if (lower.includes("radon")) return "☢️";
  if (lower.includes("drone") || lower.includes("roof")) return "🛩️";
  if (lower.includes("water")) return "💧";
  if (lower.includes("new construction")) return "🏗️";
  if (lower.includes("pre-list") || lower.includes("seller")) return "🏷️";
  if (lower.includes("maintenance")) return "🛠️";

  return "🏠";
}

export default async function PublicInspectorProfilePage({
  params,
}: PageProps) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: company, error } = await supabase
    .from("companies")
    .select(
      "id, name, display_name, email, phone, website, logo_url, license_info, brand_color, profile_slug, public_profile_enabled, public_profile_headline, public_profile_bio, public_profile_photo_url, service_areas, certifications, services_offered, google_review_url, google_place_id, google_place_name, google_maps_url, google_rating, google_review_count, google_reviews_synced_at, facebook_url, public_booking_url",
    )
    .eq("profile_slug", slug)
    .eq("public_profile_enabled", true)
    .maybeSingle();

  if (error) {
    console.error("Public inspector profile load error:", error);
  }

  if (!company) notFound();

  const { data: sampleReportsRaw, error: sampleReportsError } = await supabase
    .from("public_sample_reports")
    .select(
      "id, company_id, inspection_id, title, description, cover_image_url, share_url, display_order, created_at, inspections(inspection_date, inspection_type, service_mode, services)",
    )
    .eq("company_id", company.id)
    .eq("is_enabled", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (sampleReportsError) {
    console.error("Public sample reports load error:", sampleReportsError);
  }

  const { data: googleReviewsRaw, error: googleReviewsError } = await supabase
    .from("public_google_reviews")
    .select("id, author_name, author_photo_url, rating, review_text, relative_publish_time_description, publish_time, google_maps_uri")
    .eq("company_id", company.id)
    .eq("is_enabled", true)
    .order("publish_time", { ascending: false, nullsFirst: false })
    .limit(5);

  if (googleReviewsError) {
    console.error("Public Google reviews load error:", googleReviewsError);
  }

  const googleReviews = googleReviewsError ? [] : googleReviewsRaw || [];

  const { data: portfolioGalleryRaw, error: portfolioGalleryError } = await supabase
    .from("public_profile_gallery")
    .select("id, image_url, title, caption, category, display_order, created_at")
    .eq("company_id", company.id)
    .eq("is_enabled", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(12);

  if (portfolioGalleryError) {
    console.error("Public portfolio gallery load error:", portfolioGalleryError);
  }

  const portfolioGallery = portfolioGalleryError ? [] : portfolioGalleryRaw || [];

  const sampleReports = (sampleReportsRaw || []).map((sample: any) => ({
    ...sample,
    inspection_date: sample?.inspections?.inspection_date || "",
    inspection_type: sample?.inspections?.inspection_type || "",
    service_mode: sample?.inspections?.service_mode || "",
    services: sample?.inspections?.services || "",
  }));

  const companyName =
    company.display_name || company.name || "Inspection Company";
  const headline =
    company.public_profile_headline ||
    "Protecting Your Investment. One Inspection at a Time.";

  const serviceAreas = splitLines(company.service_areas);
  const certifications = splitLines(
    company.certifications || company.license_info,
  );
  const services = splitLines(company.services_offered);
  const bookingHref = getBookingHref(company);
  const websiteHref = normalizeExternalUrl(company.website);
  const googleMapsHref = normalizeExternalUrl(company.google_maps_url);
  const googleReviewHref = normalizeExternalUrl(company.google_review_url || company.google_maps_url);
  const facebookHref = normalizeExternalUrl(company.facebook_url);
  const brandColor = company.brand_color || "#14b8a6";
  const logoUrl = cleanImageUrl(company.logo_url);
  const headshotUrl = cleanImageUrl(company.public_profile_photo_url);
  const featuredSample = sampleReports[0] || null;
  const otherSampleReports = featuredSample
    ? sampleReports.slice(1)
    : sampleReports;
  const sampleGalleryImages = sampleReports
    .map((sample: any) => ({
      id: `sample-${sample.id}`,
      title: sample.title || "Inspection report photo",
      caption: sample.description || "",
      category: getSampleType(sample),
      imageUrl: cleanImageUrl(sample.cover_image_url),
      href: getSampleReportHref(sample),
    }))
    .filter((item) => item.imageUrl)
    .slice(0, 6);

  const portfolioGalleryImages = portfolioGallery
    .map((image: any) => ({
      id: `portfolio-${image.id}`,
      title: image.title || image.category || "Inspection portfolio photo",
      caption: image.caption || "",
      category: image.category || "Portfolio",
      imageUrl: cleanImageUrl(image.image_url),
      href: "",
    }))
    .filter((item) => item.imageUrl)
    .slice(0, 12);

  const galleryImages = portfolioGalleryImages.length > 0
    ? portfolioGalleryImages
    : sampleGalleryImages;

  const googleRating = company.google_rating ? Number(company.google_rating).toFixed(1) : "";
  const googleReviewCount = Number(company.google_review_count || 0);
  const ratingLabel = googleRating
    ? `${googleRating} Google Rating`
    : googleReviewHref
      ? "5-Star Reputation"
      : "Verified Reputation";
  const shownCertifications = certifications.slice(0, 4);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020617] pb-24 text-white sm:pb-0">
      <PublicProfileAnalyticsTracker companyId={company.id} profileSlug={slug} />
      <section className="relative overflow-hidden border-b border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.24),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.16),transparent_42%)]" />
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-teal-500/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="rounded-[2rem] border border-teal-500/25 bg-[#07111f]/95 p-4 shadow-2xl shadow-black/40 sm:p-7 lg:p-9">
            <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-5">
                  {logoUrl ? (
                    <div className="flex min-h-28 min-w-28 max-w-[260px] items-center justify-center rounded-3xl border border-slate-700 bg-black/35 p-4 shadow-xl">
                      <img
                        src={logoUrl}
                        alt={`${companyName} logo`}
                        className="h-auto max-h-28 w-auto max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div
                      className="flex h-24 w-24 items-center justify-center rounded-3xl text-3xl font-black text-slate-950"
                      style={{ backgroundColor: brandColor }}
                    >
                      {getInitials(companyName)}
                    </div>
                  )}

                  {headshotUrl && (
                    <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-teal-500/30 bg-black/30 shadow-xl sm:h-32 sm:w-32">
                      <img
                        src={headshotUrl}
                        alt={companyName}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                </div>

                <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-500/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-teal-200">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-400 text-[10px] text-slate-950">
                    ✓
                  </span>
                  Verified On Point Inspector
                </div>

                <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-white sm:text-6xl">
                  {companyName}
                </h1>

                <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
                  {headline}
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {serviceAreas.slice(0, 5).map((area) => (
                    <span
                      key={area}
                      className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-black text-slate-200"
                    >
                      {area}
                    </span>
                  ))}
                </div>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={bookingHref}
                    data-public-profile-event="booking_click"
                    className="rounded-xl bg-teal-500 px-6 py-4 text-center font-black text-slate-950 shadow-lg shadow-teal-500/20 transition hover:-translate-y-0.5 hover:bg-teal-400"
                  >
                    Request Inspection
                  </Link>

                  {company.phone && (
                    <a
                      href={`tel:${company.phone}`}
                      className="rounded-xl border border-slate-700 px-6 py-4 text-center font-bold text-slate-200 transition hover:-translate-y-0.5 hover:border-teal-400 hover:text-teal-300"
                    >
                      Call Inspector
                    </a>
                  )}
                </div>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <PortfolioStat
                    value={sampleReports.length || 1}
                    label="Reports"
                  />
                  <PortfolioStat
                    value={googleRating ? `${googleRating}★` : googleReviewHref ? "5★" : "✓"}
                    label="Reputation"
                  />
                  <PortfolioStat
                    value={services.length || 1}
                    label="Services"
                  />
                  <PortfolioStat
                    value={certifications.length || 1}
                    label="Credentials"
                  />
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-950/55 p-5 shadow-xl sm:p-7">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-300">
                        Reputation
                      </p>
                      <h2 className="mt-3 text-3xl font-black text-white">
                        ★★★★★ {ratingLabel}
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {googleReviewCount > 0
                          ? `${googleReviewCount} Google reviews synced to this public profile.`
                          : "Sample reports, credentials, service areas, and direct booking links are available before a client reaches out."}
                      </p>
                    </div>

                    {(googleMapsHref || googleReviewHref) && (
                      <a
                        href={googleMapsHref || googleReviewHref}
                        target="_blank"
                        rel="noreferrer"
                        data-public-profile-event="review_click"
                        className="shrink-0 rounded-xl border border-yellow-300/50 bg-yellow-400/10 px-5 py-3 text-center font-black text-yellow-100 transition hover:bg-yellow-300 hover:text-slate-950"
                      >
                        View Reviews →
                      </a>
                    )}
                  </div>
                </div>

                {company.public_profile_bio && (
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/55 p-5 shadow-xl sm:p-7">
                    <h2 className="text-2xl font-black text-teal-300">About</h2>
                    <p className="mt-4 max-h-56 overflow-auto whitespace-pre-line pr-2 text-base leading-8 text-slate-300">
                      {company.public_profile_bio}
                    </p>
                  </div>
                )}

                {shownCertifications.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {shownCertifications.map((certification) => {
                      const badge = getCertificationBadge(certification);

                      return (
                        <span
                          key={certification}
                          className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs font-black text-teal-100"
                        >
                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-teal-400 text-[10px] text-slate-950">
                            {badge.icon}
                          </span>
                          {badge.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {(googleReviews.length > 0 || googleRating || googleReviewHref) && (
        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
          <GoogleReviewsSection
            rating={googleRating}
            reviewCount={googleReviewCount}
            reviews={googleReviews}
            googleMapsHref={googleMapsHref || googleReviewHref}
            leaveReviewHref={googleReviewHref}
          />
        </section>
      )}

      {featuredSample && (
        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
          <FeaturedSampleReport
            sample={featuredSample}
            companyName={companyName}
            bookingHref={bookingHref}
          />
        </section>
      )}

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[0.95fr_1.05fr]">
        <CertificationBadges certifications={certifications} />
        <InfoList
          title="Service Areas"
          items={serviceAreas}
          emptyText="Service area details coming soon."
        />
      </section>

      <PublicProfileGallery images={galleryImages} />

      {sampleReports.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="overflow-hidden rounded-3xl border border-teal-500/35 bg-[#0b1220] p-5 shadow-2xl shadow-black/30 sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-teal-300">
                  Sample Reports
                </p>
                <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">
                  See Example Reports
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                  Review example inspection reports from {companyName} to see
                  report style, photos, summaries, and overall detail before
                  requesting an inspection.
                </p>
              </div>

              <Link
                href={bookingHref}
                data-public-profile-event="booking_click"
                className="rounded-xl bg-teal-500 px-6 py-4 text-center font-black text-slate-950 transition hover:bg-teal-400"
              >
                Request Inspection
              </Link>
            </div>

            <div
              className={`mt-7 grid gap-5 ${otherSampleReports.length > 1 ? "lg:grid-cols-2" : ""}`}
            >
              {(otherSampleReports.length > 0
                ? otherSampleReports
                : sampleReports
              ).map((sample: any) => (
                <SampleReportCard key={sample.id} sample={sample} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl sm:p-8">
          <h2 className="text-2xl font-black text-teal-300">
            Services Offered
          </h2>

          {services.length === 0 ? (
            <p className="mt-4 text-slate-400">Services will be added soon.</p>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {services.map((service) => (
                <div
                  key={service}
                  className="flex items-center gap-3 rounded-2xl border border-teal-500/25 bg-teal-500/10 p-4 font-bold text-slate-100 transition hover:border-teal-400/70 hover:bg-teal-500/15"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-lg">
                    {getServiceIcon(service)}
                  </span>
                  <span>{service}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl sm:p-8">
          <h2 className="text-2xl font-black text-teal-300">Contact</h2>

          <div className="mt-6 space-y-3 text-sm">
            {company.email && (
              <a
                href={`mailto:${company.email}`}
                data-public-profile-event="email_click"
                className="block rounded-2xl border border-slate-700 bg-slate-950 p-4 font-bold text-slate-200 hover:border-teal-400 hover:text-teal-300"
              >
                Email: {company.email}
              </a>
            )}

            {company.phone && (
              <a
                href={`tel:${company.phone}`}
                data-public-profile-event="phone_click"
                className="block rounded-2xl border border-slate-700 bg-slate-950 p-4 font-bold text-slate-200 hover:border-teal-400 hover:text-teal-300"
              >
                Phone: {company.phone}
              </a>
            )}

            {websiteHref && (
              <a
                href={websiteHref}
                data-public-profile-event="website_click"
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-slate-700 bg-slate-950 p-4 font-bold text-slate-200 hover:border-teal-400 hover:text-teal-300"
              >
                Website
              </a>
            )}

            {googleReviewHref && (
              <a
                href={googleReviewHref}
                data-public-profile-event="review_click"
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 font-bold text-yellow-100 hover:border-yellow-300"
              >
                Google Reviews
              </a>
            )}

            {facebookHref && (
              <a
                href={facebookHref}
                data-public-profile-event="facebook_click"
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-blue-500/40 bg-blue-500/10 p-4 font-bold text-blue-100 hover:border-blue-300"
              >
                Facebook
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-teal-500/25 bg-[#020617]/95 p-3 backdrop-blur sm:hidden">
        <Link
          href={bookingHref}
          data-public-profile-event="booking_click"
          className="block rounded-xl bg-teal-500 px-5 py-4 text-center font-black text-slate-950 shadow-lg shadow-teal-500/20"
        >
          Request Inspection
        </Link>
      </div>
    </main>
  );
}


function GoogleReviewsSection({
  rating,
  reviewCount,
  reviews,
  googleMapsHref,
  leaveReviewHref,
}: {
  rating: string;
  reviewCount: number;
  reviews: any[];
  googleMapsHref: string;
  leaveReviewHref: string;
}) {
  return (
    <div className="rounded-3xl border border-yellow-400/30 bg-gradient-to-br from-[#0b1220] via-[#0b1220] to-yellow-950/20 p-5 shadow-2xl shadow-black/30 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-yellow-300">
            Google Reviews
          </p>
          <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">
            ★★★★★ {rating ? `${rating} Rating` : "Verified Reputation"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            {reviewCount > 0
              ? `${reviewCount} Google reviews help clients and realtors see this inspector's reputation before booking.`
              : "Read recent Google reviews and see what clients say before requesting an inspection."}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {googleMapsHref && (
            <a
              href={googleMapsHref}
              target="_blank"
              rel="noreferrer"
              data-public-profile-event="review_click"
              className="rounded-xl border border-yellow-300/50 px-5 py-3 text-center font-black text-yellow-100 transition hover:bg-yellow-300 hover:text-slate-950"
            >
              View on Google
            </a>
          )}
          {leaveReviewHref && (
            <a
              href={leaveReviewHref}
              target="_blank"
              rel="noreferrer"
              data-public-profile-event="review_click"
              className="rounded-xl bg-yellow-300 px-5 py-3 text-center font-black text-slate-950 transition hover:bg-yellow-200"
            >
              Leave Review
            </a>
          )}
        </div>
      </div>

      {reviews.length > 0 && (
        <div className="mt-7 grid gap-4 lg:grid-cols-3">
          {reviews.slice(0, 3).map((review) => (
            <article key={review.id} className="rounded-2xl border border-slate-700 bg-slate-950/80 p-5 shadow-xl">
              <div className="flex items-center gap-3">
                {review.author_photo_url ? (
                  <img src={review.author_photo_url} alt="" className="h-11 w-11 rounded-full object-cover" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-yellow-300 text-sm font-black text-slate-950">
                    {getInitials(review.author_name)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{review.author_name || "Google Reviewer"}</p>
                  <p className="text-xs font-bold text-yellow-200">
                    {"★".repeat(Math.max(0, Math.min(5, Number(review.rating || 5))))}
                  </p>
                </div>
              </div>

              {review.review_text && (
                <p className="mt-4 line-clamp-5 text-sm leading-6 text-slate-300">
                  “{review.review_text}”
                </p>
              )}

              <p className="mt-4 text-xs font-bold text-slate-500">
                {review.relative_publish_time_description || "Google review"}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function PortfolioStat({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-center shadow-lg transition hover:-translate-y-0.5 hover:border-teal-400/50">
      <p className="text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-teal-300">
        {label}
      </p>
    </div>
  );
}

function FeaturedSampleReport({
  sample,
  companyName,
  bookingHref,
}: {
  sample: any;
  companyName: string;
  bookingHref: string;
}) {
  const sampleHref = getSampleReportHref(sample);
  const coverUrl = cleanImageUrl(sample.cover_image_url);
  const sampleType = getSampleType(sample);
  const sampleDate = formatSampleDate(sample.inspection_date);
  const description =
    cleanText(sample.description) ||
    `A featured sample report from ${companyName} showing photos, findings, summaries, and client-friendly report details.`;

  return (
    <div className="group overflow-hidden rounded-[2rem] border border-teal-500/45 bg-[#07111f] shadow-2xl shadow-black/40">
      <div className="grid lg:grid-cols-[1.35fr_0.85fr]">
        <div className="relative min-h-[320px] overflow-hidden bg-slate-950 sm:min-h-[440px]">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={sample.title || "Featured sample inspection report"}
              loading="eager"
              decoding="async"
              className="h-full min-h-[320px] w-full object-cover transition duration-500 group-hover:scale-[1.03] sm:min-h-[440px]"
            />
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.25),transparent_45%)] sm:min-h-[440px]">
              <div className="rounded-3xl border border-teal-500/30 bg-teal-500/10 px-8 py-6 text-center">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
                  On Point Inspect
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  Featured Report
                </p>
              </div>
            </div>
          )}

          <div className="absolute left-4 top-4 rounded-full border border-teal-300/60 bg-teal-500 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-950 shadow-lg">
            ⭐ Featured Report
          </div>
        </div>

        <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-teal-300">
              {sampleType}
            </span>
            {sampleDate && (
              <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-300">
                {sampleDate}
              </span>
            )}
          </div>

          <h2 className="mt-5 text-4xl font-black leading-tight text-white sm:text-5xl">
            {sample.title || "Featured Sample Inspection Report"}
          </h2>

          <p className="mt-4 text-base leading-8 text-slate-300">
            {description}
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {sampleHref && (
              <Link
                href={sampleHref}
                data-public-profile-event="sample_report_click"
                data-sample-report-id={sample.id}
                className="rounded-xl bg-teal-500 px-5 py-4 text-center font-black text-slate-950 transition hover:bg-teal-400"
              >
                View Featured Report
              </Link>
            )}

            <Link
              href={bookingHref}
              data-public-profile-event="booking_click"
              className="rounded-xl border border-slate-700 px-5 py-4 text-center font-black text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
            >
              Request Inspection
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function SampleReportCard({ sample }: { sample: any }) {
  const sampleHref = getSampleReportHref(sample);
  const coverUrl = cleanImageUrl(sample.cover_image_url);
  const sampleType = getSampleType(sample);
  const sampleDate = formatSampleDate(sample.inspection_date);
  const description =
    cleanText(sample.description) ||
    "View this sample inspection report to see photos, findings, summary details, and client-friendly layout.";

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-700 bg-[#020817] shadow-xl transition hover:-translate-y-1 hover:border-teal-400/70">
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={sample.title || "Sample inspection report"}
          loading="lazy"
          decoding="async"
          className="h-48 w-full object-cover sm:h-56"
        />
      ) : (
        <div className="flex h-48 items-center justify-center bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.22),transparent_45%)] sm:h-56">
          <div className="rounded-3xl border border-teal-500/30 bg-teal-500/10 px-6 py-4 text-center">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
              On Point Inspect
            </p>
            <p className="mt-2 text-xl font-black text-white">Sample Report</p>
          </div>
        </div>
      )}

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-teal-300">
            {sampleType}
          </span>
          {sampleDate && (
            <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-300">
              {sampleDate}
            </span>
          )}
        </div>

        <h3 className="mt-4 text-2xl font-black leading-tight text-white sm:text-3xl">
          {sample.title || "Sample Inspection Report"}
        </h3>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300">
          {description}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {sampleHref && (
            <Link
              href={sampleHref}
              data-public-profile-event="sample_report_click"
              data-sample-report-id={sample.id}
              className="rounded-xl bg-teal-500 px-5 py-3 text-center font-black text-slate-950 transition hover:bg-teal-400"
            >
              View Report
            </Link>
          )}

          <SharePublicSampleReportButton
            url={sampleHref}
            title={sample.title || "Sample Inspection Report"}
            description={description}
          />
        </div>
      </div>
    </article>
  );
}

function CertificationBadges({ certifications }: { certifications: string[] }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.35em] text-teal-300">
        Credentials
      </p>
      <h2 className="mt-3 text-2xl font-black text-white">
        Certifications & Badges
      </h2>

      {certifications.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-slate-400">
          Certifications coming soon.
        </p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {certifications.map((certification) => {
            const badge = getCertificationBadge(certification);

            return (
              <div
                key={certification}
                className="flex items-center gap-3 rounded-2xl border border-teal-500/25 bg-teal-500/10 p-4 transition hover:-translate-y-0.5 hover:border-teal-400/70 hover:bg-teal-500/15"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-teal-300/40 bg-slate-950 text-sm font-black text-teal-200">
                  {badge.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-white">
                    {certification}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    {badge.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InfoList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-[#0b1220]/90 p-5 shadow-xl sm:p-8">
      <h2 className="text-2xl font-black text-teal-300">{title}</h2>

      {items.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-slate-400">{emptyText}</p>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-200"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
