import Link from "next/link";

const cards = [
  {
    title: "New Inspection",
    description: "Start a new inspection.",
    href: "/new",
    icon: "🏠",
  },
  {
    title: "Reports",
    description: "View and edit reports.",
    href: "/reports",
    icon: "📋",
  },
  {
    title: "Analytics",
    description: "Track revenue, inspections, payments, agreements, and reports.",
    href: "/analytics",
    icon: "📊",
  },
  {
    title: "Realtors",
    description: "Manage realtor contacts, referrals, and revenue.",
    href: "/realtors",
    icon: "🏡",
  },
  {
    title: "Invoices",
    description: "Track paid, pending, overdue, and outstanding balances.",
    href: "/invoices",
    icon: "💰",
  },
  {
    title: "Agreements",
    description: "Manage agreement templates, sending, and signed status.",
    href: "/agreements",
    icon: "📝",
  },
  {
    title: "Client Portal",
    description: "Open client-facing portals, report access, payments, and delivery.",
    href: "/client-portal",
    icon: "🔐",
  },
  {
    title: "Repair Requests",
    description: "Build repair requests, negotiation addendums, and seller responses.",
    href: "/repair-request",
    icon: "🛠️",
  },
  {
    title: "Radon",
    description: "Manage radon tests, readings, devices, and results.",
    href: "/radon",
    icon: "☢️",
  },
  {
    title: "Mold",
    description: "Track mold samples, lab reports, results, and summaries.",
    href: "/mold",
    icon: "🧫",
  },
  {
    title: "AI Capture",
    description: "Create findings from photos.",
    href: "/ai-capture",
    icon: "🤖",
  },
  {
    title: "Equipment Analyzer",
    description: "Read data plates and document equipment inventory.",
    href: "/equipment-analyzer",
    icon: "🔎",
  },
  {
    title: "Field Tool",
    description: "Mobile AI inspection workflow.",
    href: "/field",
    icon: "📱",
  },
  {
    title: "Templates",
    description: "Manage favorite findings, templates, and reusable language.",
    href: "/templates",
    icon: "🧩",
  },
  {
    title: "Quotes",
    description: "Calculate pricing.",
    href: "/quotes",
    icon: "💲",
  },
  {
    title: "Schedule",
    description: "View inspection schedule.",
    href: "/schedule",
    icon: "🗓️",
  },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="mb-8 rounded-2xl border border-slate-700 bg-[#0f172a] p-6 shadow-xl">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-teal-300">
            On Point Home Inspections
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Inspection Dashboard
          </h1>

          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            Manage inspections, reports, AI findings, analytics, invoices, realtor contacts,
            agreements, client portals, radon, mold, templates, quotes, and scheduling from
            one clean dashboard.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-2xl border border-slate-700 bg-[#0f172a] p-5 shadow-lg transition hover:-translate-y-0.5 hover:border-teal-400/70 hover:bg-[#13213a]"
            >
              <div className="text-3xl">{card.icon}</div>

              <h2 className="mt-4 text-xl font-black text-white group-hover:text-teal-300">
                {card.title}
              </h2>

              <p className="mt-2 min-h-[44px] text-sm leading-5 text-slate-400">
                {card.description}
              </p>

              <p className="mt-4 text-sm font-black text-teal-300">
                Open →
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
