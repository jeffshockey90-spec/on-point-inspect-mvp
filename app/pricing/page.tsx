import Link from "next/link";
import { formatUsdFromCents } from "../../lib/currency";
import { getSubscriptionPricing } from "../../lib/subscriptionPricing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FREE_INSPECTIONS = 3;

const FEATURES = [
  "AI-assisted findings, drafting, and report review",
  "Live AI field camera - capture, analyze, and mark up photos on-site",
  "Digital agreements with client e-signing",
  "Online payments and automatic invoice tracking",
  "Client portal - reports, agreements, and payment status in one place",
  "Realtor portal - shared reports, downloads, and repair request tools",
  "Automated emails for scheduling, agreements, and report delivery",
  "Repair request builder with seller response tracking",
  "Mobile app for iOS and Android",
];

export default async function PricingPage() {
  const pricing = await getSubscriptionPricing();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] px-4 py-10 text-white md:px-6 md:py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-8%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-teal-500/15 blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(20,200,210,0.08),transparent_50%)]" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">
            FLOW Pricing
          </p>
          <h1 className="mt-4 text-4xl font-black md:text-6xl">
            Simple pricing for home inspectors
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Try FLOW on your first {FREE_INSPECTIONS} real inspections, free - no credit card
            required. After that, one flat monthly price covers everything.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-700 bg-[#0f172a] p-8">
            <p className="text-sm font-black uppercase tracking-wide text-slate-400">
              Free Trial
            </p>
            <p className="mt-4 text-5xl font-black text-white">$0</p>
            <p className="mt-2 text-slate-400">
              Your first {FREE_INSPECTIONS} inspections, on us
            </p>
            <p className="mt-6 text-sm leading-6 text-slate-300">
              Full access to every feature - AI drafting, agreements, payments, the client and
              realtor portals, the mobile app - so you can see exactly what running your business
              on FLOW looks like before paying anything.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex w-full items-center justify-center rounded-xl border border-slate-600 px-6 py-3 text-center font-black text-slate-200 transition hover:bg-slate-800"
            >
              Start Free
            </Link>
          </div>

          <div className="relative rounded-3xl border border-teal-500/70 bg-gradient-to-b from-teal-500/10 to-[#0f172a] p-8 shadow-[0_24px_80px_-24px_rgba(20,200,210,0.35)]">
            <div className="absolute -top-3 left-8 rounded-full bg-teal-500 px-4 py-1 text-xs font-black uppercase text-slate-950 shadow-lg shadow-teal-500/30">
              Most Inspectors
            </div>
            <p className="text-sm font-black uppercase tracking-wide text-teal-300">
              Standard
            </p>
            <p className="mt-4 text-5xl font-black text-white">
              {formatUsdFromCents(pricing.standardPriceCents)}
              <span className="text-lg font-bold text-slate-400">/mo</span>
            </p>
            <p className="mt-2 text-slate-400">Unlimited inspections, cancel anytime</p>
            <p className="mt-6 text-sm leading-6 text-slate-300">
              Everything in the free trial, unlocked for as many inspections as you run. Reduced
              founding-member pricing ({formatUsdFromCents(pricing.foundingMemberPriceCents)}/mo) is
              available for a limited number of early customers - ask when you sign up.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-teal-500 px-6 py-3 text-center font-black text-slate-950 transition hover:bg-teal-400"
            >
              Get Started
            </Link>
          </div>
        </div>

        <section className="mt-16 rounded-3xl border border-slate-800 bg-[#0f172a] p-8 md:p-10">
          <h2 className="text-2xl font-black text-white">Everything included, every plan</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-start gap-3">
                <span className="mt-1 text-teal-400">✓</span>
                <span className="text-sm leading-6 text-slate-300">{feature}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-12 text-center">
          <p className="text-slate-400">
            Questions before you sign up?{" "}
            <a href="mailto:support@onpointhomeinspect.com" className="font-bold text-teal-300 hover:text-teal-200">
              Contact us
            </a>
          </p>
          <p className="mt-2 text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-teal-300 hover:text-teal-200">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
