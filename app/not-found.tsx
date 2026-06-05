import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#020617] px-4 py-10 text-white">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-[#0b1220] p-6 shadow-2xl md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-teal-300">
          On Point Inspect
        </p>

        <h1 className="mt-4 text-3xl font-black md:text-5xl">
          Page not found
        </h1>

        <p className="mt-4 leading-7 text-slate-300">
          This page may have moved, expired, or the inspection link may be incorrect.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="w-full rounded-xl bg-teal-500 px-5 py-3 text-center font-black text-slate-950 hover:bg-teal-400 sm:w-auto"
          >
            Back to Dashboard
          </Link>

          <Link
            href="/reports"
            className="w-full rounded-xl border border-slate-600 px-5 py-3 text-center font-black text-white hover:bg-slate-800 sm:w-auto"
          >
            View Reports
          </Link>
        </div>
      </section>
    </main>
  );
}
