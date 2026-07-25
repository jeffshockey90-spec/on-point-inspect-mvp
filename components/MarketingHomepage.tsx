import Link from "next/link";

const CORE_FEATURES = [
  {
    icon: "✨",
    title: "AI-Assisted Reporting",
    body: "Draft findings from a photo and a voice note. FLOW writes the observation, implication, and recommendation - you review and publish.",
  },
  {
    icon: "📱",
    title: "Live Field Tool",
    body: "Capture, analyze, and mark up photos on-site, even offline. Findings sync the moment you're back online.",
  },
  {
    icon: "🗓️",
    title: "Online Booking & Scheduling",
    body: "A public booking page clients and realtors can use directly, with your real availability - no back-and-forth texting.",
  },
  {
    icon: "📝",
    title: "Digital Agreements",
    body: "Send agreements for e-signature before the inspection, with automatic reminders and signed-status tracking.",
  },
  {
    icon: "💳",
    title: "Payments & Invoicing",
    body: "Collect payment online with automatic invoice and balance tracking - no separate bookkeeping tool required.",
  },
  {
    icon: "🔐",
    title: "Client & Realtor Portals",
    body: "Everyone gets their own view: reports, agreements, payment status, and repair requests, always in one place.",
  },
  {
    icon: "🛠️",
    title: "Repair Request Builder",
    body: "Build an itemized repair-or-credit request straight from your findings, and see the seller's response come back per item.",
  },
  {
    icon: "🔔",
    title: "Automatic Notifications",
    body: "Push alerts when a client views the report, signs, or pays - and reminders before every scheduled inspection.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Book & Inspect",
    body: "Clients and realtors book straight from your public page. Walk the property with the Field Tool capturing findings as you go.",
  },
  {
    number: "02",
    title: "Publish the Report",
    body: "AI drafts the writeup from your photos and notes. Review, adjust, and publish - the client and realtor get instant access.",
  },
  {
    number: "03",
    title: "Get Paid, Get Referred",
    body: "Payment and agreements are handled inside FLOW. Realtor relationships and repeat business get tracked automatically.",
  },
];

export default function MarketingHomepage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020617] text-white">
      <header className="border-b border-slate-800/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/flow-logo-mark.png"
              alt="FLOW"
              className="h-10 w-auto rounded-lg border border-teal-500/30"
            />
            <span className="text-xl font-black tracking-tight text-[#14c8d2]">FLOW</span>
          </div>

          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/pricing"
              className="hidden rounded-xl px-4 py-2 text-sm font-bold text-slate-300 transition hover:text-white sm:block"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 transition hover:border-slate-500"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-teal-400"
            >
              Start Free
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,rgba(20,184,166,0.18),transparent_55%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-teal-400">
                Home Inspection Software
              </p>
              <h1 className="mt-5 text-5xl font-black leading-[1.05] tracking-tight text-white md:text-7xl">
                Capture. Organize.
                <br />
                <span className="text-[#14c8d2]">Complete.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
                FLOW runs the entire inspection business in one place - booking, AI-assisted
                reporting, agreements, payments, and client/realtor delivery - so nothing falls
                through the cracks between the front door and the final invoice.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="rounded-2xl bg-teal-400 px-7 py-4 text-center text-base font-black text-slate-950 transition hover:bg-teal-300 active:scale-[0.98]"
                >
                  Start Free - No Card Required
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-2xl border border-slate-700 bg-[#0b1220] px-7 py-4 text-center text-base font-black text-slate-200 transition hover:border-teal-400 active:scale-[0.98]"
                >
                  See Pricing
                </Link>
              </div>

              <p className="mt-5 text-sm text-slate-500">
                Your first 3 real inspections are free. No credit card to sign up.
              </p>
            </div>

            <div className="relative">
              <div className="rounded-3xl border border-slate-700 bg-[#0b1220] p-6 shadow-2xl shadow-black/40 md:p-8">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">
                  Today
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
                    <p className="text-xs font-bold uppercase text-teal-300">Scheduled</p>
                    <p className="mt-1 text-3xl font-black text-white">3</p>
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-[#020617] p-4">
                    <p className="text-xs font-bold uppercase text-slate-400">Unpaid</p>
                    <p className="mt-1 text-3xl font-black text-white">$820</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#020617] p-4">
                    <div>
                      <p className="font-bold text-white">711 Sampson Rock Rd</p>
                      <p className="text-xs text-slate-500">Report published &middot; Payment received</p>
                    </div>
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase text-emerald-300">
                      Complete
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#020617] p-4">
                    <div>
                      <p className="font-bold text-white">1099 Specks Run Rd</p>
                      <p className="text-xs text-slate-500">Agreement sent &middot; Awaiting signature</p>
                    </div>
                    <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-[10px] font-black uppercase text-yellow-300">
                      Pending
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#020617] p-4">
                    <div>
                      <p className="font-bold text-white">Repair Request</p>
                      <p className="text-xs text-slate-500">Seller responded &middot; 4 of 5 items agreed</p>
                    </div>
                    <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase text-cyan-300">
                      Responded
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-800/80 bg-[#03060f]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-400">
              Everything In One Place
            </p>
            <h2 className="mt-4 text-3xl font-black text-white md:text-5xl">
              One system, from first booking to final payment.
            </h2>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {CORE_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 transition hover:-translate-y-0.5 hover:border-teal-500/60"
              >
                <div className="text-3xl">{feature.icon}</div>
                <h3 className="mt-4 text-lg font-black text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-800/80">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-400">
            How It Works
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-black text-white md:text-5xl">
            Three steps, start to close.
          </h2>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.number}>
                <p className="text-5xl font-black text-slate-800">{step.number}</p>
                <h3 className="mt-3 text-xl font-black text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-800/80 bg-[#03060f]">
        <div className="mx-auto max-w-4xl px-5 py-20 text-center md:px-8">
          <h2 className="text-3xl font-black text-white md:text-5xl">
            Run your inspection business on FLOW.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-slate-300">
            Your first 3 inspections are free. No credit card, no setup calls - you&apos;re
            inspecting on FLOW in minutes.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="rounded-2xl bg-teal-400 px-8 py-4 text-base font-black text-slate-950 transition hover:bg-teal-300 active:scale-[0.98]"
            >
              Start Free
            </Link>
            <Link
              href="/pricing"
              className="rounded-2xl border border-slate-700 px-8 py-4 text-base font-black text-slate-200 transition hover:border-teal-400 active:scale-[0.98]"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 text-sm text-slate-500 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-2">
            <img src="/flow-logo-mark.png" alt="FLOW" className="h-6 w-auto rounded" />
            <span className="font-black text-slate-300">FLOW</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/pricing" className="hover:text-slate-300">Pricing</Link>
            <Link href="/login" className="hover:text-slate-300">Log In</Link>
            <Link href="/signup" className="hover:text-slate-300">Sign Up</Link>
            <a href="mailto:support@onpointhomeinspect.com" className="hover:text-slate-300">Support</a>
            <Link href="/terms" className="hover:text-slate-300">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-300">Privacy</Link>
          </div>

          <p>&copy; {new Date().getFullYear()} FLOW. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
