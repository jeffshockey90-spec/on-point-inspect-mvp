import Link from "next/link";

export default function TemplatesPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-3 text-5xl font-bold text-cyan-400">
          Finding Templates
        </h1>

        <p className="mb-10 text-gray-400">
          Manage reusable inspection findings, favorite comments, and AI-generated templates.
        </p>

        <div className="rounded-2xl border border-[#1a212c] bg-[#111827] p-6 shadow-lg">
          <p className="mb-6 text-lg leading-8 text-gray-200">
            Open a report to insert favorite findings or manage report-specific templates.
          </p>

          <Link
            href="/reports"
            className="inline-flex rounded-xl bg-cyan-500 px-6 py-3 font-bold text-black hover:bg-cyan-400"
          >
            Open Reports
          </Link>
        </div>
      </div>
    </main>
  );
}