import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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
    }
  );
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

function getBookingHref(company: any) {
  const override = normalizeExternalUrl(company.public_booking_url);
  if (override) return override;

  const slug = String(company.profile_slug || "").trim();
  return slug ? `/book?inspector=${encodeURIComponent(slug)}` : "/book";
}

export default async function PublicInspectorProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: company, error } = await supabase
    .from("companies")
    .select(
      "id, name, display_name, email, phone, website, logo_url, license_info, brand_color, profile_slug, public_profile_enabled, public_profile_headline, public_profile_bio, public_profile_photo_url, service_areas, certifications, services_offered, google_review_url, facebook_url, public_booking_url"
    )
    .eq("profile_slug", slug)
    .eq("public_profile_enabled", true)
    .maybeSingle();

  if (error) {
    console.error("Public inspector profile load error:", error);
  }

  if (!company) notFound();

  const companyName = company.display_name || company.name || "Inspection Company";
  const headline =
    company.public_profile_headline ||
    "Protecting Your Investment. One Inspection at a Time.";

  const serviceAreas = splitLines(company.service_areas);
  const certifications = splitLines(company.certifications || company.license_info);
  const services = splitLines(company.services_offered);
  const bookingHref = getBookingHref(company);
  const websiteHref = normalizeExternalUrl(company.website);
  const googleReviewHref = normalizeExternalUrl(company.google_review_url);
  const facebookHref = normalizeExternalUrl(company.facebook_url);
  const brandColor = company.brand_color || "#14b8a6";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020617] text-white">
      <section className="relative border-b border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.20),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_40%)]" />

        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div className="rounded-3xl border border-slate-800 bg-[#0b1220]/90 p-5 shadow-2xl sm:p-8">
              <div className="flex items-center gap-4">
                {company.public_profile_photo_url ? (
                  <img
                    src={company.public_profile_photo_url}
                    alt={companyName}
                    className="h-24 w-24 rounded-3xl border border-slate-700 object-cover"
                  />
                ) : (
                  <div
                    className="flex h-24 w-24 items-center justify-center rounded-3xl text-3xl font-black text-slate-950"
                    style={{ backgroundColor: brandColor }}
                  >
                    {getInitials(companyName)}
                  </div>
                )}

                {company.logo_url && (
                  <img
                    src={company.logo_url}
                    alt={`${companyName} logo`}
                    className="max-h-20 max-w-[150px] rounded-2xl border border-slate-700 bg-black/30 object-contain p-3"
                  />
                )}
              </div>

              <p className="mt-6 text-xs font-black uppercase tracking-[0.35em] text-teal-300">
                Public Inspector Profile
              </p>

              <h1 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
                {companyName}
              </h1>

              <p className="mt-4 text-lg leading-8 text-slate-300">
                {headline}
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={bookingHref}
                  className="rounded-xl bg-teal-500 px-6 py-4 text-center font-black text-slate-950 transition hover:bg-teal-400"
                >
                  Request Inspection
                </Link>

                {company.phone && (
                  <a
                    href={`tel:${company.phone}`}
                    className="rounded-xl border border-slate-700 px-6 py-4 text-center font-bold text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
                  >
                    Call
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-5">
              {company.public_profile_bio && (
                <div className="rounded-3xl border border-slate-800 bg-[#0b1220]/90 p-5 shadow-xl sm:p-8">
                  <h2 className="text-2xl font-black text-teal-300">
                    About
                  </h2>
                  <p className="mt-4 whitespace-pre-line text-base leading-8 text-slate-300">
                    {company.public_profile_bio}
                  </p>
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <InfoList title="Service Areas" items={serviceAreas} emptyText="Service area details coming soon." />
                <InfoList title="Certifications" items={certifications} emptyText="Certifications coming soon." />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl sm:p-8">
          <h2 className="text-2xl font-black text-teal-300">
            Services Offered
          </h2>

          {services.length === 0 ? (
            <p className="mt-4 text-slate-400">
              Services will be added soon.
            </p>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {services.map((service) => (
                <div
                  key={service}
                  className="rounded-2xl border border-teal-500/25 bg-teal-500/10 p-4 font-bold text-slate-100"
                >
                  ✓ {service}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl sm:p-8">
          <h2 className="text-2xl font-black text-teal-300">
            Contact
          </h2>

          <div className="mt-6 space-y-3 text-sm">
            {company.email && (
              <a
                href={`mailto:${company.email}`}
                className="block rounded-2xl border border-slate-700 bg-slate-950 p-4 font-bold text-slate-200 hover:border-teal-400 hover:text-teal-300"
              >
                Email: {company.email}
              </a>
            )}

            {company.phone && (
              <a
                href={`tel:${company.phone}`}
                className="block rounded-2xl border border-slate-700 bg-slate-950 p-4 font-bold text-slate-200 hover:border-teal-400 hover:text-teal-300"
              >
                Phone: {company.phone}
              </a>
            )}

            {websiteHref && (
              <a
                href={websiteHref}
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
    </main>
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
    <div className="rounded-3xl border border-slate-800 bg-[#0b1220]/90 p-5 shadow-xl sm:p-6">
      <h2 className="text-xl font-black text-white">
        {title}
      </h2>

      {items.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-slate-400">
          {emptyText}
        </p>
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
