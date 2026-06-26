import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../utils/supabase/server";
import DeleteAccountSection from "./DeleteAccountSection";
import PushNotificationSetup from "../../components/PushNotificationSetup";
import SupportUnreadBadge from "../../components/SupportUnreadBadge";
import CompanyImageUploader from "./CompanyImageUploader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getNumber(value: any) {
  const numberValue = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function slugifyProfile(value: any) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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

function normalizeLines(value: any) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
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

function getReadableMessage(value: string | undefined) {
  if (!value) return "";

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function StripeStatusCard({ company }: { company: any }) {
  const connected = Boolean(company?.stripe_account_id);
  const onboardingComplete = company?.stripe_onboarding_complete === true;
  const chargesEnabled = company?.stripe_charges_enabled === true;
  const payoutsEnabled = company?.stripe_payouts_enabled === true;
  const ready = connected && onboardingComplete && chargesEnabled;

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 ${
        ready
          ? "border-emerald-500/50 bg-emerald-950/20"
          : "border-yellow-500/50 bg-yellow-950/20"
      }`}
    >
      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 sm:tracking-[0.25em]">
        Stripe Status
      </p>

      <h3
        className={`mt-2 text-xl font-black sm:text-2xl ${
          ready ? "text-emerald-300" : "text-yellow-300"
        }`}
      >
        {ready ? "Ready for Payments" : "Setup Required"}
      </h3>

      <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <p className="min-w-0">Connected: {connected ? "Yes" : "No"}</p>
        <p className="min-w-0">
          Onboarding: {onboardingComplete ? "Complete" : "Incomplete"}
        </p>
        <p className="min-w-0">
          Charges: {chargesEnabled ? "Enabled" : "Not enabled"}
        </p>
        <p className="min-w-0">
          Payouts: {payoutsEnabled ? "Enabled" : "Not enabled"}
        </p>
      </div>

      {company?.stripe_account_id && (
        <p className="mt-3 break-all rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400">
          {company.stripe_account_id}
        </p>
      )}
    </div>
  );
}

type SettingsPageProps = {
  searchParams: Promise<{
    stripe_error?: string;
    stripe?: string;
    saved?: string;
    error?: string;
  }>;
};

export default async function SettingsPage({
  searchParams,
}: SettingsPageProps) {
  const params = await searchParams;

  const stripeError = getReadableMessage(params?.stripe_error);
  const stripeStatus = getReadableMessage(params?.stripe);
  const pageError = getReadableMessage(params?.error);
  const saved = params?.saved;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const company = await getCompanyForUser(supabase, user.id);

  if (!company) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-4 pb-28 text-white md:p-8 md:pb-10">
        <div className="mx-auto max-w-5xl rounded-3xl border border-red-500/40 bg-red-950/20 p-5 sm:p-8">
          <h1 className="text-2xl font-black text-red-300 sm:text-3xl">
            Company profile not found
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
            Your user account is not linked to a company yet. If this is a new
            inspector account, sign out and sign back in once. If it still
            appears, the company setup step did not complete.
          </p>

          {pageError && (
            <p className="mt-4 break-words rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">
              {pageError}
            </p>
          )}
        </div>
      </main>
    );
  }

  async function saveCompanySettings(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const company = await getCompanyForUser(supabase, user.id);
    if (!company) redirect("/settings?error=no_company");

    const onlinePaymentFeeEnabled =
      String(formData.get("online_payment_fee_enabled") || "") === "on";

    const feeAmount = getNumber(formData.get("online_payment_fee_amount"));

    await supabase
      .from("companies")
      .update({
        name: String(formData.get("name") || "").trim(),
        display_name: String(formData.get("display_name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        website: String(formData.get("website") || "").trim(),
        logo_url: String(formData.get("logo_url") || "").trim(),
        license_info: String(formData.get("license_info") || "").trim(),
        brand_color: String(formData.get("brand_color") || "#14b8a6").trim(),
        report_footer_branding: String(
          formData.get("report_footer_branding") || "",
        ).trim(),
        show_powered_by: String(formData.get("show_powered_by") || "") === "on",
        live_activity_enabled:
          String(formData.get("live_activity_enabled") || "") === "on",
        live_activity_sound_enabled:
          String(formData.get("live_activity_sound_enabled") || "") === "on",
        online_payment_fee_enabled: onlinePaymentFeeEnabled,
        online_payment_fee_type: "flat",
        online_payment_fee_amount: feeAmount || 0,
      })
      .eq("id", company.id);

    revalidatePath("/settings");
    redirect("/settings?saved=1");
  }

  const feeEnabled = company.online_payment_fee_enabled !== false;
  const feeAmount =
    company.online_payment_fee_amount !== null &&
    company.online_payment_fee_amount !== undefined
      ? company.online_payment_fee_amount
      : 15;

  const publicProfileUrl = getPublicProfileUrl(company);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050816] px-4 py-4 pb-28 text-white md:p-8 md:pb-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-2xl shadow-black/20 sm:p-6 md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300 sm:tracking-[0.35em]">
            On Point Inspect
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">
            Settings
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            Manage your company branding, Stripe payment setup, and client
            online payment fee options.
          </p>
        </section>

        {saved && (
          <div className="rounded-2xl border border-emerald-500/50 bg-emerald-950/20 p-5">
            <h3 className="font-black text-emerald-300">
              Settings saved successfully.
            </h3>
          </div>
        )}

        {stripeError && (
          <div className="rounded-2xl border border-red-500/50 bg-red-950/20 p-5">
            <h3 className="font-black text-red-300">Stripe Connect Error</h3>

            <p className="mt-2 break-words text-sm leading-6 text-slate-200">
              {stripeError}
            </p>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              If this mentions signing up for Connect, your live Stripe account
              still needs Stripe Connect enabled before On Point Inspect can
              create connected inspector accounts.
            </p>
          </div>
        )}

        {stripeStatus && !stripeError && (
          <div className="rounded-2xl border border-sky-500/50 bg-sky-950/20 p-5">
            <h3 className="font-black text-sky-300">Stripe Status</h3>

            <p className="mt-2 break-words text-sm leading-6 text-slate-200">
              {stripeStatus}
            </p>
          </div>
        )}

        {pageError && !stripeError && (
          <div className="rounded-2xl border border-red-500/50 bg-red-950/20 p-5">
            <h3 className="font-black text-red-300">Settings Error</h3>

            <p className="mt-2 break-words text-sm leading-6 text-slate-200">
              {pageError}
            </p>
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/support"
            className="group rounded-2xl border border-slate-800 bg-[#0b1220] p-4 transition hover:border-fuchsia-400/70 hover:bg-fuchsia-500/10 sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-2xl">
                💬
              </div>
              <SupportUnreadBadge />
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">
              Support
            </p>
            <h2 className="mt-2 text-lg font-black text-white sm:text-xl">
              Owner Support
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Message Jeff for setup, billing, reports, or bugs.
            </p>
            <p className="mt-4 text-sm font-black text-fuchsia-300 group-hover:text-fuchsia-200">
              Open Support →
            </p>
          </Link>

          <Link
            href="/billing"
            className="group rounded-2xl border border-slate-800 bg-[#0b1220] p-4 transition hover:border-teal-400/70 hover:bg-teal-500/10 sm:p-5"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-2xl">
              💳
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-teal-300">
              Billing
            </p>
            <h2 className="mt-2 text-lg font-black text-white sm:text-xl">
              Subscription
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Manage trial status and monthly plan.
            </p>
            <p className="mt-4 text-sm font-black text-teal-300 group-hover:text-teal-200">
              Manage Billing →
            </p>
          </Link>

          <Link
            href="/settings/public-profile"
            className="group rounded-2xl border border-slate-800 bg-[#0b1220] p-4 transition hover:border-cyan-400/70 hover:bg-cyan-500/10 sm:p-5"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-2xl">
              🌐
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
              Public Profile
            </p>
            <h2 className="mt-2 text-lg font-black text-white sm:text-xl">
              Marketing Page
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Logo, headshot, services, and profile link.
            </p>
            <p className="mt-4 text-sm font-black text-cyan-300 group-hover:text-cyan-200">
              Manage Profile →
            </p>
          </Link>

          <a
            href="#notifications"
            className="group rounded-2xl border border-slate-800 bg-[#0b1220] p-4 transition hover:border-amber-400/70 hover:bg-amber-500/10 sm:p-5"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl">
              🔔
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-amber-300">
              Alerts
            </p>
            <h2 className="mt-2 text-lg font-black text-white sm:text-xl">
              Live Activity
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              iPhone alerts, browser push, popups, and sounds.
            </p>
            <p className="mt-4 text-sm font-black text-amber-300 group-hover:text-amber-200">
              Manage Alerts →
            </p>
          </a>
        </section>

        <form action={saveCompanySettings} className="space-y-6">
          <section
            id="notifications"
            className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-[#0b1220] via-[#0b1220] to-amber-950/10 p-5 shadow-2xl shadow-black/20 sm:p-6 md:p-8"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-3xl">
                  🔔
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">
                    Notifications
                  </p>
                  <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">
                    Notification Center
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                    Control native iPhone notifications, browser push alerts,
                    live activity popups, and notification sounds from one place.
                  </p>
                </div>
              </div>

              <div
                className={`w-full rounded-2xl border px-4 py-3 text-center text-sm font-black lg:w-auto ${
                  company.live_activity_enabled === false
                    ? "border-slate-600 bg-slate-900 text-slate-300"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                }`}
              >
                {company.live_activity_enabled === false
                  ? "Alerts Off"
                  : "Alerts On"}
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <label className="group grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-2xl border border-slate-700 bg-slate-950/80 p-4 transition hover:border-amber-400/70 hover:bg-slate-900 sm:p-5">
                <input
                  name="live_activity_enabled"
                  type="checkbox"
                  defaultChecked={company.live_activity_enabled !== false}
                  className="mt-1 h-5 w-5 shrink-0 accent-teal-400"
                />
                <span className="min-w-0">
                  <span className="block break-words text-base font-black leading-6 text-white">
                    Show live activity popups
                  </span>
                  <span className="mt-1 block break-words text-sm leading-6 text-slate-400">
                    Shows the floating alert card when someone views a report,
                    signs an agreement, makes a payment, or submits a review.
                  </span>
                </span>
              </label>

              <label className="group grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-2xl border border-slate-700 bg-slate-950/80 p-4 transition hover:border-amber-400/70 hover:bg-slate-900 sm:p-5">
                <input
                  name="live_activity_sound_enabled"
                  type="checkbox"
                  defaultChecked={company.live_activity_sound_enabled !== false}
                  className="mt-1 h-5 w-5 shrink-0 accent-teal-400"
                />
                <span className="min-w-0">
                  <span className="block break-words text-base font-black leading-6 text-white">
                    Play notification sound
                  </span>
                  <span className="mt-1 block break-words text-sm leading-6 text-slate-400">
                    Keep alerts visible but mute the sound when this is turned
                    off.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-700/80 bg-[#020817]/80 p-4 sm:p-5">
              <PushNotificationSetup />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 sm:p-6 md:p-8">
            <h2 className="text-xl font-black text-teal-300 sm:text-2xl">
              Company Profile
            </h2>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Legal Business Name
                </p>
                <input
                  name="name"
                  defaultValue={company.name || ""}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Display Name on Reports
                </p>
                <input
                  name="display_name"
                  defaultValue={company.display_name || company.name || ""}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
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
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Phone
                </p>
                <input
                  name="phone"
                  defaultValue={company.phone || ""}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Website
                </p>
                <input
                  name="website"
                  defaultValue={company.website || ""}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Brand Color
                </p>
                <input
                  name="brand_color"
                  defaultValue={company.brand_color || "#14b8a6"}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <CompanyImageUploader
                name="logo_url"
                label="Company Logo"
                helper="Upload your company logo. This is used on your public profile and anywhere your company logo URL is displayed."
                companyId={String(company.id)}
                initialUrl={company.logo_url || ""}
                folder="company-logo"
                buttonText="Upload Company Logo"
                previewClassName="max-h-28 max-w-[220px] rounded-2xl border border-slate-700 bg-black/30 object-contain p-3"
              />

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  License Info
                </p>
                <textarea
                  name="license_info"
                  defaultValue={company.license_info || ""}
                  rows={3}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Report Footer Branding
                </p>
                <textarea
                  name="report_footer_branding"
                  defaultValue={company.report_footer_branding || ""}
                  rows={3}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <label className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 md:col-span-2 sm:flex-row sm:items-start">
                <input
                  name="show_powered_by"
                  type="checkbox"
                  defaultChecked={company.show_powered_by !== false}
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
                <span className="flex-1 text-sm font-bold leading-6 text-slate-200 break-words sm:text-base">
                  Show “Powered by On Point Inspect” on client-facing pages
                </span>
              </label>
            </div>
          </section>

          <section
            id="public-profile"
            className="overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#0b1220] shadow-2xl shadow-black/20"
          >
            <div className="flex flex-col gap-5 border-b border-slate-800/90 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">
                  Public Profile
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                  Inspector Profile & Directory Listing
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Give clients, realtors, and the public a clean page to learn about your company, services, credentials, and booking options.
                </p>
              </div>

              <span
                className={`inline-flex rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide ${
                  company.public_profile_enabled === true
                    ? "border-teal-400/60 bg-teal-500/15 text-teal-300"
                    : "border-slate-600 bg-slate-900 text-slate-400"
                }`}
              >
                {company.public_profile_enabled === true ? "Published" : "Draft"}
              </span>
            </div>

            <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-700/80 bg-[#020817] p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Manage
                </p>
                <h3 className="mt-2 text-xl font-black text-white">
                  Edit Profile
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Headshot, bio, certifications, services, service areas, social links, booking link, and your branded QR marketing kit.
                </p>
                <Link
                  href="/settings/public-profile"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-400 sm:w-auto"
                >
                  Manage Public Profile →
                </Link>
              </div>

              <div className="rounded-2xl border border-slate-700/80 bg-[#020817] p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Public Access
                </p>
                <h3 className="mt-2 text-xl font-black text-white">
                  Directory & Direct Link
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  People can find published profiles in the inspector directory or by opening your direct profile link.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                  <Link
                    href="/inspectors"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200 hover:border-cyan-400 hover:text-cyan-300"
                  >
                    Open Directory
                  </Link>
                  {publicProfileUrl && (
                    <Link
                      href={publicProfileUrl.replace(
                        (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://on-point-inspect-mvp.vercel.app").replace(/\/$/, ""),
                        ""
                      )}
                      className="inline-flex items-center justify-center rounded-xl border border-cyan-500/60 px-4 py-3 text-sm font-black text-cyan-300 hover:bg-cyan-500/10"
                    >
                      Preview Profile
                    </Link>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-teal-300">
                  QR & Marketing Kit
                </p>
                <h3 className="mt-2 text-xl font-black text-white">
                  Branded QR Manager
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  Your personalized QR code, logo overlay, download PNG, print card, copy link, and share tools now live in the dedicated public profile manager.
                </p>
                <p className="mt-3 break-all rounded-xl border border-teal-500/30 bg-slate-950/80 p-3 text-xs font-bold text-white">
                  {publicProfileUrl || "Save a profile slug to generate your public link."}
                </p>
                <Link
                  href="/settings/public-profile#qr-card"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-teal-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-teal-400"
                >
                  Open QR Marketing Kit →
                </Link>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 sm:p-6 md:p-8">
            <h2 className="text-xl font-black text-teal-300 sm:text-2xl">
              Payments
            </h2>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <StripeStatusCard company={company} />

              <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 sm:tracking-[0.25em]">
                  Stripe Setup
                </p>

                <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
                  Connect Your Stripe Account
                </h3>

                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Each inspector connects their own Stripe account once. Online
                  inspection payments are blocked until Stripe setup is
                  complete, so another inspector’s payment will never fall back
                  to your account.
                </p>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="/api/stripe/connect/onboard"
                    className="w-full rounded-xl bg-teal-500 px-5 py-3 text-center font-black text-slate-950 hover:bg-teal-400 sm:w-auto"
                  >
                    Connect / Update Stripe
                  </a>

                  <a
                    href="/api/stripe/connect/refresh"
                    className="w-full rounded-xl border border-slate-700 px-5 py-3 text-center font-bold text-slate-200 hover:border-teal-400 hover:text-teal-300 sm:w-auto"
                  >
                    Refresh Stripe Status
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
              <h3 className="text-lg font-black text-white sm:text-xl">
                Online Payment Fee
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-300">
                This lets each inspector choose whether to pass a flat online
                card payment fee to the client.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-[#020617] p-4 sm:flex-row sm:items-start">
                  <input
                    name="online_payment_fee_enabled"
                    type="checkbox"
                    defaultChecked={feeEnabled}
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span className="flex-1 text-sm font-bold leading-6 text-slate-200 break-words sm:text-base">
                    Pass online payment fee to client
                  </span>
                </label>

                <label className="block min-w-0">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                    Flat Fee Amount
                  </p>
                  <input
                    name="online_payment_fee_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={String(feeAmount)}
                    className="w-full min-w-0 rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400"
                  />
                </label>
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              className="w-full rounded-xl bg-teal-500 px-8 py-4 font-black text-slate-950 hover:bg-teal-400 sm:w-auto"
            >
              Save Settings
            </button>
          </div>
        </form>

        <DeleteAccountSection />
      </div>
    </main>
  );
}
