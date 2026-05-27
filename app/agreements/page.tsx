import AgreementLibraryManager from "./AgreementLibraryManager";

export default function AgreementsPage() {
  return (
    <main className="min-h-screen bg-[#020617] p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-2xl border border-slate-800 bg-[#0b1220] p-6">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-teal-400">
            On Point Inspect
          </p>

          <h1 className="mt-3 text-4xl font-extrabold">
            Agreement Library
          </h1>

          <p className="mt-2 text-slate-400">
            View, edit, add, and manage MD, WV, and PA agreement templates.
          </p>
        </div>

        <AgreementLibraryManager />
      </div>
    </main>
  );
}
