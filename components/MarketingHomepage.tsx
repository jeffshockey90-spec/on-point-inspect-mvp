import Link from "next/link";
import Image from "next/image";

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
    category: "Getting Started",
    items: [
      { title: "5-Step Setup Guide", body: "Company info, agreements, scheduling, report sections, and the Field Tool - a guided checklist gets your account ready in one sitting." },
      { title: "Sample Inspection", body: "Generate a full sample report with one click to see exactly how a finished FLOW report looks before your first real job." },
      { title: "Guided Dashboard Tour", body: "A quick walkthrough of the Command Center the first time you log in, so nothing important is hidden." },
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
    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--fl-accent-text)]">{children}</p>
  );
}

// Reproduces the real "Confirm Finding" screen from
// components/ai-camera/CaptureConfirmCard.tsx - same header treatment,
// field labels, and layout order the app actually uses after a capture.
function FieldCaptureMockup() {
  const fieldLabel = "text-[9px] font-semibold uppercase tracking-wide text-[var(--fl-muted)]";
  const fieldBox = "mt-1 rounded-lg border border-white/15 bg-[var(--fl-surface-2)] p-2 text-[10px] leading-snug text-[var(--fl-text)]";

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between px-5 pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fl-info-text)]">
          Confirm Finding
        </p>
        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase text-[var(--fl-good-text)]">
          Offline Ready
        </span>
      </div>

      <div className="p-5">
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-white/10 bg-[var(--fl-surface-2)]">
          <Image
            src="/marketing/field-finding-roof.jpeg"
            alt="Missing and damaged roof shingles, photographed from a drone during a real FLOW inspection"
            fill
            sizes="(max-width: 768px) 90vw, 420px"
            className="object-cover"
          />
        </div>

        <div className="mt-4 space-y-2.5">
          <div>
            <p className={fieldLabel}>Title</p>
            <p className={fieldBox}>Missing and Damaged Roof Shingles</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <p className={fieldLabel}>Section</p>
              <p className={fieldBox}>Roofing</p>
            </div>
            <div>
              <p className={fieldLabel}>Severity</p>
              <p className={`${fieldBox} text-[var(--fl-warn-text)]`}>Recommended Repair</p>
            </div>
          </div>
          <div>
            <p className={fieldLabel}>Observation</p>
            <p className={fieldBox}>Several roof shingles are missing or damaged, exposing the underlayment.</p>
          </div>
          <div>
            <p className={fieldLabel}>Recommendation</p>
            <p className={fieldBox}>Recommend evaluation and repair by a qualified roofing contractor.</p>
          </div>
        </div>

        <p className="mt-4 text-[9px] font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
          Also Captured This Visit
        </p>
        <div className="relative mt-2 aspect-[16/9] overflow-hidden rounded-xl border border-white/10">
          <Image
            src="/marketing/field-finding-water-heater.jpeg"
            alt="Active water leak at a well pressure tank, photographed during a real FLOW inspection"
            fill
            sizes="(max-width: 768px) 90vw, 420px"
            className="object-cover"
          />
          <span className="absolute bottom-2 left-2 rounded-full border border-red-400/60 bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-[var(--fl-crit-text)]">
            Water Leak at Pressure Tank
          </span>
        </div>
      </div>
    </div>
  );
}

