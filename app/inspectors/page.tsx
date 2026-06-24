import Link from "next/link";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function createClient() {
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{
  q?: string;
  state?: string;
  service?: string;
}>;

type PageProps = {
  searchParams: SearchParams;
};

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

function cleanImageUrl(value: any) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (clean.startsWith("/logo") || clean.includes("localhost:")) return "";
  return clean;
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

function matchesSearch(company: any, query: string) {
  if (!query) return true;

  const haystack = [
    company.name,
    company.display_name,
    company.public_profile_headline,
    company.public_profile_bio,
    company.service_areas,
    company.certifications,
    company.services_offered,
    company.license_info,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function matchesState(company: any, state: string) {
  if (!state) return true;
  const areas = splitLines(company.service_areas).join(" ").toLowerCase();
  return areas.includes(state.toLowerCase());
}

function matchesService(company: any, service: string) {
  if (!service) return true;
  const services = splitLines(company.services_offered).join(" ").toLowerCase();
  return services.includes(service.toLowerCase());
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export default async function InspectorDirectoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = String(params?.q || "").trim();
  const state = String(params?.state || "").trim();
  const service = String(params?.service || "").trim();

  const supabase = await createClient();

  const { data: companiesRaw, error } = await supabase
    .from("companies")
    .select(
      "id, name, display_name, email, phone, website, logo_url, license_info, brand_color, profile_slug, public_profile_enabled, public_profile_headline, public_profile_bio, public_profile_photo_url, service_areas, certifications, services_offered, google_review_url, facebook_url, public_booking_url"
    )
    .eq("public_profile_enabled", true)
    .not("profile_slug", "is", null)
    .order("display_name", { ascending: true });

  if (error) {
    console.error("Inspector directory load error:", error);
  }

  const companies = (companiesRaw || []).filter((company: any) => {
    return (
      matchesSearch(company, query) &&
      matchesState(company, state) &&
      matchesService(company, service)
    );
  });

  const allCompanies = companiesRaw || [];

  const stateOptions = uniqueSorted(
    allCompanies.flatMap((company: any) =>
      splitLines(company.service_areas).filter((area) =>
        ["maryland", "west virginia", "pennsylvania", "virginia", "delaware", "ohio"].includes(
          area.toLowerCase()
        )
      )
    )
  );

  const serviceOptions = uniqueSorted(
    allCompanies.flatMap((company: any) => splitLines(company.services_offered))
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020617] text-white">
      <section className="relative border-b border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_40%)]" />

        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-teal-300">
            On Point Inspect
          </p>

          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-black leading-tight text-white sm:text-6xl">
                Inspector Directory
              </h1>

              <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
                Find public inspector profiles powered by On Point Inspect. Compare service areas, certifications, services, and booking options.
              </p>
            </div>

            <Link
              href="/book"
              className="rounded-xl bg-teal-500 px-6 py-4 text-center font-black text-slate-950 transition hover:bg-teal-400"
            >
              Request an Inspection
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <form className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr_0.8fr_auto] lg:items-end">
            <label className="block min-w-0">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                Search
              </p>
              <input
                name="q"
                defaultValue={query}
                placeholder="Search company, area, service, certification..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
              />
            </label>

            <label className="block min-w-0">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                State
              </p>
              <select
                name="state"
                defaultValue={state}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
              >
                <option value="">All states</option>
                {stateOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block min-w-0">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                Service
              </p>
              <select
                name="service"
                defaultValue={service}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
              >
                <option value="">All services</option>
                {serviceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-xl bg-teal-500 px-5 py-3 font-black text-slate-950 transition hover:bg-teal-400"
              >
                Filter
              </button>

              <Link
                href="/inspectors"
                className="rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
              >
                Reset
              </Link>
            </div>
          </div>
        </form>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-sm font-bold text-slate-400">
            Showing {companies.length} inspector{companies.length === 1 ? "" : "s"}
          </p>
        </div>

        {companies.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-700 bg-[#0b1220] p-8 text-center">
            <h2 className="text-2xl font-black text-white">
              No inspectors found
            </h2>
            <p className="mt-3 text-slate-400">
              Try a different state, service, or search term.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {companies.map((company: any) => {
              const companyName =
                company.display_name || company.name || "Inspection Company";
              const logoUrl = cleanImageUrl(company.logo_url);
              const headline =
                company.public_profile_headline ||
                "Protecting Your Investment. One Inspection at a Time.";
              const areas = splitLines(company.service_areas).slice(0, 5);
              const services = splitLines(company.services_offered).slice(0, 4);
              const bookingHref = getBookingHref(company);
              const profileHref = `/inspectors/${company.profile_slug}`;
              const brandColor = company.brand_color || "#14b8a6";

              return (
                <article
                  key={company.id}
                  className="flex h-full flex-col rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl transition hover:border-teal-500/60 sm:p-6"
                >
                  <div className="flex items-start gap-4">
                    {logoUrl ? (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-black/30 p-2">
                        <img
                          src={logoUrl}
                          alt={`${companyName} logo`}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div
                        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-2xl font-black text-slate-950"
                        style={{ backgroundColor: brandColor }}
                      >
                        {getInitials(companyName)}
                      </div>
                    )}

                    <div className="min-w-0">
                      <h2 className="text-2xl font-black leading-tight text-white">
                        {companyName}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        {headline}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <TagList title="Service Areas" items={areas} empty="Areas coming soon." />
                    <TagList title="Services" items={services} empty="Services coming soon." />
                  </div>

                  <div className="mt-auto flex flex-col gap-3 pt-6 sm:flex-row">
                    <Link
                      href={profileHref}
                      className="flex-1 rounded-xl border border-teal-500/60 px-4 py-3 text-center font-black text-teal-300 transition hover:bg-teal-500 hover:text-slate-950"
                    >
                      View Profile
                    </Link>

                    <Link
                      href={bookingHref}
                      className="flex-1 rounded-xl bg-teal-500 px-4 py-3 text-center font-black text-slate-950 transition hover:bg-teal-400"
                    >
                      Request Inspection
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function TagList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {title}
      </p>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
