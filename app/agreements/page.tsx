import Link from "next/link";
import AgreementLibraryManager from "./AgreementLibraryManager";

export default function AgreementsPage() {
  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <div className="mx-auto max-w-[96rem]">
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#0b1220] p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#14c8d2]">
              FLOW
            </p>

            <h1 className="mt-3 text-4xl font-extrabold">
              Agreement Library
            </h1>

            <p className="mt-2 text-slate-400">
              Create, edit, and manage custom agreement templates for any state.
              Each inspector can save their own titles, agreement text, defaults,
              service types, and state-specific templates.
            </p>
          </div>

          <Link
            href="/agreements/status"
            className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-teal-500/70 bg-teal-500/10 px-5 py-3 text-sm font-black text-teal-300 transition hover:bg-teal-500 hover:text-slate-950"
          >
            Signing Status
          </Link>
        </div>

        <AgreementLibraryManager />
      </div>
    </main>
  );
}
