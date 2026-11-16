import Link from "next/link";

// "Templates" in the main nav used to land on a placeholder that only said
// "open a report". It's now a small hub pointing at the template tools that
// already exist.
const TEMPLATE_TOOLS = [
  {
    title: "Report section templates",
    description:
      "Choose which sections a report starts with for each service (e.g. add a Shed or Pool section), and reorder them.",
    href: "/settings/report-templates",
    cta: "Manage report templates",
  },
  {
    title: "Agreement templates",
    description: "Your inspection agreements by state and service, including General / Any State.",
    href: "/agreements",
    cta: "Open agreement library",
  },
  {
    title: "AI writing style",
    description: "Teach the AI your wording so findings from the camera and field tool sound like you.",
    href: "/settings/ai-writing-studio",
    cta: "Open writing studio",
  },
  {
    title: "Finding templates",
    description:
      "Favorite findings and AI-generated templates are inserted from inside a report, right where you're writing.",
    href: "/reports",
    cta: "Open reports",
  },
];

export default function TemplatesPage() {
  return (
    <main className="min-h-screen bg-[var(--fl-surface-2)] px-4 py-10 text-[var(--fl-text)] sm:px-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-3 text-4xl font-bold text-[var(--fl-info-text)] sm:text-5xl">Templates</h1>
        <p className="mb-8 text-[var(--fl-muted)]">
          Everything you set up once and reuse on every inspection.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {TEMPLATE_TOOLS.map((tool) => (
            <div
              key={tool.href}
              className="flex flex-col rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-lg"
            >
              <h2 className="text-xl font-semibold text-[var(--fl-text)]">{tool.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-[var(--fl-muted)]">{tool.description}</p>
              <Link
                href={tool.href}
                className="mt-5 inline-flex w-fit rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-black hover:bg-cyan-400"
              >
                {tool.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
