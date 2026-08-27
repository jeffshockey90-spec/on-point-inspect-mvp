import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";
import CompanyImageUploader from "../CompanyImageUploader";
import BookingEmbedSnippet from "../../../components/BookingEmbedSnippet";
import PublicProfileActions from "./PublicProfileActions";
import GoogleBusinessConnect from "./GoogleBusinessConnect";
import PortfolioGalleryManager from "./PortfolioGalleryManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function slugifyProfile(value: any) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeLines(value: any) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
}

function getPublicProfileUrl(company: any) {
  const slug = String(company?.profile_slug || "").trim();
  if (!slug) return "";

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.flowinspect.app";

  return `${baseUrl.replace(/\/$/, "")}/inspectors/${slug}`;
}

async function getCompanyForUser(supabase: any, userId: string) {
  const { data: companyUser } = await supabase
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (!companyUser?.company_id) return null;

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyUser.company_id)
    .maybeSingle();

  return company;
}

type PublicProfilePageProps = {
  searchParams: Promise<{
    saved?: string;
    error?: string;
  }>;
};

export default async function PublicProfilePage({ searchParams }: PublicProfilePageProps) {
  const params = await searchParams;
  const saved = params?.saved;
  const pageError = params?.error;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const company = await getCompanyForUser(supabase, user.id);
  if (!company) redirect("/settings?error=no_company");

  async function savePublicProfile(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const company = await getCompanyForUser(supabase, user.id);
    if (!company) redirect("/settings?error=no_company");

    const nextSlug =
      slugifyProfile(formData.get("profile_slug")) ||
      slugifyProfile(formData.get("display_name")) ||
      slugifyProfile(company.display_name || company.name) ||
      String(company.id);

    await supabase
      .from("companies")
      .update({
        display_name: String(formData.get("display_name") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        website: String(formData.get("website") || "").trim(),
        logo_url: String(formData.get("logo_url") || "").trim(),
        public_profile_enabled:
          String(formData.get("public_profile_enabled") || "") === "on",
        profile_slug: nextSlug,
        public_profile_headline: String(
          formData.get("public_profile_headline") || ""
        ).trim(),
        public_profile_bio: String(
          formData.get("public_profile_bio") || ""
        ).trim(),
        public_profile_photo_url: String(
          formData.get("public_profile_photo_url") || ""
        ).trim(),
        service_areas: normalizeLines(formData.get("service_areas")),
        certifications: normalizeLines(formData.get("certifications")),
        services_offered: normalizeLines(formData.get("services_offered")),
        license_info: String(formData.get("license_info") || "").trim(),
        google_review_url: String(formData.get("google_review_url") || "").trim(),
        facebook_url: String(formData.get("facebook_url") || "").trim(),
        public_booking_url: String(formData.get("public_booking_url") || "").trim(),
      })
      .eq("id", company.id);

    revalidatePath("/settings");
    revalidatePath("/settings/public-profile");
    revalidatePath("/inspectors");
    revalidatePath(`/inspectors/${nextSlug}`);
    redirect("/settings/public-profile?saved=1");
  }

  const publicProfileUrl = getPublicProfileUrl(company);
  const profileSlug =
    company.profile_slug || slugifyProfile(company.display_name || company.name);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.flowinspect.app";

  const { data: portfolioGalleryRaw, error: portfolioGalleryError } = await supabase
    .from("public_profile_gallery")
    .select("id, image_url, title, caption, category, display_order, is_featured, is_enabled, created_at")
    .eq("company_id", company.id)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (portfolioGalleryError) {
    console.error("Portfolio gallery load error:", portfolioGalleryError);
  }

  const portfolioGallery = portfolioGalleryError ? [] : portfolioGalleryRaw || [];
  (company as any).portfolio_gallery_count = portfolioGallery.filter((item: any) => item?.is_enabled !== false).length;

  const portfolioChecklist = [
    { label: "Profile published", done: company.public_profile_enabled === true },
    { label: "Public link created", done: Boolean(profileSlug) },
    { label: "Company logo uploaded", done: Boolean(company.logo_url) },
    { label: "Inspector headshot uploaded", done: Boolean(company.public_profile_photo_url) },
    { label: "Headline added", done: Boolean(company.public_profile_headline) },
    { label: "Bio completed", done: Boolean(company.public_profile_bio) },
    { label: "Service areas added", done: Boolean(company.service_areas) },
    { label: "Services listed", done: Boolean(company.services_offered) },
    { label: "Certifications added", done: Boolean(company.certifications || company.license_info) },
    { label: "Google reviews connected", done: Boolean(company.google_place_id || company.google_review_url) },
    { label: "Portfolio gallery started", done: Boolean((company as any).portfolio_gallery_count) },
  ];

  const completedPortfolioItems = portfolioChecklist.filter((item) => item.done).length;
  const portfolioCompletion = Math.round(
    (completedPortfolioItems / portfolioChecklist.length) * 100,
  );

  const analyticsSince30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const analyticsSince7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: analyticsRowsRaw, error: analyticsError } = await supabase
    .from("public_profile_analytics")
    .select("event_type, created_at")
    .eq("company_id", company.id)
    .gte("created_at", analyticsSince30)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (analyticsError) {
    console.error("Public profile analytics load error:", analyticsError);
  }

  const analyticsRows = analyticsError ? [] : analyticsRowsRaw || [];
  const last7Rows = analyticsRows.filter((row: any) => {
    const createdAt = String(row?.created_at || "");
    return createdAt >= analyticsSince7;
  });

  function countEvents(rows: any[], eventType: string) {
    return rows.filter((row) => row?.event_type === eventType).length;
  }

  const profileViews30 = countEvents(analyticsRows, "profile_view");
  const qrScans30 = countEvents(analyticsRows, "qr_scan");
  const sampleClicks30 = countEvents(analyticsRows, "sample_report_click");
  const bookingClicks30 = countEvents(analyticsRows, "booking_click");
  const contactClicks30 =
    countEvents(analyticsRows, "phone_click") +
    countEvents(analyticsRows, "email_click") +
    countEvents(analyticsRows, "website_click");
  const shareClicks30 = countEvents(analyticsRows, "share_click");

  const profileViews7 = countEvents(last7Rows, "profile_view");
  const qrScans7 = countEvents(last7Rows, "qr_scan");
  const bookingClicks7 = countEvents(last7Rows, "booking_click");

  const conversionRate30 =
    profileViews30 > 0 ? Math.round((bookingClicks30 / profileViews30) * 100) : 0;

  const analyticsSummary = {
    profileViews30,
    qrScans30,
    sampleClicks30,
    bookingClicks30,
    contactClicks30,
    shareClicks30,
    profileViews7,
    qrScans7,
    bookingClicks7,
    conversionRate30,
    analyticsAvailable: !analyticsError,
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050816] px-4 py-4 pb-28 text-white md:p-8 md:pb-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#10151e] shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-5 border-b border-[#1a212c]/90 p-5 sm:p-6 md:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <Link
                href="/settings"
                className="text-sm font-semibold text-cyan-300 hover:text-cyan-200"
              >
                ← Back to Settings
              </Link>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
                Public Profile
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Inspector Profile
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#8a93a3] sm:text-base">
                This is the page clients, realtors, and the public can use to learn about your inspection company and request an inspection.
              </p>
            </div>

            <span
              className={`inline-flex w-fit rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
                company.public_profile_enabled === true
                  ? "border-teal-400/60 bg-teal-500/15 text-teal-300"
                  : "border-[#232b38] bg-[#131923] text-[#8a93a3]"
              }`}
            >
              {company.public_profile_enabled === true ? "Published" : "Draft"}
            </span>
          </div>

          <div className="p-5 sm:p-6 md:p-8">
            <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
              <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">
                  Public Link
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Portfolio page access
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#8a93a3]">
                  Use this link for realtor messages, email signatures, business cards, and social media.
                </p>
                <p className="mt-4 break-all rounded-xl border border-[#232b38] bg-[#131923] p-3 text-sm font-bold text-white">
                  {publicProfileUrl || "Save a profile slug to generate your public link."}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Link
                    href={publicProfileUrl || "/settings/public-profile"}
                    target={publicProfileUrl ? "_blank" : undefined}
                    className="rounded-xl bg-teal-500 px-5 py-3 text-center font-semibold text-slate-950 transition hover:bg-teal-400"
                  >
                    {publicProfileUrl ? "View Public Profile" : "Save Profile First"}
                  </Link>
                  <Link
                    href="/inspectors"
                    className="rounded-xl border border-[#232b38] px-5 py-3 text-center font-semibold text-[#e8ecf3] transition hover:border-teal-400 hover:text-teal-300"
                  >
                    View Directory
                  </Link>
                </div>

                <div className="mt-5 rounded-2xl border border-[#232b38] bg-[#131923] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                        Portfolio Completion
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-white">
                        {portfolioCompletion}%
                      </p>
                    </div>
                    <div className="h-14 w-14 rounded-full border border-teal-400/40 bg-teal-500/10 p-1">
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0a0e13] text-sm font-semibold text-teal-300">
                        {completedPortfolioItems}/{portfolioChecklist.length}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#1a212c]">
                    <div
                      className="h-full rounded-full bg-teal-400"
                      style={{ width: `${portfolioCompletion}%` }}
                    />
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {portfolioChecklist.map((item) => (
                      <div
                        key={item.label}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                          item.done
                            ? "border-teal-500/30 bg-teal-500/10 text-teal-200"
                            : "border-[#232b38] bg-[#131923] text-[#8a93a3]"
                        }`}
                      >
                        {item.done ? "✓" : "○"} {item.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div id="qr-card" className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
                  QR Code & Sharing
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Scan, copy, or download
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#8a93a3]">
                  This is the QR/share area you were looking for. It appears here as soon as your profile has a public slug.
                </p>
                <div className="mt-4 rounded-xl border border-[#232b38] bg-[#131923] p-4">
                  <PublicProfileActions
                    profileUrl={publicProfileUrl}
                    logoUrl={company.logo_url || ""}
                    companyName={company.display_name || company.name || "Inspector Profile"}
                    showPoweredBy={company.show_powered_by !== false}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-5 shadow-xl sm:p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
            Booking Widget
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Embed booking on your website</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8a93a3]">
            Paste this snippet into your own website to let visitors request an inspection without
            leaving your site. It shows the same booking form as your public page and auto-sizes to fit.
          </p>
          <div className="mt-5">
            <BookingEmbedSnippet slug={profileSlug} siteUrl={siteUrl} />
          </div>
        </section>

        {saved && (
          <div className="rounded-2xl border border-emerald-500/50 bg-emerald-950/20 p-5">
            <h3 className="font-semibold text-emerald-300">
              Public profile saved successfully.
            </h3>
          </div>
        )}

        {pageError && (
          <div className="rounded-2xl border border-red-500/50 bg-red-950/20 p-5">
            <h3 className="font-semibold text-red-300">Profile Error</h3>
            <p className="mt-2 break-words text-sm leading-6 text-[#e8ecf3]">
              {pageError}
            </p>
          </div>
        )}

        <div id="profile-analytics">
          <PublicProfileAnalyticsOverview analytics={analyticsSummary} />
        </div>

        <section className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-5 shadow-xl sm:p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-teal-300">
                Quick Actions
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Public profile fast buttons
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8a93a3]">
                Jump straight to the profile tools inspectors use most: identity, reviews, services, QR sharing, analytics, and preview.
              </p>
            </div>

            <Link
              href={publicProfileUrl || "/settings/public-profile"}
              target={publicProfileUrl ? "_blank" : undefined}
              className="rounded-xl border border-teal-400/60 px-5 py-3 text-center font-semibold text-teal-200 transition active:scale-[0.98] hover:bg-teal-500 hover:text-slate-950 [touch-action:manipulation]"
            >
              Preview Portfolio
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <a
              href="#identity"
              className="group flex min-h-[116px] items-center gap-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 transition active:scale-[0.98] hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-500/15 [touch-action:manipulation]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-2xl">👤</span>
              <span className="min-w-0">
                <span className="block font-semibold text-white">Identity</span>
                <span className="mt-1 block text-sm leading-5 text-[#8a93a3]">Logo, headshot, headline, contact info, and company bio.</span>
                <span className="mt-2 block text-sm font-semibold text-cyan-300 group-hover:text-cyan-200">Open →</span>
              </span>
            </a>

            <a
              href="#google-business"
              className="group flex min-h-[116px] items-center gap-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 transition active:scale-[0.98] hover:-translate-y-0.5 hover:border-yellow-300 hover:bg-yellow-500/15 [touch-action:manipulation]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yellow-500/15 text-2xl">⭐</span>
              <span className="min-w-0">
                <span className="block font-semibold text-white">Google Reviews</span>
                <span className="mt-1 block text-sm leading-5 text-[#8a93a3]">Connect, sync, and preview Google rating and review snippets.</span>
                <span className="mt-2 block text-sm font-semibold text-yellow-300 group-hover:text-yellow-200">Open →</span>
              </span>
            </a>

            <a
              href="#portfolio-gallery"
              className="group flex min-h-[116px] items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 transition active:scale-[0.98] hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-500/15 [touch-action:manipulation]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl">📸</span>
              <span className="min-w-0">
                <span className="block font-semibold text-white">Portfolio Gallery</span>
                <span className="mt-1 block text-sm leading-5 text-[#8a93a3]">Add photos of inspection work to your public profile.</span>
                <span className="mt-2 block text-sm font-semibold text-emerald-300 group-hover:text-emerald-200">Open →</span>
              </span>
            </a>

            <a
              href="#services"
              className="group flex min-h-[116px] items-center gap-4 rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4 transition active:scale-[0.98] hover:-translate-y-0.5 hover:border-teal-300 hover:bg-teal-500/15 [touch-action:manipulation]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-500/15 text-2xl">🏅</span>
              <span className="min-w-0">
                <span className="block font-semibold text-white">Services & Credentials</span>
                <span className="mt-1 block text-sm leading-5 text-[#8a93a3]">Service areas, certifications, services offered, and license info.</span>
                <span className="mt-2 block text-sm font-semibold text-teal-300 group-hover:text-teal-200">Open →</span>
              </span>
            </a>

            <a
              href="#qr-card"
              className="group flex min-h-[116px] items-center gap-4 rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-4 transition active:scale-[0.98] hover:-translate-y-0.5 hover:border-fuchsia-300 hover:bg-fuchsia-500/15 [touch-action:manipulation]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-2xl">▦</span>
              <span className="min-w-0">
                <span className="block font-semibold text-white">QR & Sharing</span>
                <span className="mt-1 block text-sm leading-5 text-[#8a93a3]">Copy, share, download, and print the public profile QR card.</span>
                <span className="mt-2 block text-sm font-semibold text-fuchsia-300 group-hover:text-fuchsia-200">Open →</span>
              </span>
            </a>

            <a
              href="#profile-analytics"
              className="group flex min-h-[116px] items-center gap-4 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 transition active:scale-[0.98] hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-500/15 [touch-action:manipulation]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-2xl">📊</span>
              <span className="min-w-0">
                <span className="block font-semibold text-white">Profile Analytics</span>
                <span className="mt-1 block text-sm leading-5 text-[#8a93a3]">Views, QR scans, sample clicks, contact clicks, and bookings.</span>
                <span className="mt-2 block text-sm font-semibold text-blue-300 group-hover:text-blue-200">Open →</span>
              </span>
            </a>

            <Link
              href={publicProfileUrl || "/settings/public-profile"}
              target={publicProfileUrl ? "_blank" : undefined}
              className="group flex min-h-[116px] items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 transition active:scale-[0.98] hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-500/15 [touch-action:manipulation]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl">👁️</span>
              <span className="min-w-0">
                <span className="block font-semibold text-white">Preview Portfolio</span>
                <span className="mt-1 block text-sm leading-5 text-[#8a93a3]">Open the public profile exactly how clients and realtors see it.</span>
                <span className="mt-2 block text-sm font-semibold text-emerald-300 group-hover:text-emerald-200">Open →</span>
              </span>
            </Link>
          </div>
        </section>

        <div id="portfolio-gallery">
          <PortfolioGalleryManager initialImages={portfolioGallery} />
        </div>

        <form action={savePublicProfile} className="space-y-6">
          <section className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-5 sm:p-6 md:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
                  Visibility
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Publish Settings
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8a93a3]">
                  Turn this on when you want your profile visible from the public directory and direct profile link.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 overflow-hidden rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4 md:col-span-2">
                <input
                  name="public_profile_enabled"
                  type="checkbox"
                  defaultChecked={company.public_profile_enabled === true}
                  className="mt-1 h-5 w-5 shrink-0 accent-cyan-400"
                />
                <span className="min-w-0 break-words">
                  <span className="block break-words text-base font-semibold text-white">
                    Publish my inspector profile
                  </span>
                  <span className="mt-1 block break-words text-sm leading-6 text-[#8a93a3]">
                    When enabled, people can open your direct link and find you in the inspector directory.
                  </span>
                </span>
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Profile Slug
                </p>
                <input
                  name="profile_slug"
                  defaultValue={profileSlug}
                  placeholder="jeff-shockey"
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
                <p className="mt-2 text-xs text-[#59626f]">
                  This creates /inspectors/your-profile-slug.
                </p>
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Booking Link
                </p>
                <input
                  name="public_booking_url"
                  defaultValue={company.public_booking_url || ""}
                  placeholder="/book or your existing booking link"
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
                <p className="mt-2 text-xs text-[#59626f]">
                  Leave blank to use your FLOW booking page.
                </p>
              </label>
            </div>
          </section>

          <section id="identity" className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-5 sm:p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
              Identity
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Inspector & Company Info
            </h2>


            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Display Name
                </p>
                <input
                  name="display_name"
                  defaultValue={company.display_name || company.name || ""}
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Headline
                </p>
                <input
                  name="public_profile_headline"
                  defaultValue={company.public_profile_headline || ""}
                  placeholder="Protecting Your Investment. One Inspection at a Time."
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Email
                </p>
                <input
                  name="email"
                  type="email"
                  defaultValue={company.email || ""}
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Phone
                </p>
                <input
                  name="phone"
                  defaultValue={company.phone || ""}
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Website
                </p>
                <input
                  name="website"
                  defaultValue={company.website || ""}
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <CompanyImageUploader
                name="logo_url"
                label="Company Logo"
                helper="This appears on your public profile."
                companyId={String(company.id)}
                initialUrl={company.logo_url || ""}
                folder="company-logo"
                buttonText="Upload Company Logo"
                previewClassName="max-h-28 max-w-[220px] rounded-2xl border border-[#232b38] bg-black/30 object-contain p-3"
              />

              <CompanyImageUploader
                name="public_profile_photo_url"
                label="Inspector Headshot"
                helper="Upload your headshot for the public inspector profile."
                companyId={String(company.id)}
                initialUrl={company.public_profile_photo_url || ""}
                folder="inspector-headshot"
                buttonText="Upload Headshot"
                previewClassName="h-28 w-28 rounded-2xl border border-[#232b38] object-cover"
              />

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  About / Bio
                </p>
                <textarea
                  name="public_profile_bio"
                  defaultValue={company.public_profile_bio || ""}
                  rows={6}
                  placeholder="Tell clients and realtors what makes your inspection company different."
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>
            </div>
          </section>

          <section id="services" className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-5 sm:p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
              Profile Content
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Services, Areas & Credentials
            </h2>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Service Areas
                </p>
                <textarea
                  name="service_areas"
                  defaultValue={company.service_areas || ""}
                  rows={6}
                  placeholder={"Maryland\nWest Virginia\nPennsylvania"}
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Certifications
                </p>
                <textarea
                  name="certifications"
                  defaultValue={company.certifications || ""}
                  rows={6}
                  placeholder={"InterNACHI CPI\nFAA Part 107\nIAC2 Mold\nNRPP Radon"}
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Services Offered
                </p>
                <textarea
                  name="services_offered"
                  defaultValue={company.services_offered || ""}
                  rows={5}
                  placeholder={"Home Inspection\nRadon Testing\nMold Testing\nDrone Roof Inspection"}
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  License Info
                </p>
                <textarea
                  name="license_info"
                  defaultValue={company.license_info || ""}
                  rows={3}
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>
            </div>
          </section>

          <section id="external-links" className="rounded-2xl border border-[#1a212c] bg-[#10151e] p-5 sm:p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
              Social & Reviews
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              External Links
            </h2>

            <div id="google-business">
              <GoogleBusinessConnect
                initialName={company.google_place_name || company.display_name || company.name || ""}
              initialPlaceId={company.google_place_id || ""}
              initialRating={company.google_rating || null}
              initialReviewCount={company.google_review_count || 0}
              initialMapsUrl={company.google_maps_url || ""}
                initialSyncedAt={company.google_reviews_synced_at || ""}
                initialAlertsEnabled={company.google_review_alerts_enabled !== false}
              />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Google Review URL
                </p>
                <input
                  name="google_review_url"
                  defaultValue={company.google_review_url || ""}
                  placeholder="Paste Google review/profile link"
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
                  Facebook URL
                </p>
                <input
                  name="facebook_url"
                  defaultValue={company.facebook_url || ""}
                  placeholder="Paste Facebook business page link"
                  className="w-full min-w-0 rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>
            </div>
          </section>

          <div className="sticky bottom-24 z-20 rounded-2xl border border-[#232b38] bg-[#10151e]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur md:bottom-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold text-[#8a93a3]">
                Save changes to update your public profile and directory listing.
              </p>
              <button
                type="submit"
                className="w-full rounded-xl bg-cyan-500 px-8 py-4 font-semibold text-slate-950 hover:bg-cyan-400 sm:w-auto"
              >
                Save Public Profile
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

type PublicProfileAnalyticsSummary = {
  profileViews30: number;
  qrScans30: number;
  sampleClicks30: number;
  bookingClicks30: number;
  contactClicks30: number;
  shareClicks30: number;
  profileViews7: number;
  qrScans7: number;
  bookingClicks7: number;
  conversionRate30: number;
  analyticsAvailable: boolean;
};

function PublicProfileAnalyticsOverview({
  analytics,
}: {
  analytics: PublicProfileAnalyticsSummary;
}) {
  const maxValue = Math.max(
    analytics.profileViews30,
    analytics.qrScans30,
    analytics.sampleClicks30,
    analytics.bookingClicks30,
    analytics.contactClicks30,
    analytics.shareClicks30,
    1,
  );

  const funnelRows = [
    { label: "Profile Views", value: analytics.profileViews30 },
    { label: "QR Scans", value: analytics.qrScans30 },
    { label: "Sample Report Clicks", value: analytics.sampleClicks30 },
    { label: "Booking Clicks", value: analytics.bookingClicks30 },
  ];

  return (
    <section className="rounded-2xl border border-teal-500/30 bg-[#10151e] p-5 shadow-xl sm:p-6 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-teal-300">
            Analytics
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Public profile performance
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8a93a3]">
            Track how often your public profile, QR code, sample reports, and booking links are being used.
          </p>
        </div>

        <div className="rounded-full border border-[#232b38] bg-[#0a0e13] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#8a93a3]">
          Last 30 Days
        </div>
      </div>

      {!analytics.analyticsAvailable && (
        <div className="mt-6 rounded-2xl border border-yellow-500/40 bg-yellow-950/20 p-4">
          <p className="text-sm font-bold leading-6 text-yellow-100">
            Analytics table is not available yet. Run the public_profile_analytics SQL, then visit your public profile to start collecting events.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AnalyticsStatCard label="Profile Views" value={analytics.profileViews30} subValue={`${analytics.profileViews7} last 7 days`} />
        <AnalyticsStatCard label="QR Scans" value={analytics.qrScans30} subValue={`${analytics.qrScans7} last 7 days`} />
        <AnalyticsStatCard label="Sample Reports" value={analytics.sampleClicks30} subValue="Report opens" />
        <AnalyticsStatCard label="Booking Clicks" value={analytics.bookingClicks30} subValue={`${analytics.bookingClicks7} last 7 days`} />
        <AnalyticsStatCard label="Conversion" value={`${analytics.conversionRate30}%`} subValue="Bookings ÷ views" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.75fr]">
        <div className="rounded-2xl border border-[#232b38] bg-[#131923] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#59626f]">
                Engagement Funnel
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                What visitors are doing
              </h3>
            </div>
            <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-200">
              30 days
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {funnelRows.map((row) => {
              const width = Math.max(6, Math.round((row.value / maxValue) * 100));
              return (
                <div key={row.label}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-bold text-[#8a93a3]">{row.label}</span>
                    <span className="font-semibold text-white">{row.value}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[#1a212c]">
                    <div
                      className="h-full rounded-full bg-teal-400"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[#232b38] bg-[#131923] p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#59626f]">
            Other Actions
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">
            Contact & sharing
          </h3>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-[#1a212c] bg-[#020817] p-3">
              <span className="text-sm font-bold text-[#8a93a3]">Contact Clicks</span>
              <span className="text-lg font-semibold text-white">{analytics.contactClicks30}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[#1a212c] bg-[#020817] p-3">
              <span className="text-sm font-bold text-[#8a93a3]">Share Clicks</span>
              <span className="text-lg font-semibold text-white">{analytics.shareClicks30}</span>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-[#8a93a3]">
            These numbers update as clients, realtors, and homeowners interact with your public profile.
          </p>
        </div>
      </div>
    </section>
  );
}

function AnalyticsStatCard({
  label,
  value,
  subValue,
}: {
  label: string;
  value: number | string;
  subValue: string;
}) {
  return (
    <div className="rounded-2xl border border-[#232b38] bg-[#131923] p-4 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#59626f]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs font-bold text-teal-300">{subValue}</p>
    </div>
  );
}

