import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";
import CompanyImageUploader from "../CompanyImageUploader";
import PublicProfileActions from "./PublicProfileActions";

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
    "https://on-point-inspect-mvp.vercel.app";

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
    { label: "Review link added", done: Boolean(company.google_review_url) },
  ];

  const completedPortfolioItems = portfolioChecklist.filter((item) => item.done).length;
  const portfolioCompletion = Math.round(
    (completedPortfolioItems / portfolioChecklist.length) * 100,
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050816] px-4 py-4 pb-28 text-white md:p-8 md:pb-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#0b1220] shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-5 border-b border-slate-800/90 p-5 sm:p-6 md:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <Link
                href="/settings"
                className="text-sm font-black text-cyan-300 hover:text-cyan-200"
              >
                ← Back to Settings
              </Link>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
                Public Profile
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">
                Inspector Profile
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                This is the page clients, realtors, and the public can use to learn about your inspection company and request an inspection.
              </p>
            </div>

            <span
              className={`inline-flex w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide ${
                company.public_profile_enabled === true
                  ? "border-teal-400/60 bg-teal-500/15 text-teal-300"
                  : "border-slate-600 bg-slate-900 text-slate-400"
              }`}
            >
              {company.public_profile_enabled === true ? "Published" : "Draft"}
            </span>
          </div>

          <div className="p-5 sm:p-6 md:p-8">
            <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
              <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-wide text-teal-300">
                  Public Link
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Portfolio page access
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Use this link for realtor messages, email signatures, business cards, and social media.
                </p>
                <p className="mt-4 break-all rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-sm font-bold text-white">
                  {publicProfileUrl || "Save a profile slug to generate your public link."}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Link
                    href={publicProfileUrl || "/settings/public-profile"}
                    target={publicProfileUrl ? "_blank" : undefined}
                    className="rounded-xl bg-teal-500 px-5 py-3 text-center font-black text-slate-950 transition hover:bg-teal-400"
                  >
                    {publicProfileUrl ? "View Public Profile" : "Save Profile First"}
                  </Link>
                  <Link
                    href="/inspectors"
                    className="rounded-xl border border-slate-700 px-5 py-3 text-center font-black text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
                  >
                    View Directory
                  </Link>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                        Portfolio Completion
                      </p>
                      <p className="mt-1 text-2xl font-black text-white">
                        {portfolioCompletion}%
                      </p>
                    </div>
                    <div className="h-14 w-14 rounded-full border border-teal-400/40 bg-teal-500/10 p-1">
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-950 text-sm font-black text-teal-300">
                        {completedPortfolioItems}/{portfolioChecklist.length}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
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
                            : "border-slate-700 bg-slate-900 text-slate-400"
                        }`}
                      >
                        {item.done ? "✓" : "○"} {item.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div id="qr-card" className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-wide text-cyan-300">
                  QR Code & Sharing
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Scan, copy, or download
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  This is the QR/share area you were looking for. It appears here as soon as your profile has a public slug.
                </p>
                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/80 p-4">
                  <PublicProfileActions
                    profileUrl={publicProfileUrl}
                    logoUrl={company.logo_url || ""}
                    companyName={company.display_name || company.name || "Inspector Profile"}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {saved && (
          <div className="rounded-2xl border border-emerald-500/50 bg-emerald-950/20 p-5">
            <h3 className="font-black text-emerald-300">
              Public profile saved successfully.
            </h3>
          </div>
        )}

        {pageError && (
          <div className="rounded-2xl border border-red-500/50 bg-red-950/20 p-5">
            <h3 className="font-black text-red-300">Profile Error</h3>
            <p className="mt-2 break-words text-sm leading-6 text-slate-200">
              {pageError}
            </p>
          </div>
        )}

        <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl sm:p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
                Portfolio Builder
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Finish the public marketing page
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Work through these cards from top to bottom. Everything here feeds the public inspector portfolio and QR page.
              </p>
            </div>

            <Link
              href={publicProfileUrl || "/settings/public-profile"}
              target={publicProfileUrl ? "_blank" : undefined}
              className="rounded-xl border border-teal-400/60 px-5 py-3 text-center font-black text-teal-200 transition hover:bg-teal-500 hover:text-slate-950"
            >
              Preview Portfolio
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <a
              href="#identity"
              className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 transition hover:-translate-y-0.5 hover:border-cyan-300"
            >
              <p className="text-2xl">👤</p>
              <h3 className="mt-3 font-black text-white">Identity</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Logo, headshot, headline, contact info, and company bio.</p>
            </a>

            <a
              href="#services"
              className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4 transition hover:-translate-y-0.5 hover:border-teal-300"
            >
              <p className="text-2xl">🏅</p>
              <h3 className="mt-3 font-black text-white">Services & Credentials</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Service areas, certifications, services offered, and license info.</p>
            </a>

            <a
              href="#external-links"
              className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 transition hover:-translate-y-0.5 hover:border-yellow-300"
            >
              <p className="text-2xl">⭐</p>
              <h3 className="mt-3 font-black text-white">Reputation</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Google reviews, Facebook, website, and booking link.</p>
            </a>

            <a
              href="#qr-card"
              className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-4 transition hover:-translate-y-0.5 hover:border-fuchsia-300"
            >
              <p className="text-2xl">▦</p>
              <h3 className="mt-3 font-black text-white">QR & Sharing</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Copy, share, download, and print the public profile QR card.</p>
            </a>
          </div>
        </section>

        <form action={savePublicProfile} className="space-y-6">
          <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 sm:p-6 md:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
                  Visibility
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Publish Settings
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Turn this on when you want your profile visible from the public directory and direct profile link.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="flex gap-4 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4 md:col-span-2">
                <input
                  name="public_profile_enabled"
                  type="checkbox"
                  defaultChecked={company.public_profile_enabled === true}
                  className="mt-1 h-5 w-5 shrink-0 accent-cyan-400"
                />
                <span className="min-w-0">
                  <span className="block text-base font-black text-white">
                    Publish my inspector profile
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-300">
                    When enabled, people can open your direct link and find you in the inspector directory.
                  </span>
                </span>
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Profile Slug
                </p>
                <input
                  name="profile_slug"
                  defaultValue={profileSlug}
                  placeholder="jeff-shockey"
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
                <p className="mt-2 text-xs text-slate-500">
                  This creates /inspectors/your-profile-slug.
                </p>
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Booking Link
                </p>
                <input
                  name="public_booking_url"
                  defaultValue={company.public_booking_url || ""}
                  placeholder="/book or your existing booking link"
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Leave blank to use your On Point Inspect booking page.
                </p>
              </label>
            </div>
          </section>

          <section id="identity" className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 sm:p-6 md:p-8">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
              Identity
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Inspector & Company Info
            </h2>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Display Name
                </p>
                <input
                  name="display_name"
                  defaultValue={company.display_name || company.name || ""}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Headline
                </p>
                <input
                  name="public_profile_headline"
                  defaultValue={company.public_profile_headline || ""}
                  placeholder="Protecting Your Investment. One Inspection at a Time."
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Email
                </p>
                <input
                  name="email"
                  type="email"
                  defaultValue={company.email || ""}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Phone
                </p>
                <input
                  name="phone"
                  defaultValue={company.phone || ""}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Website
                </p>
                <input
                  name="website"
                  defaultValue={company.website || ""}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
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
                previewClassName="max-h-28 max-w-[220px] rounded-2xl border border-slate-700 bg-black/30 object-contain p-3"
              />

              <CompanyImageUploader
                name="public_profile_photo_url"
                label="Inspector Headshot"
                helper="Upload your headshot for the public inspector profile."
                companyId={String(company.id)}
                initialUrl={company.public_profile_photo_url || ""}
                folder="inspector-headshot"
                buttonText="Upload Headshot"
                previewClassName="h-28 w-28 rounded-3xl border border-slate-700 object-cover"
              />

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  About / Bio
                </p>
                <textarea
                  name="public_profile_bio"
                  defaultValue={company.public_profile_bio || ""}
                  rows={6}
                  placeholder="Tell clients and realtors what makes your inspection company different."
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>
            </div>
          </section>

          <section id="services" className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 sm:p-6 md:p-8">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
              Profile Content
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Services, Areas & Credentials
            </h2>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Service Areas
                </p>
                <textarea
                  name="service_areas"
                  defaultValue={company.service_areas || ""}
                  rows={6}
                  placeholder={"Maryland\nWest Virginia\nPennsylvania"}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Certifications
                </p>
                <textarea
                  name="certifications"
                  defaultValue={company.certifications || ""}
                  rows={6}
                  placeholder={"InterNACHI CPI\nFAA Part 107\nIAC2 Mold\nNRPP Radon"}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Services Offered
                </p>
                <textarea
                  name="services_offered"
                  defaultValue={company.services_offered || ""}
                  rows={5}
                  placeholder={"Home Inspection\nRadon Testing\nMold Testing\nDrone Roof Inspection"}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  License Info
                </p>
                <textarea
                  name="license_info"
                  defaultValue={company.license_info || ""}
                  rows={3}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>
            </div>
          </section>

          <section id="external-links" className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 sm:p-6 md:p-8">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
              Social & Reviews
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              External Links
            </h2>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Google Review URL
                </p>
                <input
                  name="google_review_url"
                  defaultValue={company.google_review_url || ""}
                  placeholder="Paste Google review/profile link"
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Facebook URL
                </p>
                <input
                  name="facebook_url"
                  defaultValue={company.facebook_url || ""}
                  placeholder="Paste Facebook business page link"
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-cyan-400"
                />
              </label>
            </div>
          </section>

          <div className="sticky bottom-24 z-20 rounded-2xl border border-slate-700 bg-[#0b1220]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur md:bottom-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold text-slate-300">
                Save changes to update your public profile and directory listing.
              </p>
              <button
                type="submit"
                className="w-full rounded-xl bg-cyan-500 px-8 py-4 font-black text-slate-950 hover:bg-cyan-400 sm:w-auto"
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
