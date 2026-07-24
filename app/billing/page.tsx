import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import SubscriptionCheckoutButton from "../../components/SubscriptionCheckoutButton";
import ManageSubscriptionButton from "../../components/ManageSubscriptionButton";
import { formatUsdFromCents } from "../../lib/currency";
import { getSubscriptionPricing } from "../../lib/subscriptionPricing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function createUserClient() {
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

function isActiveStatus(status: any) {
  const value = String(status || "").toLowerCase();
  return value === "active" || value === "trialing";
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; cancelled?: string }>;
}) {
  const params = (await searchParams) || {};
  const supabase = await createUserClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile && user.email) {
    const fallback = await supabase
      .from("profiles")
      .select("*")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();
    profile = fallback.data;
  }

  const { count } = await supabase
    .from("inspections")
    .select("id", { count: "exact", head: true })
    .or(`inspector_id.eq.${user.id},user_id.eq.${user.id}`)
    .neq("is_demo", true);

  const freeLimit = Number(profile?.free_inspection_limit ?? 3);
  const used = Number(profile?.free_inspections_used ?? count ?? 0);
  const remaining = Math.max(0, freeLimit - used);

  const pricing = await getSubscriptionPricing();

  const exempt = profile?.subscription_exempt === true || profile?.subscription_required === false;
  const active = isActiveStatus(profile?.subscription_status);
  const customPrice = Number(profile?.subscription_price_override_cents || 0);
  const priceCents = exempt
    ? 0
    : customPrice > 0
      ? customPrice
      : profile?.founding_member
        ? pricing.foundingMemberPriceCents
        : pricing.standardPriceCents;

  const needsSubscription = !exempt && !active && used >= freeLimit;

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-3xl border border-teal-500/40 bg-[#0f172a] p-8 shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">FLOW Billing</p>
          <h1 className="mt-4 text-4xl font-black text-white">Inspector Subscription</h1>
          <p className="mt-4 max-w-2xl text-slate-300">
            Your first {freeLimit} real inspections are free. After that, FLOW is {formatUsdFromCents(priceCents)}/month unless the owner has set custom pricing or exempted your account.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/support"
              className="rounded-xl border border-blue-500 px-5 py-3 font-black text-blue-300 transition hover:bg-blue-500/10"
            >
              💬 Need Help? Contact Support
            </Link>

            <Link
              href="/settings"
              className="rounded-xl border border-slate-600 px-5 py-3 font-black text-slate-200 transition hover:bg-slate-800"
            >
              Back to Settings
            </Link>
          </div>
        </section>

        {params.success && (
          <div className="rounded-2xl border border-green-500/40 bg-green-950/20 p-5 font-bold text-green-200">
            Payment started successfully. Your account will update as soon as Stripe confirms the subscription.
          </div>
        )}

        {params.cancelled && (
          <div className="rounded-2xl border border-yellow-500/40 bg-yellow-950/20 p-5 font-bold text-yellow-200">
            Checkout was cancelled. You can subscribe any time.
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-700 bg-[#0f172a] p-5">
            <p className="text-xs font-black uppercase text-slate-400">Free Inspections Used</p>
            <p className="mt-3 text-3xl font-black text-white">{used}/{freeLimit}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-[#0f172a] p-5">
            <p className="text-xs font-black uppercase text-slate-400">Remaining</p>
            <p className="mt-3 text-3xl font-black text-teal-300">{remaining}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-[#0f172a] p-5">
            <p className="text-xs font-black uppercase text-slate-400">Monthly Price</p>
            <p className="mt-3 text-3xl font-black text-green-300">{exempt ? "Free" : `${formatUsdFromCents(priceCents)}/mo`}</p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-[#0f172a] p-8 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-slate-400">Status</p>
              <h2 className="mt-2 text-3xl font-black text-white">
                {exempt ? "Owner Exempt / Free" : active ? "Subscription Active" : needsSubscription ? "Subscription Required" : "Free Trial Active"}
              </h2>
              <p className="mt-3 text-slate-300">
                Current Stripe status: {profile?.subscription_status || "inactive"}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {exempt ? (
                <Link href="/dashboard" className="rounded-xl bg-teal-500 px-6 py-3 text-center font-black text-slate-950 hover:bg-teal-400">
                  Go to Dashboard
                </Link>
              ) : active ? (
                <>
                  <Link href="/dashboard" className="rounded-xl bg-teal-500 px-6 py-3 text-center font-black text-slate-950 hover:bg-teal-400">
                    Go to Dashboard
                  </Link>
                  <ManageSubscriptionButton />
                </>
              ) : (
                <SubscriptionCheckoutButton priceLabel={`${formatUsdFromCents(priceCents)}/month`} />
              )}

              <Link
                href="/support"
                className="rounded-xl border border-blue-500 px-6 py-3 text-center font-black text-blue-300 hover:bg-blue-500/10"
              >
                Contact Support
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