// Reproduces the real "AI Equipment Scanner" result screen from
// app/equipment-analyzer/page.tsx - the "Enhanced Equipment Intelligence"
// card and its IntelligenceItem grid. Both the photo and the values below
// are real - read directly off the data plate pictured, from an actual
// FLOW inspection.
function EquipmentAnalyzerMockup() {
  const items = [
    { label: "Unit", value: "Fan Coil 612T" },
    { label: "Model", value: "AHE30B3XH21B" },
    { label: "Serial", value: "W1H6916544" },
    { label: "Refrigerant", value: "R-410A" },
    { label: "Motor", value: "2.8 FLA, 1/3 HP" },
    { label: "Voltage", value: "208/230V, 60Hz" },
    { label: "Design Pressure", value: "500 PSIG" },
    { label: "Manufacturer", value: "Johnson Controls" },
  ];

  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-6 shadow-2xl shadow-black/40 md:p-7">
      <p className="text-lg font-bold text-[var(--fl-text)]">AI Equipment Scanner</p>
      <p className="mt-1 text-xs text-[var(--fl-muted)]">Data plate photo scanned automatically</p>

      <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-xl border border-white/10">
        <Image
          src="/marketing/equipment-dataplate.jpeg"
          alt="HVAC fan coil unit data plate, photographed during a real FLOW inspection"
          fill
          sizes="(max-width: 768px) 90vw, 420px"
          className="object-cover"
        />
      </div>

      <section className="mt-4 rounded-2xl border border-teal-500/40 bg-teal-500/10 p-4">
        <h3 className="text-sm font-bold text-[var(--fl-accent-text)]">Enhanced Equipment Intelligence</h3>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {items.map((item) => (
            <div key={item.label} className="rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] p-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--fl-muted)]">{item.label}</p>
              <p className="mt-0.5 text-xs font-bold text-[var(--fl-text)]">{item.value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BookingMockup() {
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  const activeDates = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-6 shadow-2xl shadow-black/40 md:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-info-text)]">Public Booking Page</p>
      <p className="mt-2 text-sm text-[var(--fl-muted)]">flowinspect.app/book?inspector=your-company</p>

      <div className="mt-5 rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4">
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map((day, i) => (
            <span key={i} className="text-[10px] font-semibold uppercase text-[var(--fl-faint)]">{day}</span>
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
                    : "text-[var(--fl-faint)]"
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
          <div key={time} className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 py-2 text-center text-xs font-semibold text-[var(--fl-info-text)]">
            {time}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-5 text-[var(--fl-faint)]">
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
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-[var(--fl-good-text)]",
    yellow: "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]",
    red: "border-red-500/40 bg-red-500/10 text-[var(--fl-crit-text)]",
  };
  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-6 shadow-2xl shadow-black/40 md:p-7">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-warn-text)]">Repair Request</p>
        <span className="rounded-full border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-1 text-[10px] font-semibold uppercase text-[var(--fl-muted)]">
          $1,050 Requested
        </span>
      </div>

      <div className="mt-5 space-y-2.5">
        {items.map((item) => (
          <div key={item.title} className="flex items-center justify-between rounded-xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[var(--fl-text)]">{item.title}</p>
              <p className="text-xs text-[var(--fl-faint)]">Requested: {item.credit}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${toneClass[item.tone]}`}>
              {item.status}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-5 text-[var(--fl-faint)]">
        The agent or seller responds per item - agree, already repaired, credit, decline, or
        needs discussion - and you see it come back in real time.
      </p>
    </div>
  );
}

function DispatchMockup() {
  return (
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-6 shadow-2xl shadow-black/40 md:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-purple-text)]">Team Dispatch</p>

      <div className="mt-5 space-y-3">
        <div className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-[var(--fl-text)]">Sarah M.</p>
            <span className="text-xs font-bold text-[var(--fl-accent-text)]">$4,600 collected</span>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-[var(--fl-faint)]">
            <span>17 jobs assigned</span>
            <span>8 published</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-[var(--fl-text)]">Mike T.</p>
            <span className="text-xs font-bold text-[var(--fl-accent-text)]">$3,150 collected</span>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-[var(--fl-faint)]">
            <span>11 jobs assigned</span>
            <span>6 published</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-teal-500/30 bg-teal-500/10 p-3">
        <span className="text-xs font-bold text-[var(--fl-accent-text)]">125 Ashland Drive - Assigned to:</span>
        <span className="rounded-lg border border-teal-500/50 bg-[var(--fl-ground)] px-2 py-1 text-xs font-semibold text-[var(--fl-accent-text)]">
          Sarah M. ▾
        </span>
      </div>
    </div>
  );
}

function PhoneFrame({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="w-full max-w-[220px]">
      <div className="relative aspect-[9/19] w-full rounded-[2.25rem] border-[6px] border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-1.5 shadow-2xl shadow-black/50">
        <div className="absolute left-1/2 top-1.5 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-[var(--fl-surface-2)]" />
        <div className="relative h-full w-full overflow-hidden rounded-[1.65rem] bg-[var(--fl-ground)]">
          {children}
        </div>
      </div>
      <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
        {label}
      </p>
    </div>
  );
}

function MobileAppMockup() {
  return (
    <div className="flex flex-wrap items-end justify-center gap-6 sm:gap-8">
      <PhoneFrame label="Field Tool">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-3 pt-6 text-[9px] font-bold text-[var(--fl-muted)]">
            <span>9:41</span>
            <span>●●●</span>
          </div>
          <div className="mt-3 flex-1 bg-gradient-to-br from-[var(--fl-surface-2)] to-[var(--fl-surface)]" />
          <div className="space-y-2 p-2.5">
            <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 p-2">
              <p className="text-[7px] font-semibold uppercase tracking-wide text-[var(--fl-accent-text)]">AI Draft Ready</p>
              <p className="mt-0.5 text-[8px] leading-tight text-[var(--fl-muted)]">Missing shingles near chimney flashing...</p>
            </div>
            <div className="flex items-center justify-center rounded-full bg-teal-400 py-2 text-[8px] font-semibold text-slate-950">
              ● Capture Finding
            </div>
          </div>
          <div className="mt-auto flex justify-around border-t border-[var(--fl-raised)] bg-[var(--fl-ground)] py-2.5">
            {["🏠", "📷", "📋", "⚙️"].map((icon, i) => (
              <span key={i} className={`text-[10px] ${i === 1 ? "opacity-100" : "opacity-40"}`}>{icon}</span>
            ))}
          </div>
        </div>
      </PhoneFrame>

      <PhoneFrame label="Push Notifications">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-3 pt-6 text-[9px] font-bold text-[var(--fl-muted)]">
            <span>9:41</span>
            <span>●●●</span>
          </div>
          <div className="mt-6 space-y-2 px-2">
            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-2 shadow-lg">
              <p className="text-[7px] font-semibold uppercase tracking-wide text-[var(--fl-good-text)]">FLOW &middot; Payment</p>
              <p className="mt-0.5 text-[8px] font-bold text-[var(--fl-text)]">Payment Received</p>
              <p className="text-[7px] text-[var(--fl-muted)]">$450 for 711 Sampson Rock Rd</p>
            </div>
            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-2 shadow-lg">
              <p className="text-[7px] font-semibold uppercase tracking-wide text-[var(--fl-info-text)]">FLOW &middot; Report</p>
              <p className="mt-0.5 text-[8px] font-bold text-[var(--fl-text)]">Realtor Viewed Report</p>
              <p className="text-[7px] text-[var(--fl-muted)]">Just now</p>
            </div>
            <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-2 shadow-lg">
              <p className="text-[7px] font-semibold uppercase tracking-wide text-[var(--fl-warn-text)]">FLOW &middot; Reminder</p>
              <p className="mt-0.5 text-[8px] font-bold text-[var(--fl-text)]">Inspection Tomorrow</p>
              <p className="text-[7px] text-[var(--fl-muted)]">9:00 AM &middot; 1099 Specks Run Rd</p>
            </div>
          </div>
        </div>
      </PhoneFrame>
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
    eyebrow: "Equipment Analyzer",
    title: "Point the camera at a data plate. Skip the typing.",
    body: "Photograph the equipment data plate and FLOW reads the model, serial, refrigerant, electrical specs, and more straight into the report - along with an estimated service life and condition assessment.",
    bullets: [
      "Model, serial, and electrical specs read automatically",
      "Refrigerant type and capacity flagged (including R-22 alerts)",
      "Estimated service life and maintenance guidance included",
    ],
    mockup: <EquipmentAnalyzerMockup />,
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
  {
    eyebrow: "Native Mobile Apps",
    title: "The real app, not a browser tab pretending to be one.",
    body: "FLOW is a real native app on iOS and Android - the Field Tool and Command Center in your pocket, with push notifications the moment something happens.",
    bullets: [
      "Full Field Tool on iOS & Android",
      "Push alerts for payments, signatures, and views",
      "Works offline, syncs automatically",
    ],
    mockup: <MobileAppMockup />,
  },
];

/**
 * `hideWebPricing` is set when this is served to the native iOS shell.
 *
 * The shell loads the live site, so this is the App Store build's launch screen
 * for logged-out users. The web price differs from the App Store price and the
 * pricing page routes to a Stripe purchase, so on iOS the pricing links and the
 * trial-price copy drop out — signing up stays available, and the subscription
 * itself is sold through In-App Purchase on /billing.
 */
export default function MarketingHomepage({
  hideWebPricing = false,
}: {
  hideWebPricing?: boolean;
}) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--fl-ground)] text-[var(--fl-text)]">
      <header className="border-b border-[var(--fl-raised)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/flow-logo-mark.png"
              alt="FLOW"
              className="h-10 w-auto rounded-lg border border-teal-500/30"
            />
            <span className="text-xl font-semibold tracking-tight text-[var(--fl-accent-text)]">FLOW</span>
          </div>

          <nav className="flex items-center gap-2 sm:gap-4">
            {!hideWebPricing && (
              <Link
                href="/pricing"
                className="hidden rounded-xl px-4 py-2 text-sm font-bold text-[var(--fl-muted)] transition hover:text-[var(--fl-text)] sm:block"
              >
                Pricing
              </Link>
            )}
            <Link
              href="/login"
              className="rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)] transition hover:border-[var(--fl-faint)]"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-400"
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
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">
                Home Inspection Software
              </p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-tight text-[var(--fl-text)] md:text-7xl">
                Capture. Organize.
                <br />
                <span className="text-[var(--fl-accent-text)]">Complete.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--fl-muted)]">
                FLOW runs the entire inspection business in one place - booking, AI-assisted
                reporting, agreements, payments, and client/realtor delivery - so nothing falls
                through the cracks between the front door and the final invoice.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="rounded-2xl bg-teal-400 px-7 py-4 text-center text-base font-semibold text-slate-950 transition hover:bg-teal-300 active:scale-[0.98]"
                >
                  Start Free - No Card Required
                </Link>
                {!hideWebPricing && (
                  <Link
                    href="/pricing"
                    className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] px-7 py-4 text-center text-base font-semibold text-[var(--fl-text)] transition hover:border-teal-400 active:scale-[0.98]"
                  >
                    See Pricing
                  </Link>
                )}
              </div>

              <p className="mt-5 text-sm text-[var(--fl-faint)]">
                Your first 3 real inspections are free. No credit card to sign up.
              </p>
            </div>

            <div className="relative">
              <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-6 shadow-2xl shadow-black/40 md:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--fl-accent-text)]">
                  Today
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
                    <p className="text-xs font-bold uppercase text-[var(--fl-accent-text)]">Scheduled</p>
                    <p className="mt-1 text-3xl font-semibold text-[var(--fl-text)]">3</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
                    <p className="text-xs font-bold uppercase text-[var(--fl-muted)]">Unpaid</p>
                    <p className="mt-1 text-3xl font-semibold text-[var(--fl-text)]">$820</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4">
                    <div>
                      <p className="font-bold text-[var(--fl-text)]">711 Sampson Rock Rd</p>
                      <p className="text-xs text-[var(--fl-faint)]">Report published &middot; Payment received</p>
                    </div>
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase text-[var(--fl-good-text)]">
                      Complete
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4">
                    <div>
                      <p className="font-bold text-[var(--fl-text)]">1099 Specks Run Rd</p>
                      <p className="text-xs text-[var(--fl-faint)]">Agreement sent &middot; Awaiting signature</p>
                    </div>
                    <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-[10px] font-semibold uppercase text-[var(--fl-warn-text)]">
                      Pending
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-ground)] p-4">
                    <div>
                      <p className="font-bold text-[var(--fl-text)]">Repair Request</p>
                      <p className="text-xs text-[var(--fl-faint)]">Seller responded &middot; 4 of 5 items agreed</p>
                    </div>
                    <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase text-[var(--fl-info-text)]">
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
          className={`border-t border-[var(--fl-raised)] ${index % 2 === 1 ? "bg-[var(--fl-ground)]" : ""}`}
        >
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
            <div
              className={`grid items-center gap-12 lg:grid-cols-2 ${
                index % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div>
                <SectionEyebrow>{spotlight.eyebrow}</SectionEyebrow>
                <h2 className="mt-4 text-3xl font-semibold leading-tight text-[var(--fl-text)] md:text-4xl">
                  {spotlight.title}
                </h2>
                <p className="mt-5 text-base leading-8 text-[var(--fl-muted)]">{spotlight.body}</p>

                <ul className="mt-6 space-y-3">
                  {spotlight.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-sm text-[var(--fl-muted)]">
                      <span className="mt-0.5 text-[var(--fl-accent-text)]">✓</span>
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

      <section className="border-t border-[var(--fl-raised)] bg-[var(--fl-ground)]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
          <div className="max-w-2xl">
            <SectionEyebrow>Everything In One Place</SectionEyebrow>
            <h2 className="mt-4 text-3xl font-semibold text-[var(--fl-text)] md:text-5xl">
              One system, from first booking to final payment.
            </h2>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {CORE_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 transition hover:-translate-y-0.5 hover:border-teal-500/60"
              >
                <div className="text-3xl">{feature.icon}</div>
                <h3 className="mt-4 text-lg font-semibold text-[var(--fl-text)]">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--fl-raised)]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
          <div className="max-w-2xl">
            <SectionEyebrow>The Complete List</SectionEyebrow>
            <h2 className="mt-4 text-3xl font-semibold text-[var(--fl-text)] md:text-5xl">
              And everything else that keeps the business running.
            </h2>
          </div>

          <div className="mt-12 grid gap-10 md:grid-cols-2 xl:grid-cols-4">
            {MORE_FEATURES.map((group) => (
              <div key={group.category}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fl-accent-text)]">
                  {group.category}
                </h3>
                <div className="mt-4 space-y-5">
                  {group.items.map((item) => (
                    <div key={item.title}>
                      <p className="font-semibold text-[var(--fl-text)]">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--fl-muted)]">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--fl-raised)] bg-[var(--fl-ground)]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
          <SectionEyebrow>How It Works</SectionEyebrow>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold text-[var(--fl-text)] md:text-5xl">
            Three steps, start to close.
          </h2>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.number}>
                <p className="text-5xl font-semibold text-slate-800">{step.number}</p>
                <h3 className="mt-3 text-xl font-semibold text-[var(--fl-text)]">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--fl-muted)]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--fl-raised)]">
        <div className="mx-auto max-w-4xl px-5 py-20 text-center md:px-8">
          <h2 className="text-3xl font-semibold text-[var(--fl-text)] md:text-5xl">
            Run your inspection business on FLOW.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[var(--fl-muted)]">
            Your first 3 inspections are free. No credit card, no setup calls - you&apos;re
            inspecting on FLOW in minutes.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="rounded-2xl bg-teal-400 px-8 py-4 text-base font-semibold text-slate-950 transition hover:bg-teal-300 active:scale-[0.98]"
            >
              Start Free
            </Link>
            {!hideWebPricing && (
              <Link
                href="/pricing"
                className="rounded-2xl border border-[var(--fl-line)] px-8 py-4 text-base font-semibold text-[var(--fl-text)] transition hover:border-teal-400 active:scale-[0.98]"
              >
                View Pricing
              </Link>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--fl-raised)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 text-sm text-[var(--fl-faint)] md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-2">
            <img src="/flow-logo-mark.png" alt="FLOW" className="h-6 w-auto rounded" />
            <span className="font-semibold text-[var(--fl-muted)]">FLOW</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {!hideWebPricing && (
              <Link href="/pricing" className="hover:text-[var(--fl-muted)]">Pricing</Link>
            )}
            <Link href="/login" className="hover:text-[var(--fl-muted)]">Log In</Link>
            <Link href="/signup" className="hover:text-[var(--fl-muted)]">Sign Up</Link>
            <a href="mailto:support@onpointhomeinspect.com" className="hover:text-[var(--fl-muted)]">Support</a>
            <Link href="/terms" className="hover:text-[var(--fl-muted)]">Terms</Link>
            <Link href="/privacy" className="hover:text-[var(--fl-muted)]">Privacy</Link>
          </div>

          <p>&copy; {new Date().getFullYear()} FLOW. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
