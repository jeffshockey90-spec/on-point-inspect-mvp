export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#0a0e13] text-[#e8ecf3] px-6 py-10">
      <div className="mx-auto max-w-5xl rounded-2xl border border-teal-700/40 bg-[#131923] p-8 shadow-xl">
        <h1 className="text-4xl font-bold text-teal-300 mb-4">
          Privacy Policy
        </h1>

        <p className="text-sm text-[#8a93a3] mb-8">
          Last Updated: August 7, 2026
        </p>

        <div className="space-y-6 text-[#e8ecf3] leading-7">
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
            5. SMS / Text Message Communications
          </h2>

          <p>
            With your consent, On Point Home Inspections LLC may send you
            SMS/text messages related to your inspection — such as appointment
            confirmations and reminders, report delivery notifications,
            invoices and payment links, and review requests. Consent is
            collected when you check the messaging-consent box on our online
            scheduling form, or when you verbally provide your number and agree
            to be contacted by text. Consenting to text messages is never a
            condition of purchase.
          </p>

          <p>
            Message frequency varies. Message and data rates may apply. You can
            reply <strong>STOP</strong> at any time to opt out of text messages,
            or reply <strong>HELP</strong> for assistance. Opting out of SMS will
            not affect your ability to receive your inspection report or
            communicate with us by other means.
          </p>

          <p>
            <strong>
              We do not sell, rent, or share your mobile phone number, or your
              SMS opt-in or consent information, with any third parties or
              affiliates for their own marketing or promotional purposes.
            </strong>{" "}
            Mobile numbers are used solely to deliver the inspection-related
            messages described above.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            6. Data Security
          </h2>

          <p>
            We implement reasonable technical and administrative safeguards to
            protect information. However, no system can guarantee absolute
            security.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            7. Account Privacy
          </h2>

          <p>
            The Platform is designed so that each inspector or company accesses
            only its own inspections, reports, contacts, agreements, payments,
            and related records.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            8. Data Retention
          </h2>

          <p>
            Information may be retained as necessary to provide services,
            maintain records, resolve disputes, enforce agreements, and comply
            with legal obligations.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            9. Account Deletion
          </h2>

          <p>
            Users may request account deletion through the Platform. Certain
            records may be retained where required by law, tax regulations,
            fraud prevention, payment processing requirements, or dispute
            resolution obligations.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            10. Third-Party Services
          </h2>

          <p>
            The Platform may utilize Stripe, cloud hosting providers, email
            delivery services, analytics providers, mapping services, and AI
            providers. We are not responsible for the privacy practices of
            third-party services.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            11. Children
          </h2>

          <p>
            The Platform is not intended for children under 13 years of age.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            12. Changes
          </h2>

          <p>
            We may modify this Privacy Policy at any time. Continued use of the
            Platform constitutes acceptance of any updates.
          </p>

          <h2 className="text-xl font-bold text-teal-300">
            13. Contact
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