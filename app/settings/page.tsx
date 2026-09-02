import FastLinkButton from "../../components/FastLinkButton";
import { OWNER_EMAILS } from "../../lib/ownerEmails";
import {
  MessageCircle,
  DollarSign,
  CreditCard,
  Globe,
  Image as ImageIcon,
  Bell,
  Building2,
  Sparkles,
  Mail,
  Gauge,
  Layers,
} from "lucide-react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import DeleteAccountSection from "./DeleteAccountSection";
import SettingsSectionTabs from "../../components/SettingsSectionTabs";
import {
  COUNTRIES,
  BUSINESS_LANGUAGES,
  CURRENCIES,
  normalizeCountry,
  normalizeLanguage,
  normalizeCurrency,
} from "../../lib/locale";
import AppVersionTag from "../../components/AppVersionTag";
import TeamManagement from "../../components/TeamManagement";

const SETTINGS_TABS = [
  { key: "company-profile", label: "Company Profile", anchorId: "company-profile", group: "Company" },
  { key: "team", label: "Team", anchorId: "team", group: "Company" },
  { key: "standards-of-practice", label: "Standards of Practice", anchorId: "standards-of-practice", group: "Company" },
  { key: "payments", label: "Payments", anchorId: "payments", group: "Money" },
  { key: "public-profile", label: "Public Profile", anchorId: "public-profile", group: "Presence" },
  { key: "notifications", label: "Notifications", anchorId: "notifications", group: "Preferences" },
  { key: "time-location", label: "Time & Location", anchorId: "time-location", group: "Preferences" },
  { key: "delete-account", label: "Delete Account", anchorId: "delete-account", group: "Account" },
];
import PushNotificationSetup from "../../components/PushNotificationSetup";
import NotificationSettings from "../../components/NotificationSettings";
import SupportUnreadBadge from "../../components/SupportUnreadBadge";
import CompanyImageUploader from "./CompanyImageUploader";
import W9Section from "./W9Section";
import StandardsOfPracticeEditor from "./StandardsOfPracticeEditor";
import TimePreferencesSettings from "../../components/time-location/TimePreferencesSettings";
import SettingsToggle from "../../components/SettingsToggle";
import OnlinePaymentFeeFields from "../../components/OnlinePaymentFeeFields";
import Secure24ReferralSettings from "../../components/Secure24ReferralSettings";
import InsuranceReferralSettings from "../../components/InsuranceReferralSettings";
import OfficeAddressField from "../../components/OfficeAddressField";
import { geocodeAddress } from "../../lib/geocode";

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
          ? "border-emerald-500/50 bg-emerald-500/10"
          : "border-yellow-500/50 bg-yellow-500/10"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-muted)] sm:tracking-[0.25em]">
        Stripe Status
      </p>

      <h3
        className={`mt-2 text-xl font-semibold sm:text-2xl ${
          ready ? "text-[var(--fl-good-text)]" : "text-[var(--fl-warn-text)]"
        }`}
      >
        {ready ? "Ready for Payments" : "Setup Required"}
      </h3>

      <div className="mt-4 grid gap-2 text-sm text-[var(--fl-muted)] sm:grid-cols-2">
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
        <p className="mt-3 break-all rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-xs text-[var(--fl-muted)]">
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
      <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-4 pb-28 text-[var(--fl-text)] md:p-8 md:pb-10">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-5 shadow-2xl shadow-black/20 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-accent-text)]">
              Company Setup Required
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--fl-text)] sm:text-4xl">
              Create your company profile
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--fl-muted)] sm:text-base">
              Your inspector account is active, but it is not connected to a company yet. This can happen with older inspector accounts created before company profiles were added. Create your company profile below and you will be taken back to Settings.
            </p>

            {pageError && (
              <p className="mt-5 break-words rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-[var(--fl-crit-text)]">
                {pageError}
              </p>
            )}
          </section>

          <form
            action={createMissingCompanyProfile}
            className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-2xl shadow-black/20 sm:p-6 md:p-8"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Company Name *
                </p>
                <input
                  name="business_name"
                  required
                  defaultValue={defaultBusinessName}
                  placeholder="Your inspection company name"
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Your Name
                </p>
                <input
                  name="full_name"
                  defaultValue={defaultName}
                  placeholder="Inspector name"
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Email *
                </p>
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={defaultEmail}
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Phone
                </p>
                <input
                  name="phone"
                  placeholder="Business phone"
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Website
                </p>
                <input
                  name="website"
                  placeholder="https://yourwebsite.com"
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>
            </div>

            <div className="mt-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
              <h2 className="font-semibold text-[var(--fl-info-text)]">What happens next?</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                FLOW will create your company record, link it to your inspector account as the owner, and unlock Settings, public profile management, QR code tools, payments, and branding.
              </p>
            </div>

            <button
              type="submit"
              className="mt-6 w-full rounded-xl bg-teal-500 px-8 py-4 font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 sm:w-auto"
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
    const submittedFeeType = String(formData.get("online_payment_fee_type") || "").trim();
    const feeType =
      submittedFeeType === "flat" || submittedFeeType === "stripe_fee"
        ? submittedFeeType
        : "percentage";

    const officeAddress = String(formData.get("office_address") || "").trim();
    const officeAddressChanged = officeAddress !== String(company.office_address || "").trim();
    let officeLocation: { lat: number; lng: number } | null = null;

    const w9DocumentUrl = String(formData.get("w9_document_url") || "").trim();
    const w9DocumentChanged = w9DocumentUrl !== String(company.w9_document_url || "").trim();

    if (officeAddress && officeAddressChanged) {
      officeLocation = await geocodeAddress(officeAddress);
    }

    const { error: updateError } = await supabase
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
        office_address: officeAddress || null,
        ...(officeLocation
          ? { office_latitude: officeLocation.lat, office_longitude: officeLocation.lng }
          : !officeAddress
            ? { office_latitude: null, office_longitude: null }
            : {}),
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
        w9_document_url: w9DocumentUrl || null,
        ...(w9DocumentChanged
          ? { w9_document_uploaded_at: w9DocumentUrl ? new Date().toISOString() : null }
          : {}),
      })
      .eq("id", company.id);

    if (updateError) {
      redirect(`/settings?error=${encodeURIComponent(updateError.message)}`);
    }

    // Locale (country / report language / currency) is a separate best-effort
    // update so a not-yet-applied company-locale.sql migration can never block
    // the main company save.
    try {
      await supabase
        .from("companies")
        .update({
          country: normalizeCountry(formData.get("country")),
          preferred_language: normalizeLanguage(formData.get("preferred_language")),
          currency: normalizeCurrency(formData.get("currency")),
          show_common_ground: String(formData.get("show_common_ground") || "") === "on",
          show_common_ground_costs:
            String(formData.get("show_common_ground_costs") || "") === "on",
        })
        .eq("id", company.id);
    } catch {
      /* locale / common-ground columns may not exist yet */
    }

    if (w9DocumentChanged && w9DocumentUrl) {
      await supabase.from("w9_documents").insert({
        company_id: company.id,
        storage_path: w9DocumentUrl,
        uploaded_by: user.id,
      });
    }

    if (officeAddressChanged) {
      // Cached distance/drive-time on every inspection was computed from the
      // old office address - clear it so each report recomputes against the
      // new one the next time it's opened, instead of showing stale mileage.
      await supabase
        .from("inspections")
        .update({ distance_miles: null, drive_minutes: null })
        .eq("company_id", company.id);
    }

    revalidatePath("/settings");
    redirect("/settings?saved=1");
  }

  const { data: w9History } = await supabase
    .from("w9_documents")
    .select("id, storage_path, created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });

  const feeEnabled = company.online_payment_fee_enabled !== false;
  const feeType =
    company.online_payment_fee_type === "flat" || company.online_payment_fee_type === "stripe_fee"
      ? company.online_payment_fee_type
      : "percentage";
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
  const isOnPointOwner = OWNER_EMAILS.includes(
    String(user.email || "").trim().toLowerCase(),
  );

  const { data: ownerMembership } = await supabase
    .from("company_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  const isCompanyOwner = Boolean(ownerMembership);

  return (
    <main className="min-h-screen overflow-x-clip bg-[var(--fl-ground)] px-4 py-4 pb-28 text-[var(--fl-text)] md:p-8 md:pb-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-2xl shadow-black/20 sm:p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#14c8d2] sm:tracking-[0.35em]">
            FLOW
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--fl-text)] md:text-4xl">
            Settings
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--fl-muted)] sm:text-base">
            Manage your company branding, Stripe payment setup, and client
            online payment fee options.
          </p>
        </section>

        {saved && (
          <div className="rounded-2xl border border-emerald-500/50 bg-emerald-500/10 p-5">
            <h3 className="font-semibold text-[var(--fl-good-text)]">
              Settings saved successfully.
            </h3>
          </div>
        )}

        {stripeError && (
          <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-5">
            <h3 className="font-semibold text-[var(--fl-crit-text)]">Stripe Connect Error</h3>

            <p className="mt-2 break-words text-sm leading-6 text-[var(--fl-text)]">
              {stripeError}
            </p>

            <p className="mt-3 text-sm leading-6 text-[var(--fl-muted)]">
              If this mentions signing up for Connect, your live Stripe account
              still needs Stripe Connect enabled before FLOW can
              create connected inspector accounts.
            </p>
          </div>
        )}

        {stripeStatus && !stripeError && (
          <div className="rounded-2xl border border-sky-500/50 bg-sky-500/10 p-5">
            <h3 className="font-semibold text-[var(--fl-info-text)]">Stripe Status</h3>

            <p className="mt-2 break-words text-sm leading-6 text-[var(--fl-text)]">
              {stripeStatus}
            </p>
          </div>
        )}

        {pageError && !stripeError && (
          <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-5">
            <h3 className="font-semibold text-[var(--fl-crit-text)]">Settings Error</h3>

            <p className="mt-2 break-words text-sm leading-6 text-[var(--fl-text)]">
              {pageError}
            </p>
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FastLinkButton
            href="/support"
            className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 transition active:scale-[0.98] hover:border-fuchsia-400/70 hover:bg-fuchsia-500/10 sm:p-5 [touch-action:manipulation]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-[var(--fl-purple-text)]">
                <MessageCircle className="h-6 w-6" strokeWidth={2} />
              </div>
              <SupportUnreadBadge />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-purple-text)]">
              Support
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--fl-text)] sm:text-xl">
              Owner Support
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
              Message Jeff for setup, billing, reports, or bugs.
            </p>
            <p className="mt-4 text-sm font-semibold text-[var(--fl-purple-text)] group-hover:text-[var(--fl-purple-text)]">
              Open Support →
            </p>
          </FastLinkButton>

          <FastLinkButton
            href="/settings/pricing"
            className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 transition active:scale-[0.98] hover:border-emerald-400/70 hover:bg-emerald-500/10 sm:p-5 [touch-action:manipulation]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-[var(--fl-good-text)]">
              <DollarSign className="h-6 w-6" strokeWidth={2} />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-good-text)]">
              Personal
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--fl-text)] sm:text-xl">
              My Pricing
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
              Set your own rates for the Quotes calculator.
            </p>
            <p className="mt-4 text-sm font-semibold text-[var(--fl-good-text)] group-hover:text-[var(--fl-good-text)]">
              Manage Pricing →
            </p>
          </FastLinkButton>

          <FastLinkButton
            href="/settings/company-email"
            className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 transition active:scale-[0.98] hover:border-sky-400/70 hover:bg-sky-500/10 sm:p-5 [touch-action:manipulation]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-[var(--fl-info-text)]">
              <Mail className="h-6 w-6" strokeWidth={2} />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-info-text)]">
              Personal
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--fl-text)] sm:text-xl">
              Company Email
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
              Connect your mailbox to resend a stuck email through it.
            </p>
            <p className="mt-4 text-sm font-semibold text-[var(--fl-info-text)] group-hover:text-[var(--fl-info-text)]">
              Set Up Company Email →
            </p>
          </FastLinkButton>

          {isCompanyOwner && (
            <FastLinkButton
              href="/settings/company-pricing"
              className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-amber-500/30 bg-[var(--fl-surface)] p-4 transition active:scale-[0.98] hover:border-amber-400/70 hover:bg-amber-500/10 sm:p-5 [touch-action:manipulation]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-[var(--fl-warn-text)]">
                <Building2 className="h-6 w-6" strokeWidth={2} />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-warn-text)]">
                Owner Only
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--fl-text)] sm:text-xl">
                Company Pricing
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                Set the default price sheet your whole team uses.
              </p>
              <p className="mt-4 text-sm font-semibold text-[var(--fl-warn-text)] group-hover:text-[var(--fl-warn-text)]">
                Manage Company Pricing →
              </p>
            </FastLinkButton>
          )}

          {isCompanyOwner && (
            <FastLinkButton
              href="/settings/ai-writing-studio"
              className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-teal-500/30 bg-[var(--fl-surface)] p-4 transition active:scale-[0.98] hover:border-teal-400/70 hover:bg-teal-500/10 sm:p-5 [touch-action:manipulation]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-[var(--fl-accent-text)]">
                <Sparkles className="h-6 w-6" strokeWidth={2} />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-accent-text)]">
                Owner Only
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--fl-text)] sm:text-xl">
                AI Writing Studio
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                Control how the AI writes findings — standard, length, detail, and tone.
              </p>
              <p className="mt-4 text-sm font-semibold text-[var(--fl-accent-text)] group-hover:text-[var(--fl-accent-text)]">
                Open AI Writing Studio →
              </p>
            </FastLinkButton>
          )}

          {isCompanyOwner && (
            <FastLinkButton
              href="/settings/severities"
              className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-teal-500/30 bg-[var(--fl-surface)] p-4 transition active:scale-[0.98] hover:border-teal-400/70 hover:bg-teal-500/10 sm:p-5 [touch-action:manipulation]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-[var(--fl-accent-text)]">
                <Gauge className="h-6 w-6" strokeWidth={2} />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-accent-text)]">
                Owner Only
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--fl-text)] sm:text-xl">
                Severity Levels
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                Rename, recolor, reorder, or add your own severity levels — with revert to defaults.
              </p>
              <p className="mt-4 text-sm font-semibold text-[var(--fl-accent-text)] group-hover:text-[var(--fl-accent-text)]">
                Customize Severities →
              </p>
            </FastLinkButton>
          )}

          <FastLinkButton
            href="/settings/report-templates"
            className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 transition active:scale-[0.98] hover:border-teal-400/70 hover:bg-teal-500/10 sm:p-5 [touch-action:manipulation]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-[var(--fl-accent-text)]">
              <Layers className="h-6 w-6" strokeWidth={2} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-[var(--fl-text)] sm:text-xl">
              Report Templates
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
              Build section sets for specialty inspections — auto-apply them by service type.
            </p>
            <p className="mt-4 text-sm font-semibold text-[var(--fl-accent-text)] group-hover:text-[var(--fl-accent-text)]">
              Manage Templates →
            </p>
          </FastLinkButton>

          <FastLinkButton
            href="/billing"
            className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 transition active:scale-[0.98] hover:border-teal-400/70 hover:bg-teal-500/10 sm:p-5 [touch-action:manipulation]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-[var(--fl-accent-text)]">
              <CreditCard className="h-6 w-6" strokeWidth={2} />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-accent-text)]">
              Billing
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--fl-text)] sm:text-xl">
              Subscription
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
              Manage trial status and monthly plan.
            </p>
            <p className="mt-4 text-sm font-semibold text-[var(--fl-accent-text)] group-hover:text-[var(--fl-accent-text)]">
              Manage Billing →
            </p>
          </FastLinkButton>

          <FastLinkButton
            href="/settings/public-profile"
            className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-4 transition active:scale-[0.98] hover:border-cyan-400/70 hover:bg-cyan-500/10 sm:p-5 [touch-action:manipulation]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-[var(--fl-info-text)]">
              <Globe className="h-6 w-6" strokeWidth={2} />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-info-text)]">
              Public Profile
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--fl-text)] sm:text-xl">
              Marketing Page
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
              Logo, headshot, services, and profile link.
            </p>
            <p className="mt-4 text-sm font-semibold text-[var(--fl-info-text)] group-hover:text-[var(--fl-info-text)]">
              Manage Profile →
            </p>
          </FastLinkButton>

          {isOnPointOwner && (
            <FastLinkButton
              href="/settings/marketing-images"
              className="group w-full flex-col !items-stretch !justify-start rounded-2xl border border-teal-500/30 bg-[var(--fl-surface)] p-4 transition active:scale-[0.98] hover:border-teal-400/70 hover:bg-teal-500/10 sm:p-5 [touch-action:manipulation]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-[var(--fl-accent-text)]">
                <ImageIcon className="h-6 w-6" strokeWidth={2} />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-accent-text)]">
                Owner Only
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--fl-text)] sm:text-xl">
                Marketing Images
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                Create inspected property graphics using your exact FLOW template.
              </p>
              <p className="mt-4 text-sm font-semibold text-[var(--fl-accent-text)] group-hover:text-[var(--fl-accent-text)]">
                Open Template →
              </p>
            </FastLinkButton>
          )}
        </section>

        <SettingsSectionTabs tabs={SETTINGS_TABS}>

        <form action={saveCompanySettings} className="space-y-6">
          <section
            id="notifications"
            className="rounded-2xl border border-[#f3b23f]/25 bg-[var(--fl-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.3)] sm:p-6 md:p-8"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-[var(--fl-warn-text)]">
                  <Bell className="h-7 w-7" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-warn-text)]">
                    Notifications
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--fl-text)] sm:text-2xl">
                    Notification Center
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
                    Control native iPhone notifications, browser push alerts,
                    live activity popups, and notification sounds from one place.
                  </p>
                </div>
              </div>

              <div
                className={`w-full rounded-2xl border px-4 py-3 text-center text-sm font-semibold lg:w-auto ${
                  company.live_activity_enabled === false
                    ? "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]"
                    : "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]"
                }`}
              >
                {company.live_activity_enabled === false
                  ? "Alerts Off"
                  : "Alerts On"}
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="group flex w-full items-start justify-between gap-4 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 transition hover:border-amber-400/70 hover:bg-[var(--fl-surface-2)] sm:p-5">
                <div className="min-w-0">
                  <p className="break-words text-base font-semibold leading-6 text-[var(--fl-text)]">
                    Show live activity popups
                  </p>
                  <p className="mt-1 break-words text-sm leading-6 text-[var(--fl-muted)]">
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

              <div className="group flex w-full items-start justify-between gap-4 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 transition hover:border-amber-400/70 hover:bg-[var(--fl-surface-2)] sm:p-5">
                <div className="min-w-0">
                  <p className="break-words text-base font-semibold leading-6 text-[var(--fl-text)]">
                    Play notification sound
                  </p>
                  <p className="mt-1 break-words text-sm leading-6 text-[var(--fl-muted)]">
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

            <div className="mt-6 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4 sm:p-5">
              <PushNotificationSetup />
            </div>

            <div className="mt-6">
              <NotificationSettings />
            </div>
          </section>

          <section id="company-profile" className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 sm:p-6 md:p-8">
            <h2 className="text-xl font-semibold text-[var(--fl-accent-text)] sm:text-2xl">
              Company Profile
            </h2>

            <div className="mt-6 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface-2)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
                Region &amp; Language
              </p>
              <p className="mt-1 text-xs text-[var(--fl-faint)]">
                Your country sets your currency; your report language is the default
                clients see (they can switch languages on the report).
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="block min-w-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Country</p>
                  <select
                    name="country"
                    defaultValue={company.country || "US"}
                    className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Default Report Language</p>
                  <select
                    name="preferred_language"
                    defaultValue={company.preferred_language || "en"}
                    className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                  >
                    {BUSINESS_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Currency</p>
                  <select
                    name="currency"
                    defaultValue={company.currency || "USD"}
                    className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} ({c.symbol}) — {c.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Legal Business Name
                </p>
                <input
                  name="name"
                  defaultValue={company.name || ""}
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Display Name on Reports
                </p>
                <input
                  name="display_name"
                  defaultValue={company.display_name || company.name || ""}
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Email
                </p>
                <input
                  name="email"
                  type="email"
                  defaultValue={company.email || ""}
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Phone
                </p>
                <input
                  name="phone"
                  defaultValue={company.phone || ""}
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Website
                </p>
                <input
                  name="website"
                  defaultValue={company.website || ""}
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Brand Color
                </p>
                <input
                  name="brand_color"
                  defaultValue={company.brand_color || "#14b8a6"}
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
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
                previewClassName="max-h-28 max-w-[220px] rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] object-contain p-3"
              />

              <W9Section
                companyId={String(company.id)}
                initialPath={company.w9_document_url || ""}
                initialUploadedAt={company.w9_document_uploaded_at || null}
                initialHistory={w9History || []}
              />

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  License Info
                </p>
                <textarea
                  name="license_info"
                  defaultValue={company.license_info || ""}
                  rows={3}
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Business Starting Address
                </p>
                <OfficeAddressField defaultValue={company.office_address || ""} />
                <p className="mt-1 text-xs text-[var(--fl-faint)]">
                  Used to show driving distance and a map on each report, and to log mileage.
                  Only used when it changes, so save this once and it's set.
                </p>
              </label>

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fl-muted)]">
                  Report Footer Branding
                </p>
                <textarea
                  name="report_footer_branding"
                  defaultValue={company.report_footer_branding || ""}
                  rows={3}
                  className="w-full min-w-0 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                />
              </label>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 md:col-span-2">
                <p className="min-w-0 flex-1 break-words text-sm font-bold leading-6 text-[var(--fl-text)] sm:text-base">
                  Show “Powered by FLOW” on client-facing pages
                </p>
                <SettingsToggle
                  name="show_powered_by"
                  defaultChecked={company.show_powered_by !== false}
                  ariaLabel="Show Powered by FLOW on client-facing pages"
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-teal-500/30 bg-teal-500/[0.04] p-4 md:col-span-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-bold leading-6 text-[var(--fl-text)] sm:text-base">
                    Show <span className="text-[var(--fl-accent-text)]">Common Ground</span> on client reports
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--fl-muted)]">
                    Adds a panel under each finding showing how common the defect is (nationally and in your state) and how hard it is to fix — so routine issues don’t kill deals.
                  </p>
                </div>
                <SettingsToggle
                  name="show_common_ground"
                  defaultChecked={company.show_common_ground !== false}
                  ariaLabel="Show Common Ground on client reports"
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 md:col-span-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-bold leading-6 text-[var(--fl-text)] sm:text-base">
                    Show cost estimates to the client in Common Ground
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--fl-muted)]">
                    Off by default — the typical repair cost range stays out of the client report until you turn it on.
                  </p>
                </div>
                <SettingsToggle
                  name="show_common_ground_costs"
                  defaultChecked={company.show_common_ground_costs === true}
                  ariaLabel="Show cost estimates to the client in Common Ground"
                />
              </div>
            </div>
          </section>

          <div id="team">
            <TeamManagement />
          </div>

          <section id="payments" className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 sm:p-6 md:p-8">
            <h2 className="text-xl font-semibold text-[var(--fl-accent-text)] sm:text-2xl">
              Payments
            </h2>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <StripeStatusCard company={company} />

              <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-muted)] sm:tracking-[0.25em]">
                  Stripe Setup
                </p>

                <h3 className="mt-2 text-xl font-semibold text-[var(--fl-text)] sm:text-2xl">
                  Connect Your Stripe Account
                </h3>

                <p className="mt-3 text-sm leading-6 text-[var(--fl-muted)]">
                  Each inspector connects their own Stripe account once. Online
                  inspection payments are blocked until Stripe setup is
                  complete, so another inspector’s payment will never fall back
                  to your account.
                </p>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="/api/stripe/connect/onboard"
                    className="w-full rounded-xl bg-teal-500 px-5 py-3 text-center font-semibold text-slate-950 hover:bg-teal-400 sm:w-auto"
                  >
                    Connect / Update Stripe
                  </a>

                  <a
                    href="/api/stripe/connect/refresh"
                    className="w-full rounded-xl border border-[var(--fl-line)] px-5 py-3 text-center font-bold text-[var(--fl-text)] hover:border-teal-400 hover:text-[var(--fl-accent-text)] sm:w-auto"
                  >
                    Refresh Stripe Status
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-[var(--fl-text)] sm:text-xl">
                Online Payment Fee
              </h3>

              <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                Choose whether to pass an online card payment fee to the client when they pay
                their balance through the client portal - either a percentage of the balance or a
                flat dollar amount, whatever you want to charge. The client always sees this as
                its own clearly labeled line item before they pay, separate from the inspection
                balance.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 md:col-span-1">
                  <p className="min-w-0 flex-1 break-words text-sm font-bold leading-6 text-[var(--fl-text)] sm:text-base">
                    Pass online payment fee to client
                  </p>
                  <SettingsToggle
                    name="online_payment_fee_enabled"
                    defaultChecked={feeEnabled}
                    ariaLabel="Pass online payment fee to client"
                  />
                </div>

                <OnlinePaymentFeeFields defaultFeeType={feeType} defaultFeeAmount={feeAmount} />
              </div>
            </div>
          </section>

          <section
            id="secure24-referral"
            className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5 shadow-2xl shadow-black/20 sm:p-6"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-accent-text)]">
              Referral Partners
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fl-text)]">
              Home-Security Referral
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
              Optionally offer your clients a home-security referral on their report and earn a
              payout on installs. Off by default — you control it, and clients always opt in
              themselves.
            </p>
            <div className="mt-5">
              <Secure24ReferralSettings />
            </div>
            <div className="mt-5">
              <InsuranceReferralSettings />
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-xl sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-info-text)]">
              Developer
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fl-text)]">API &amp; Webhooks</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
              API keys, signed webhooks, and the MCP endpoint — connect Zapier, custom tools, or your
              own Claude/Gemini to your FLOW data.
            </p>
            <FastLinkButton
              href="/settings/developer"
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 sm:w-auto"
            >
              Open Developer Settings →
            </FastLinkButton>
          </section>

          <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5 shadow-xl sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-info-text)]">
              Integrations
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fl-text)]">Connected Tools</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
              Sync your inspections to Google Calendar and connect the tools you already use.
            </p>
            <FastLinkButton
              href="/settings/integrations"
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 sm:w-auto"
            >
              Open Integrations →
            </FastLinkButton>
          </section>

          <section
            id="public-profile"
            className="overflow-hidden rounded-2xl border border-cyan-500/30 bg-[var(--fl-surface)] shadow-2xl shadow-black/20"
          >
            <div className="flex flex-col gap-5 border-b border-[var(--fl-raised)] p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-info-text)]">
                  Public Profile
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fl-text)]">
                  Inspector Profile & Directory Listing
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--fl-muted)]">
                  Give clients, realtors, and the public a clean page to learn about your company, services, credentials, and booking options.
                </p>
              </div>

              <span
                className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
                  company.public_profile_enabled === true
                    ? "border-teal-400/60 bg-teal-500/15 text-[var(--fl-accent-text)]"
                    : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-muted)]"
                }`}
              >
                {company.public_profile_enabled === true ? "Published" : "Draft"}
              </span>
            </div>

            <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                  Manage
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--fl-text)]">
                  Edit Profile
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                  Headshot, bio, certifications, services, service areas, social links, booking link, and your branded QR marketing kit.
                </p>
                <FastLinkButton
                  href="/settings/public-profile"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 sm:w-auto"
                >
                  Manage Public Profile →
                </FastLinkButton>
              </div>

              <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                  Public Access
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--fl-text)]">
                  Directory & Direct Link
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
                  People can find published profiles in the inspector directory or by opening your direct profile link.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                  <FastLinkButton
                    href="/inspectors"
                    className="inline-flex items-center justify-center rounded-xl border border-[var(--fl-line)] px-4 py-3 text-sm font-semibold text-[var(--fl-text)] hover:border-cyan-400 hover:text-[var(--fl-info-text)]"
                  >
                    Open Directory
                  </FastLinkButton>
                  {publicProfileUrl && (
                    <FastLinkButton
                      href={publicProfileUrl.replace(
                        (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.flowinspect.app").replace(/\/$/, ""),
                        ""
                      )}
                      className="inline-flex items-center justify-center rounded-xl border border-cyan-500/60 px-4 py-3 text-sm font-semibold text-[var(--fl-info-text)] hover:bg-cyan-500/10"
                    >
                      Preview Profile
                    </FastLinkButton>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">
                  QR & Marketing Kit
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--fl-text)]">
                  Branded QR Manager
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--fl-text)]">
                  Your personalized QR code, logo overlay, download PNG, print card, copy link, and share tools now live in the dedicated public profile manager.
                </p>
                <p className="mt-3 break-all rounded-xl border border-teal-500/30 bg-[var(--fl-surface-2)] p-3 text-xs font-bold text-[var(--fl-text)]">
                  {publicProfileUrl || "Save a profile slug to generate your public link."}
                </p>
                <FastLinkButton
                  href="/settings/public-profile#qr-card"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-teal-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-400"
                >
                  Open QR Marketing Kit →
                </FastLinkButton>
              </div>
            </div>
          </section>

          <div id="standards-of-practice">
            <StandardsOfPracticeEditor
              initialTitle={standardsTitle}
              initialBody={standardsBody}
              initialIncludeShare={standardsIncludeShare}
              initialIncludePdf={standardsIncludePdf}
            />
          </div>

          <div id="time-location">
            <TimePreferencesSettings />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              className="w-full rounded-xl bg-teal-500 px-8 py-4 font-semibold text-slate-950 hover:bg-teal-400 sm:w-auto"
            >
              Save Settings
            </button>
          </div>
        </form>

        <div id="delete-account" className="pb-8">
          <DeleteAccountSection />
        </div>

        </SettingsSectionTabs>

        <AppVersionTag />
      </div>
    </main>
  );
}
