import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../utils/supabase/server";
import DeleteAccountSection from "./DeleteAccountSection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getNumber(value: any) {
  const numberValue = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numberValue) ? numberValue : 0;
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

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
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
          formData.get("report_footer_branding") || ""
        ).trim(),
        show_powered_by:
          String(formData.get("show_powered_by") || "") === "on",
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
            Manage your company branding, Stripe payment setup, and client online
            payment fee options.
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

        <form action={saveCompanySettings} className="space-y-6">
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

              <label className="block min-w-0 md:col-span-2">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Logo URL
                </p>
                <input
                  name="logo_url"
                  defaultValue={company.logo_url || ""}
                  placeholder="Paste logo URL for now. Upload button can be added next."
                  className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
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

              <label className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 md:col-span-2">
                <input
                  name="show_powered_by"
                  type="checkbox"
                  defaultChecked={company.show_powered_by !== false}
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
                <span className="min-w-0 text-sm font-bold leading-6 text-slate-200 sm:text-base">
                  Show “Powered by On Point Inspect” on client-facing pages
                </span>
              </label>
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
                  inspection payments are blocked until Stripe setup is complete,
                  so another inspector’s payment will never fall back to your
                  account.
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
                <label className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-700 bg-[#020617] p-4">
                  <input
                    name="online_payment_fee_enabled"
                    type="checkbox"
                    defaultChecked={feeEnabled}
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span className="min-w-0 text-sm font-bold leading-6 text-slate-200 sm:text-base">
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
