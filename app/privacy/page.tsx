export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#020617] px-4 py-10 text-white md:px-8">
      <article className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-[#0b1220] p-6 shadow-2xl md:p-10">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-teal-300">
          On Point Inspect
        </p>

        <h1 className="mt-4 text-3xl font-black md:text-5xl">
          Privacy Policy
        </h1>

        <p className="mt-3 text-sm text-slate-400">
          Last updated: June 2026
        </p>

        <div className="mt-8 space-y-6 leading-7 text-slate-300">
          <section>
            <h2 className="text-2xl font-black text-white">Overview</h2>
            <p className="mt-3">
              On Point Inspect is an inspection management platform used to create
              inspections, reports, photos, agreements, invoices, payments, client
              portals, repair requests, analytics, and related communication records.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">Information We Collect</h2>
            <p className="mt-3">
              We may collect account information, company profile information,
              inspection details, property information, client and realtor contact
              information, uploaded photos or videos, report content, agreement
              signatures, payment status, email delivery events, page view events,
              and technical information such as browser type, device information,
              IP address, and usage logs.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">How Information Is Used</h2>
            <p className="mt-3">
              Information is used to operate the app, generate and deliver reports,
              manage agreements, process payments, track report engagement, provide
              analytics, support inspectors and clients, improve reliability, and
              protect against unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">Payments</h2>
            <p className="mt-3">
              Payments are processed through Stripe. On Point Inspect does not store
              full card numbers. Stripe may collect and process payment and identity
              information according to Stripe's own policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">Data Sharing</h2>
            <p className="mt-3">
              Inspection data may be shared with authorized inspectors, clients,
              agents, transaction coordinators, and other users associated with a
              specific inspection or company account. We may also use service
              providers such as Supabase, Stripe, Resend, Vercel, and AI providers
              to operate the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">Security</h2>
            <p className="mt-3">
              The platform uses authentication, company isolation, role-based access
              controls, private storage, and signed image URLs to help protect data.
              No system can guarantee absolute security, but reasonable safeguards
              are used to reduce risk.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-black text-white">Contact</h2>
            <p className="mt-3">
              Questions about this policy may be sent to On Point Home Inspections
              through the contact information provided by the company using the app.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
