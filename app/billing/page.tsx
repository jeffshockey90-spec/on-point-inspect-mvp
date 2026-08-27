import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import SubscriptionCheckoutButton from "../../components/SubscriptionCheckoutButton";
import ManageSubscriptionButton from "../../components/ManageSubscriptionButton";
import { formatUsdFromCents } from "../../lib/currency";
import { getSubscriptionPricing } from "../../lib/subscriptionPricing";
import { isIOSShellRequest } from "../../lib/iosShell";
import { getBillingSource, isAppleActive, isStripeActive } from "../../lib/entitlements";

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

  // Entitlement can come from Stripe (web/Android) or Apple IAP (iOS) — see
  // lib/entitlements. The two never overwrite each other, so a web subscriber
  // opening the iOS app stays active without ever seeing a purchase prompt
  // (App Store Review Guideline 3.1.3(b), Multiplatform Services).
  const iosApp = await isIOSShellRequest();
  const exempt = profile?.subscription_exempt === true || profile?.subscription_required === false;
  const active = isStripeActive(profile) || isAppleActive(profile);
  const billingSource = getBillingSource(profile, count ?? 0);
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
    <main className="min-h-screen bg-[var(--fl-ground)] px-4 py-8 text-[var(--fl-text)] md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-2xl border border-teal-500/40 bg-[var(--fl-surface)] p-8 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">FLOW Billing</p>
          <h1 className="mt-4 text-4xl font-semibold text-[var(--fl-text)]">Inspector Subscription</h1>
          {/* On iOS the price shown must be the App Store price in the user's
              storefront and currency, which only StoreKit knows — so the web
              price is omitted here and IOSSubscribeButton renders the real one. */}
          <p className="mt-4 max-w-2xl text-[var(--fl-muted)]">
            {iosApp
              ? `Your first ${freeLimit} real inspections are free. After that, a subscription keeps your account active.`
              : `Your first ${freeLimit} real inspections are free. After that, FLOW is ${formatUsdFromCents(priceCents)}/month unless the owner has set custom pricing or exempted your account.`}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/support"
              className="rounded-xl border border-blue-500 px-5 py-3 font-semibold text-blue-300 transition hover:bg-blue-500/10"
            >
              💬 Need Help? Contact Support
            </Link>

            <Link
              href="/settings"
              className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)]"
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
          <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5">
            <p className="text-xs font-semibold uppercase text-[var(--fl-muted)]">Free Inspections Used</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--fl-text)]">{used}/{freeLimit}</p>
          </div>
          <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5">
            <p className="text-xs font-semibold uppercase text-[var(--fl-muted)]">Remaining</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--fl-accent-text)]">{remaining}</p>
          </div>
          {!iosApp && (
            <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5">
              <p className="text-xs font-semibold uppercase text-[var(--fl-muted)]">Monthly Price</p>
              <p className="mt-3 text-3xl font-semibold text-green-300">{exempt ? "Free" : `${formatUsdFromCents(priceCents)}/mo`}</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-8 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fl-muted)]">Status</p>
              <h2 className="mt-2 text-3xl font-semibold text-[var(--fl-text)]">
                {exempt ? "Owner Exempt / Free" : active ? "Subscription Active" : needsSubscription ? "Subscription Required" : "Free Trial Active"}
              </h2>
              <p className="mt-3 text-[var(--fl-muted)]">
                {billingSource === "apple"
                  ? "Billed through the App Store"
                  : `Current Stripe status: ${profile?.subscription_status || "inactive"}`}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {exempt ? (
                <Link href="/dashboard" className="rounded-xl bg-teal-500 px-6 py-3 text-center font-semibold text-slate-950 hover:bg-teal-400">
                  Go to Dashboard
                </Link>
              ) : active ? (
                <>
                  <Link href="/dashboard" className="rounded-xl bg-teal-500 px-6 py-3 text-center font-semibold text-slate-950 hover:bg-teal-400">
                    Go to Dashboard
                  </Link>
                  <ManageSubscriptionButton flow="manage" billingSource={billingSource} />
                  <ManageSubscriptionButton flow="cancel" billingSource={billingSource} />
                </>
              ) : (
                <SubscriptionCheckoutButton
                  priceLabel={`${formatUsdFromCents(priceCents)}/month`}
                  userId={user.id}
                />
              )}

              <Link
                href="/support"
                className="rounded-xl border border-blue-500 px-6 py-3 text-center font-semibold text-blue-300 hover:bg-blue-500/10"
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
