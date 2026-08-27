import Link from "next/link";

type PageProps = {
  searchParams: Promise<{ inspection_id?: string; portal_token?: string }>;
};

export default async function PaymentCancelledPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const inspectionId = params.inspection_id || "";
  // Prefer the unguessable share token so the anonymous client returns to a
  // token portal link (raw-id portal access now requires a session).
  const portalTarget = params.portal_token || inspectionId;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0e13] p-6 text-white">
      <section className="w-full max-w-2xl rounded-2xl border border-[#1a212c] bg-[#10151e] p-8 shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[#14c8d2]">
          FLOW
        </p>

        <h1 className="mt-4 text-4xl font-semibold text-white">
          Payment Cancelled
        </h1>

        <p className="mt-4 text-lg leading-8 text-[#8a93a3]">
          The payment was cancelled or not completed. No payment has been marked
          as received.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {portalTarget && (
            <Link
              href={`/client-portal/${portalTarget}`}
              className="rounded-xl bg-teal-500 px-6 py-3 font-semibold text-slate-950 hover:bg-teal-400"
            >
              Return to Client Portal
            </Link>
          )}

          <Link
            href="/dashboard"
            className="rounded-xl border border-[#232b38] px-6 py-3 font-bold text-[#e8ecf3] hover:bg-[#1a212c]"
          >
            Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
