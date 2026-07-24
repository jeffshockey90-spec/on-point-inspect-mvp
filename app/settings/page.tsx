import FastLinkButton from "../../components/FastLinkButton";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import DeleteAccountSection from "./DeleteAccountSection";
import PushNotificationSetup from "../../components/PushNotificationSetup";
import SupportUnreadBadge from "../../components/SupportUnreadBadge";
import CompanyImageUploader from "./CompanyImageUploader";
import StandardsOfPracticeEditor from "./StandardsOfPracticeEditor";
import TimePreferencesSettings from "../../components/time-location/TimePreferencesSettings";
import SettingsToggle from "../../components/SettingsToggle";

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

  async function createMissingCompanyProfile(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const existingCompany = await getCompanyForUser(supabase, user.id);
    if (existingCompany) {
      revalidatePath("/settings");
      redirect("/settings?saved=1");
    }

    const businessName = String(formData.get("business_name") || "").trim();
    const fullName = String(formData.get("full_name") || "").trim();
    const email = String(formData.get("email") || user.email || "")
      .trim()
      .toLowerCase();
    const phone = String(formData.get("phone") || "").trim();
    const website = String(formData.get("website") || "").trim();

    if (!businessName) {
      redirect(
        `/settings?error=${encodeURIComponent("Please enter your company name.")}`,
      );
    }

    if (!email) {
      redirect(
        `/settings?error=${encodeURIComponent("Please enter your email address.")}`,
      );
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const now = new Date().toISOString();
    const baseSlug = slugifyProfile(businessName) || `inspector-${user.id.slice(0, 8)}`;
    const profileSlug = `${baseSlug}-${user.id.slice(0, 6)}`;

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      email,
      full_name: fullName || user.user_metadata?.full_name || email,
      role: "inspector",
    });

    if (profileError) {
      redirect(`/settings?error=${encodeURIComponent(profileError.message)}`);
    }

    const { data: existingCompanyUser, error: existingError } = await supabaseAdmin
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      redirect(`/settings?error=${encodeURIComponent(existingError.message)}`);
    }

    if (existingCompanyUser?.company_id) {
      revalidatePath("/settings");
      redirect("/settings?saved=1");
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: businessName,
        display_name: businessName,
        email,
        phone,
        website,
        brand_color: "#14b8a6",
        profile_slug: profileSlug,
        public_profile_enabled: false,
        created_at: now,
      })
      .select("id")
      .single();

    if (companyError) {
      redirect(`/settings?error=${encodeURIComponent(companyError.message)}`);
    }

    const { error: companyUserError } = await supabaseAdmin
      .from("company_users")
      .insert({
        company_id: company.id,
        user_id: user.id,
        role: "owner",
        created_at: now,
      });

    if (companyUserError) {
      redirect(`/settings?error=${encodeURIComponent(companyUserError.message)}`);
    }

    revalidatePath("/settings");
    revalidatePath("/settings/public-profile");
    redirect("/settings?saved=company_created");
  }

  if (!company) {
    const defaultName = String(
      user.user_metadata?.full_name || user.email?.split("@")[0] || "",
    );
    const defaultBusinessName = String(user.user_metadata?.business_name || "");
    const defaultEmail = String(user.email || "");

    return (
      <main className="min-h-screen bg-[#050816] px-4 py-4 pb-28 text-white md:p-8 md:pb-10">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="rounded-3xl border border-teal-500/40 bg-[#0b1220] p-5 shadow-2xl shadow-black/20 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
              Company Setup Required
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Create your company profile
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Your inspector account is active, but it is not connected to a company yet. This can happen with older inspector accounts created before company profiles were added. Create your company profile below and you will be taken back to Settings.
            </p>

            {pageError && (
              <p className="mt-5 break-words rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">
                {pageError}
              </p>
            )}
          </section>

          <form
            action={createMissingCompanyProfile}
            className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-2xl shadow-black/20 sm:p-6 md:p-8"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Company Name *
                </p>
                <input
                  name="business_name"
                  required
                  defaultValue={defaultBusinessName}
                  placeholder="Your inspection company name"
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Your Name
                </p>
                <input
                  name="full_name"
                  defaultValue={defaultName}
                  placeholder="Inspector name"
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Email *
                </p>
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={defaultEmail}
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Phone
                </p>
                <input
                  name="phone"
                  placeholder="Business phone"
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Website
                </p>
                <input
                  name="website"
                  placeholder="https://yourwebsite.com"
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
                />
              </label>
            </div>

            <div className="mt-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
              <h2 className="font-black text-cyan-200">What happens next?</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                FLOW will create your company record, link it to your inspector account as the owner, and unlock Settings, public profile management, QR code tools, payments, and branding.
              </p>
            </div>

            <button
              type="submit"
              className="mt-6 w-full rounded-xl bg-teal-500 px-8 py-4 font-black text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 sm:w-auto"
            >
              Create Company Profile
            </button>
          </form>
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
    const feeType =
      String(formData.get("online_payment_fee_type") || "").trim() === "flat"
        ? "flat"
        : "percentage";

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
        online_payment_fee_type: feeType,
        online_payment_fee_amount: feeAmount || (feeType === "flat" ? 15 : 3.95),
        standards_of_practice_title: String(
          formData.get("standards_of_practice_title") || "Standards of Practice",
        ).trim(),
        standards_of_practice_body: String(
          formData.get("standards_of_practice_body") || "",
        ).trim(),
        standards_include_in_share:
          String(formData.get("standards_include_in_share") || "") === "on",
        standards_include_in_pdf:
          String(formData.get("standards_include_in_pdf") || "") === "on",
      })
      .eq("id", company.id);

    revalidatePath("/settings");
    redirect("/settings?saved=1");
  }

  const feeEnabled = company.online_payment_fee_enabled !== false;
  const feeType = company.online_payment_fee_type === "flat" ? "flat" : "percentage";
  const feeAmount =
    company.online_payment_fee_amount !== null && company.online_payment_fee_amount !== undefined
      ? company.online_payment_fee_amount
      : feeType === "flat"
        ? 15
        : 3.95;

  const publicProfileUrl = getPublicProfileUrl(company);
  const standardsTitle = String(
    company?.standards_of_practice_title || "Standards of Practice",
  );
  const standardsBody = String(company?.standards_of_practice_body || "");
  const standardsIncludeShare = company?.standards_include_in_share !== false;
  const standardsIncludePdf = company?.standards_include_in_pdf !== false;
  const isOnPointOwner =
    String(user.email || "").trim().toLowerCase() ===
    "jeff@onpointhomeinspect.com";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050816] px-4 py-4 pb-28 text-white md:p-8 md:pb-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-5 shadow-2xl shadow-black/20 sm:p-6 md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-[#14c8d2] sm:tracking-[0.35em]">
            FLOW
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
              still needs Stripe Connect enabled before FLOW can
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
          <FastLinkButton
            href="/support"
            className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-slate-800 bg-[#0b1220] p-4 transition active:scale-[0.98] hover:border-fuchsia-400/70 hover:bg-fuchsia-500/10 sm:p-5 [touch-action:manipulation]"
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
          </FastLinkButton>

          <FastLinkButton
            href="/billing"
            className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-slate-800 bg-[#0b1220] p-4 transition active:scale-[0.98] hover:border-teal-400/70 hover:bg-teal-500/10 sm:p-5 [touch-action:manipulation]"
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
          </FastLinkButton>

          <FastLinkButton
            href="/settings/public-profile"
            className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-slate-800 bg-[#0b1220] p-4 transition active:scale-[0.98] hover:border-cyan-400/70 hover:bg-cyan-500/10 sm:p-5 [touch-action:manipulation]"
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
          </FastLinkButton>

          {isOnPointOwner && (
            <FastLinkButton
              href="/settings/marketing-images"
              className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-teal-500/30 bg-[#0b1220] p-4 transition active:scale-[0.98] hover:border-teal-400/70 hover:bg-teal-500/10 sm:p-5 [touch-action:manipulation]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-2xl">
                🏠
              </div>
              <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-teal-300">
                Owner Only
              </p>
              <h2 className="mt-2 text-lg font-black text-white sm:text-xl">
                Marketing Images
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Create inspected property graphics using your exact FLOW template.
              </p>
              <p className="mt-4 text-sm font-black text-teal-300 group-hover:text-teal-200">
                Open Template →
              </p>
            </FastLinkButton>
          )}

          <a
            href="#notifications"
            className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-slate-800 bg-[#0b1220] p-4 transition active:scale-[0.98] hover:border-amber-400/70 hover:bg-amber-500/10 sm:p-5 [touch-action:manipulation]"
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
              <div className="group flex w-full items-start justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-950/80 p-4 transition hover:border-amber-400/70 hover:bg-slate-900 sm:p-5">
                <div className="min-w-0">
                  <p className="break-words text-base font-black leading-6 text-white">
                    Show live activity popups
                  </p>
                  <p className="mt-1 break-words text-sm leading-6 text-slate-400">
                    Shows the floating alert card when someone views a report,
                    signs an agreement, makes a payment, or submits a review.
                  </p>
                </div>
                <SettingsToggle
                  name="live_activity_enabled"
                  defaultChecked={company.live_activity_enabled !== false}
                  ariaLabel="Show live activity popups"
                  className="mt-0.5"
                />
              </div>

              <div className="group flex w-full items-start justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-950/80 p-4 transition hover:border-amber-400/70 hover:bg-slate-900 sm:p-5">
                <div className="min-w-0">
                  <p className="break-words text-base font-black leading-6 text-white">
                    Play notification sound
                  </p>
                  <p className="mt-1 break-words text-sm leading-6 text-slate-400">
                    Keep alerts visible but mute the sound when this is turned
                    off.
                  </p>
                </div>
                <SettingsToggle
                  name="live_activity_sound_enabled"
                  defaultChecked={company.live_activity_sound_enabled !== false}
                  ariaLabel="Play notification sound"
                  className="mt-0.5"
                />
              </div>
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

              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950 p-4 md:col-span-2">
                <p className="min-w-0 flex-1 break-words text-sm font-bold leading-6 text-slate-200 sm:text-base">
                  Show “Powered by FLOW” on client-facing pages
                </p>
                <SettingsToggle
                  name="show_powered_by"
                  defaultChecked={company.show_powered_by !== false}
                  ariaLabel="Show Powered by FLOW on client-facing pages"
                />
              </div>
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
                <FastLinkButton
                  href="/settings/public-profile"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-400 sm:w-auto"
                >
                  Manage Public Profile →
                </FastLinkButton>
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
                  <FastLinkButton
                    href="/inspectors"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200 hover:border-cyan-400 hover:text-cyan-300"
                  >
                    Open Directory
                  </FastLinkButton>
                  {publicProfileUrl && (
                    <FastLinkButton
                      href={publicProfileUrl.replace(
                        (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.flowinspect.app").replace(/\/$/, ""),
                        ""
                      )}
                      className="inline-flex items-center justify-center rounded-xl border border-cyan-500/60 px-4 py-3 text-sm font-black text-cyan-300 hover:bg-cyan-500/10"
                    >
                      Preview Profile
                    </FastLinkButton>
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
                <FastLinkButton
                  href="/settings/public-profile#qr-card"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-teal-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-teal-400"
                >
                  Open QR Marketing Kit →
                </FastLinkButton>
              </div>
            </div>
          </section>

          <StandardsOfPracticeEditor
            initialTitle={standardsTitle}
            initialBody={standardsBody}
            initialIncludeShare={standardsIncludeShare}
            initialIncludePdf={standardsIncludePdf}
          />

          <TimePreferencesSettings />

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
                Choose whether to pass an online card payment fee to the client when they pay
                their balance through the client portal - either a percentage of the balance or a
                flat dollar amount, whatever you want to charge. The client always sees this as
                its own clearly labeled line item before they pay, separate from the inspection
                balance.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-[#020617] p-4 md:col-span-1">
                  <p className="min-w-0 flex-1 break-words text-sm font-bold leading-6 text-slate-200 sm:text-base">
                    Pass online payment fee to client
                  </p>
                  <SettingsToggle
                    name="online_payment_fee_enabled"
                    defaultChecked={feeEnabled}
                    ariaLabel="Pass online payment fee to client"
                  />
                </div>

                <label className="block min-w-0">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                    Fee Type
                  </p>
                  <select
                    name="online_payment_fee_type"
                    defaultValue={feeType}
                    className="w-full min-w-0 rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400"
                  >
                    <option value="percentage">Percentage of balance</option>
                    <option value="flat">Flat dollar amount</option>
                  </select>
                </label>

                <label className="block min-w-0">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                    Fee Amount
                  </p>
                  <input
                    name="online_payment_fee_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={String(feeAmount)}
                    placeholder="e.g. 3.95 for 3.95%, or 15 for $15 flat"
                    className="w-full min-w-0 rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Enter a percent (e.g. 3.95) if Fee Type is Percentage, or a dollar amount
                    (e.g. 15) if Fee Type is Flat.
                  </p>
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

        <div className="pb-80">
          <DeleteAccountSection />
        </div>
      </div>
    </main>
  );
}
