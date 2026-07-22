export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <div className="mx-auto max-w-5xl rounded-2xl border border-teal-700/40 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-4xl font-bold text-teal-300 mb-4">
          Privacy Policy
        </h1>

        <p className="text-sm text-slate-400 mb-8">
          Last Updated: June 5, 2026
        </p>

        <div className="space-y-6 text-slate-200 leading-7">
          <p>
            FLOW ("Platform", "we", "our", or "us") provides
            software tools for home inspectors and inspection companies to
            manage inspections, reports, agreements, payments, scheduling,
            communications, photos, analytics, and related business operations.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            1. Information We Collect
          </h2>

          <ul className="list-disc pl-6 space-y-2">
            <li>Account information</li>
            <li>Inspection information</li>
            <li>Property information</li>
            <li>Client and agent contact information</li>
            <li>Inspection photos and documents</li>
            <li>Agreement signatures</li>
            <li>Invoice and payment status information</li>
            <li>Email delivery and communication logs</li>
            <li>Analytics and usage information</li>
            <li>Device and browser information</li>
          </ul>

          <h2 className="text-xl font-bold text-teal-300">
            2. How We Use Information
          </h2>

          <p>
            Information may be used to operate and improve the Platform,
            generate reports, deliver agreements, process payments, manage
            scheduling, generate analytics, provide support, and comply with
            legal obligations.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            3. Payment Processing
          </h2>

          <p>
            Payments are processed through Stripe. We do not store full payment
            card information.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            4. Data Sharing
          </h2>

          <p>
            We do not sell personal information. Information may only be shared
            with authorized users, service providers, payment processors, email
            providers, or legal authorities when required by law.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            5. Data Security
          </h2>

          <p>
            We implement reasonable technical and administrative safeguards to
            protect information. However, no system can guarantee absolute
            security.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            6. Account Privacy
          </h2>

          <p>
            The Platform is designed so that each inspector or company accesses
            only its own inspections, reports, contacts, agreements, payments,
            and related records.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            7. Data Retention
          </h2>

          <p>
            Information may be retained as necessary to provide services,
            maintain records, resolve disputes, enforce agreements, and comply
            with legal obligations.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            8. Account Deletion
          </h2>

          <p>
            Users may request account deletion through the Platform. Certain
            records may be retained where required by law, tax regulations,
            fraud prevention, payment processing requirements, or dispute
            resolution obligations.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            9. Third-Party Services
          </h2>

          <p>
            The Platform may utilize Stripe, cloud hosting providers, email
            delivery services, analytics providers, mapping services, and AI
            providers. We are not responsible for the privacy practices of
            third-party services.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            10. Children
          </h2>

          <p>
            The Platform is not intended for children under 13 years of age.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            11. Changes
          </h2>

          <p>
            We may modify this Privacy Policy at any time. Continued use of the
            Platform constitutes acceptance of any updates.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            12. Contact
          </h2>

          <p>
            On Point Home Inspections LLC
            <br />
            support@onpointhomeinspect.com
            <br />
            onpointhomeinspect.com
          </p>
        </div>
      </div>
    </main>
  );
}