import Link from "next/link";

type PageProps = {
  searchParams: Promise<{ inspection_id?: string }>;
};

export default async function PaymentCancelledPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const inspectionId = params.inspection_id || "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#020617] p-6 text-white">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-[#0f172a] p-8 shadow-xl">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-orange-300">
          On Point Inspect
        </p>

        <h1 className="mt-4 text-4xl font-black text-white">
          Payment Cancelled
        </h1>

        <p className="mt-4 text-lg leading-8 text-slate-300">
          The payment was cancelled or not completed. No payment has been marked
          as received.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {inspectionId && (
            <Link
              href={`/client-portal/${inspectionId}`}
              className="rounded-xl bg-teal-500 px-6 py-3 font-black text-slate-950 hover:bg-teal-400"
            >
              Return to Client Portal
            </Link>
          )}

          <Link
            href="/dashboard"
            className="rounded-xl border border-slate-700 px-6 py-3 font-bold text-slate-200 hover:bg-slate-800"
          >
            Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
