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

const MORE_FEATURES = [
  {
    category: "Field & Reporting",
    items: [
      { title: "Equipment Analyzer", body: "Point the camera at a data plate - FLOW reads the model, serial, and specs into the report." },
      { title: "Radon & Mold Modules", body: "Track test devices, readings, lab results, and summaries alongside the main report." },
      { title: "Custom Report Sections", body: "Add your own sections to a report template, with soft-delete so nothing is lost by accident." },
      { title: "Templates & Favorites", body: "Save reusable findings and language once, insert them in seconds on every future report." },
    ],
  },
  {
    category: "Business Operations",
    items: [
      { title: "Mileage Tracking", body: "Drive distance from your office to each inspection is calculated and logged automatically." },
      { title: "Quotes & Pricing", body: "A quote calculator with address autocomplete and your own per-service pricing rules, including bundle discounts." },
      { title: "Team Dispatch", body: "Assign inspections to team members and see who has what on their schedule, with a revenue report per inspector." },
      { title: "Sent Email Tracking", body: "Every scheduling, agreement, and report email FLOW sends, with delivery and open status." },
    ],
  },
  {
    category: "Growth & Marketing",
    items: [
      { title: "Public Inspector Profile", body: "A branded page with your bio, service areas, certifications, and a photo portfolio of your work." },
      { title: "Google Reviews Sync", body: "Connect your Google Business Profile - your rating and recent reviews show up on your public page automatically." },
      { title: "Personalized QR Marketing Kit", body: "A branded QR code for business cards, yard signs, and report covers, downloadable as print-ready art." },
      { title: "Referral Leaderboard", body: "See which realtors send you the most business, ranked by revenue, referrals, and outstanding balances." },
    ],
  },
  {
    category: "Everywhere You Work",
    items: [
      { title: "Native iOS & Android Apps", body: "The full Field Tool and Command Center, as real native apps - not just a mobile browser tab." },
      { title: "Works Offline", body: "Capture findings and photos with no signal in the field; everything syncs the moment you're back online." },
      { title: "Push Notifications", body: "Get notified the moment a client views, signs, or pays - on your phone, not just in your inbox." },
      { title: "Free Trial, No Card", body: "Your first 3 real inspections are free. See your whole business running on FLOW before you pay anything." },
    ],
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

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-black uppercase tracking-[0.3em] text-teal-400">{children}</p>
  );
}

