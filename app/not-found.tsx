import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--fl-ground)] px-4 py-10 text-[var(--fl-text)]">
      <section className="w-full max-w-2xl rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-6 shadow-2xl md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">
          FLOW
        </p>

        <h1 className="mt-4 text-3xl font-semibold md:text-5xl">
          Page not found
        </h1>

        <p className="mt-4 leading-7 text-[var(--fl-muted)]">
          This page may have moved, expired, or the inspection link may be incorrect.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="w-full rounded-xl bg-teal-500 px-5 py-3 text-center font-semibold text-slate-950 hover:bg-teal-400 sm:w-auto"
          >
            Back to Dashboard
          </Link>

          <Link
            href="/reports"
            className="w-full rounded-xl border border-[var(--fl-line)] px-5 py-3 text-center font-semibold text-[var(--fl-text)] hover:bg-[var(--fl-raised)] sm:w-auto"
          >
            View Reports
          </Link>
        </div>
      </section>
    </main>
  );
}
