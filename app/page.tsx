"use client";

import Link from "next/link";

export default function HomePage() {
  const cards = [
    {
      title: "New Inspection",
      description: "Create a new inspection with address autofill.",
      href: "/inspections/new",
    },
    {
      title: "AI Capture",
      description: "Analyze inspection photos with AI.",
      href: "/report-builder",
    },
    {
      title: "Reports",
      description: "View and generate inspection reports.",
      href: "/reports",
    },
    {
      title: "Templates",
      description: "Manage reusable inspection templates.",
      href: "/templates",
    },
    {
      title: "Quote Calculator",
      description: "Generate inspection pricing quotes.",
      href: "/quotes",
    },
  ];

  return (
    <main className="min-h-screen bg-black text-white p-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <h1 className="text-5xl font-bold text-teal-400">
            On Point Inspection Dashboard
          </h1>

          <p className="text-zinc-400 mt-3 text-lg">
            Manage inspections, reports, AI tools, templates, and quotes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {cards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="rounded-2xl border border-zinc-800 bg-[#050816] hover:border-teal-400 transition-all duration-300 p-6"
            >
              <h2 className="text-2xl font-bold text-teal-400 mb-3">
                {card.title}
              </h2>

              <p className="text-zinc-400">{card.description}</p>

              <div className="mt-6 inline-flex items-center text-teal-300 font-semibold">
                Open →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}