function FieldCaptureMockup() {
  return (
    <div className="rounded-3xl border border-slate-700 bg-[#0b1220] p-6 shadow-2xl shadow-black/40 md:p-7">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-teal-300">Live Field Tool</p>
        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase text-emerald-300">
          Offline Ready
        </span>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-[#020617]">
        <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
          <span className="text-5xl">📷</span>
        </div>
        <div className="p-4">
          <p className="text-xs font-black uppercase tracking-wide text-teal-300">Exterior &middot; Roofing</p>
          <p className="mt-2 text-sm font-bold text-white">"Missing shingles near the chimney flashing, moderate wear"</p>
          <div className="mt-3 rounded-xl border border-teal-500/30 bg-teal-500/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-teal-300">AI Draft</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              Several shingles are missing near the chimney flashing. This can allow water
              intrusion. Recommend evaluation and repair by a qualified roofing contractor.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-slate-800 bg-[#020617] p-2">
          <p className="text-[10px] font-bold uppercase text-slate-500">Findings</p>
          <p className="text-lg font-black text-white">14</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#020617] p-2">
          <p className="text-[10px] font-bold uppercase text-slate-500">Photos</p>
          <p className="text-lg font-black text-white">62</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#020617] p-2">
          <p className="text-[10px] font-bold uppercase text-slate-500">Synced</p>
          <p className="text-lg font-black text-teal-300">✓</p>
        </div>
      </div>
    </div>
  );
}

function BookingMockup() {
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  const activeDates = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
  return (
    <div className="rounded-3xl border border-slate-700 bg-[#0b1220] p-6 shadow-2xl shadow-black/40 md:p-7">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">Public Booking Page</p>
      <p className="mt-2 text-sm text-slate-400">flowinspect.app/book?inspector=your-company</p>

      <div className="mt-5 rounded-2xl border border-slate-800 bg-[#020617] p-4">
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map((day, i) => (
            <span key={i} className="text-[10px] font-black uppercase text-slate-500">{day}</span>
          ))}
          {Array.from({ length: 14 }).map((_, i) => {
            const dateNum = i + 1;
            const active = activeDates.includes(dateNum);
            return (
              <span
                key={dateNum}
                className={`mt-1 rounded-lg py-1.5 text-xs font-bold ${
                  active
                    ? "bg-teal-500 text-slate-950"
                    : "text-slate-600"
                }`}
              >
                {dateNum}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {["10:00 AM", "2:00 PM", "4:30 PM"].map((time) => (
          <div key={time} className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 py-2 text-center text-xs font-black text-cyan-200">
            {time}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Only the days and times you set as available ever show up - blocked dates and after-hours
        slots are hidden automatically.
      </p>
    </div>
  );
}

function RepairRequestMockup() {
  const items = [
    { title: "Roof - Missing Shingles", credit: "$450", status: "Agreed", tone: "emerald" },
    { title: "Electrical Panel - Double Tap", credit: "$180", status: "Agreed", tone: "emerald" },
    { title: "HVAC - Aging System", credit: "$300", status: "Discussion", tone: "yellow" },
    { title: "Plumbing - Minor Leak", credit: "$120", status: "Declined", tone: "red" },
  ];
  const toneClass: Record<string, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    yellow: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
    red: "border-red-500/40 bg-red-500/10 text-red-300",
  };
  return (
    <div className="rounded-3xl border border-slate-700 bg-[#0b1220] p-6 shadow-2xl shadow-black/40 md:p-7">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">Repair Request</p>
        <span className="rounded-full border border-slate-700 bg-[#020617] px-3 py-1 text-[10px] font-black uppercase text-slate-400">
          $1,050 Requested
        </span>
      </div>

      <div className="mt-5 space-y-2.5">
        {items.map((item) => (
          <div key={item.title} className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#020617] p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{item.title}</p>
              <p className="text-xs text-slate-500">Requested: {item.credit}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${toneClass[item.tone]}`}>
              {item.status}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        The agent or seller responds per item - agree, already repaired, credit, decline, or
        needs discussion - and you see it come back in real time.
      </p>
    </div>
  );
}

function DispatchMockup() {
  return (
    <div className="rounded-3xl border border-slate-700 bg-[#0b1220] p-6 shadow-2xl shadow-black/40 md:p-7">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-purple-300">Team Dispatch</p>

      <div className="mt-5 space-y-3">
        <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4">
          <div className="flex items-center justify-between">
            <p className="font-black text-white">Sarah M.</p>
            <span className="text-xs font-bold text-teal-300">$4,600 collected</span>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-500">
            <span>17 jobs assigned</span>
            <span>8 published</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-[#020617] p-4">
          <div className="flex items-center justify-between">
            <p className="font-black text-white">Mike T.</p>
            <span className="text-xs font-bold text-teal-300">$3,150 collected</span>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-500">
            <span>11 jobs assigned</span>
            <span>6 published</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-teal-500/30 bg-teal-500/10 p-3">
        <span className="text-xs font-bold text-teal-200">125 Ashland Drive - Assigned to:</span>
        <span className="rounded-lg border border-teal-500/50 bg-[#020617] px-2 py-1 text-xs font-black text-teal-300">
          Sarah M. ▾
        </span>
      </div>
    </div>
  );
}

type Spotlight = {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  mockup: React.ReactNode;
};

const SPOTLIGHTS: Spotlight[] = [
  {
    eyebrow: "In The Field",
    title: "Write the report while you're still standing in front of the defect.",
    body: "Snap a photo, say what you see, and FLOW drafts the observation, implication, and recommendation for you to review. It keeps working with no signal - everything syncs the moment you're back online.",
    bullets: [
      "AI drafting from photo + voice note",
      "Works fully offline in the field",
      "Equipment data-plate reader",
    ],
    mockup: <FieldCaptureMockup />,
  },
  {
    eyebrow: "Booking",
    title: "Stop playing phone tag to get on the calendar.",
    body: "Your public booking page only shows the days and times you actually have open. Clients and realtors book themselves in, and you review and confirm - no more texting back and forth to find a slot.",
    bullets: [
      "Configurable day-of-week & time availability",
      "Blocked dates respected automatically",
      "Requests land for your review before confirming",
    ],
    mockup: <BookingMockup />,
  },
  {
    eyebrow: "Repair Negotiation",
    title: "Turn findings into a repair request in one click - and actually see the response.",
    body: "Select the findings that matter, attach a requested credit to each, and send it to the agent. Their response comes back itemized - agree, already repaired, credit, decline - so nothing gets lost in a phone call.",
    bullets: [
      "Itemized credit requests per finding",
      "Seller/agent response tracked per item",
      "Printable, emailable addendum-ready summary",
    ],
    mockup: <RepairRequestMockup />,
  },
  {
    eyebrow: "Growing A Team",
    title: "Bring on inspectors without losing visibility into your business.",
    body: "Assign jobs to the right person on your team and see everyone's schedule in one place. A revenue report per inspector shows exactly who's producing what - no spreadsheets required.",
    bullets: [
      "Assign and reassign jobs to any teammate",
      "Revenue and job-count report per inspector",
      "Owner-only visibility across the whole team",
    ],
    mockup: <DispatchMockup />,
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

      {SPOTLIGHTS.map((spotlight, index) => (
        <section
          key={spotlight.title}
          className={`border-t border-slate-800/80 ${index % 2 === 1 ? "bg-[#03060f]" : ""}`}
        >
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
            <div
              className={`grid items-center gap-12 lg:grid-cols-2 ${
                index % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div>
                <SectionEyebrow>{spotlight.eyebrow}</SectionEyebrow>
                <h2 className="mt-4 text-3xl font-black leading-tight text-white md:text-4xl">
                  {spotlight.title}
                </h2>
                <p className="mt-5 text-base leading-8 text-slate-300">{spotlight.body}</p>

                <ul className="mt-6 space-y-3">
                  {spotlight.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-sm text-slate-300">
                      <span className="mt-0.5 text-teal-400">✓</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>{spotlight.mockup}</div>
            </div>
          </div>
        </section>
      ))}

      <section className="border-t border-slate-800/80 bg-[#03060f]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
          <div className="max-w-2xl">
            <SectionEyebrow>Everything In One Place</SectionEyebrow>
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
          <div className="max-w-2xl">
            <SectionEyebrow>The Complete List</SectionEyebrow>
            <h2 className="mt-4 text-3xl font-black text-white md:text-5xl">
              And everything else that keeps the business running.
            </h2>
          </div>

          <div className="mt-12 grid gap-10 md:grid-cols-2 xl:grid-cols-4">
            {MORE_FEATURES.map((group) => (
              <div key={group.category}>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-teal-400">
                  {group.category}
                </h3>
                <div className="mt-4 space-y-5">
                  {group.items.map((item) => (
                    <div key={item.title}>
                      <p className="font-black text-white">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-800/80 bg-[#03060f]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
          <SectionEyebrow>How It Works</SectionEyebrow>
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

      <section className="border-t border-slate-800/80">
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
