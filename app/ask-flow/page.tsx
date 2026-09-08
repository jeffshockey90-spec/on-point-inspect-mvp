import AskFlow from "../../components/AskFlow";

export const dynamic = "force-dynamic";

export default function AskFlowPage() {
  return (
    <main className="min-h-screen bg-[var(--fl-ground)] px-3 py-6 text-[var(--fl-text)] md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--fl-accent-text)]">Ask FLOW</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Your back-office assistant</h1>
          <p className="mt-2 max-w-2xl text-[var(--fl-muted)]">
            Ask anything about your inspections, payments, agreements, schedule, or findings — in plain English.
          </p>
        </div>
        <AskFlow />
      </div>
    </main>
  );
}
