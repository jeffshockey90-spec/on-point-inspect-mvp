"use client";

import Link from "next/link";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0e13] px-4 py-10 text-white">
      <section className="w-full max-w-2xl rounded-2xl border border-red-500/40 bg-[#10151e] p-6 shadow-2xl md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#14c8d2]">
          FLOW
        </p>

        <h1 className="mt-4 text-3xl font-semibold md:text-5xl">
          Something went wrong
        </h1>

        <p className="mt-4 leading-7 text-[#8a93a3]">
          The app hit an unexpected error. Your reports, photos, agreements, and
          inspection data are not deleted. Try again, or return to the dashboard.
        </p>

        {error?.digest && (
          <p className="mt-4 break-all rounded-xl border border-[#232b38] bg-[#0a0e13] p-3 text-xs text-[#59626f]">
            Error ID: {error.digest}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 hover:bg-teal-400 sm:w-auto"
          >
            Try Again
          </button>

          <Link
            href="/dashboard"
            className="w-full rounded-xl border border-[#232b38] px-5 py-3 text-center font-semibold text-white hover:bg-[#1a212c] sm:w-auto"
          >
            Back to Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
