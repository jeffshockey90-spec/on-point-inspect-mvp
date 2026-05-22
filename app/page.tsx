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
    title: "AI Capture",
    description: "Create findings from photos.",
    href: "/ai-capture",
    icon: "🤖",
  },
  {
    title: "Field Tool",
    description: "Mobile AI inspection workflow.",
    href: "/field",
    icon: "📱",
  },
  {
    title: "Templates",
    description: "Manage templates.",
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

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-8">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.4em] text-teal-400">
            On Point Home Inspections
          </p>

          <h1 className="text-5xl font-extrabold">
            Inspection Dashboard
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
            Manage inspections, reports, AI findings,
            templates, quotes, and scheduling from one clean
            dashboard.
          </p>
        </section>

        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 transition hover:border-teal-500"
            >
              <div className="mb-5 text-4xl">
                {card.icon}
              </div>

              <h2 className="text-2xl font-bold text-white">
                {card.title}
              </h2>

              <p className="mt-3 text-slate-400">
                {card.description}
              </p>

              <p className="mt-5 font-bold text-teal-400">
                Open →
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}