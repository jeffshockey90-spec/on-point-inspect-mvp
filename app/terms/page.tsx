export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-[#020617] px-4 py-10 text-white md:px-8">
      <article className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-[#0b1220] p-6 shadow-2xl md:p-10">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-teal-300">
          On Point Inspect
        </p>

        <h1 className="mt-4 text-3xl font-black md:text-5xl">
          Terms of Service
        </h1>

        <p className="mt-3 text-sm text-slate-400">
          Last updated: June 2026
        </p>

        <div className="mt-8 space-y-6 leading-7 text-slate-300">
          <section>
            <h2 className="text-2xl font-black text-white">Use of the Platform</h2>
            <p className="mt-3">
              On Point Inspect provides tools for inspection businesses to manage
              inspections, reports, agreements, photos, invoices, payments, client
              portals, repair requests, analytics, and related workflows. Users are
              responsible for using the platform lawfully and professionally.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">Inspection Content</h2>
            <p className="mt-3">
              Inspectors are responsible for the accuracy, completeness, legality,
              and professional suitability of reports, agreements, disclaimers,
              findings, photos, recommendations, and communications created or sent
              through the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">AI Tools</h2>
            <p className="mt-3">
              AI-generated content is provided as drafting assistance only. Users
              must review, edit, verify, and approve all AI-generated findings,
              summaries, limitations, disclaimers, equipment details, or other
              content before relying on it or sharing it with others.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">Payments</h2>
            <p className="mt-3">
              Payment processing may be provided through Stripe. Inspectors are
              responsible for their pricing, taxes, refunds, disputes, and compliance
              with applicable payment rules. Online processing fees may apply where
              enabled.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">Availability</h2>
            <p className="mt-3">
              The platform may occasionally be unavailable due to maintenance,
              provider outages, updates, or technical issues. Users should maintain
              appropriate backups and professional records for business continuity.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">Limitation of Liability</h2>
            <p className="mt-3">
              To the fullest extent permitted by law, On Point Inspect is provided
              without warranties of uninterrupted operation or error-free performance.
              Users remain responsible for professional judgment and final inspection
              deliverables.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">Changes</h2>
            <p className="mt-3">
              These terms may be updated as the platform evolves. Continued use of
              the platform after updates means the user accepts the revised terms.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
