// Maryland-only report disclosure (Md. Bus. Occ. & Prof. § 16-4A-01(a)(4)):
// the four required statements in 14-point bold, plus the inspector's Maryland
// license. Renders nothing for other states. Text lives in
// lib/report/marylandDisclosure (verbatim).

import {
  MD_DISCLOSURE_FONT_SIZE,
  MD_REPORT_DISCLOSURE_STATEMENTS,
  marylandLicenseFor,
  needsMarylandDisclosure,
} from "../lib/report/marylandDisclosure";

const bold14 = { fontSize: MD_DISCLOSURE_FONT_SIZE, fontWeight: 700, lineHeight: 1.35 } as const;

export default function MarylandReportDisclosure({
  inspection,
  company,
  fallbackLicense,
  className = "",
  tone = "theme",
}: {
  inspection: Record<string, any> | null | undefined;
  company?: Record<string, any> | null;
  fallbackLicense?: string | null;
  className?: string;
  /** "print" = black on white for the printable report; "theme" follows the app theme. */
  tone?: "theme" | "print";
}) {
  if (!needsMarylandDisclosure(inspection)) return null;
  const license = marylandLicenseFor(company, fallbackLicense);
  return (
    <section
      aria-label="Maryland home inspection disclosure"
      className={`md-disclosure break-inside-avoid rounded-2xl border-2 p-6 ${
        tone === "print"
          ? "border-slate-900 bg-white text-slate-950"
          : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] text-[var(--fl-text)]"
      } ${className}`}
    >
      <p style={bold14} className="mb-3 uppercase">
        Maryland Home Inspection Disclosure
      </p>
      <ol className="space-y-3">
        {MD_REPORT_DISCLOSURE_STATEMENTS.map((text, i) => (
          <li key={i} style={bold14}>
            {i + 1}. {text}
          </li>
        ))}
      </ol>
      {license && (
        <p style={bold14} className="mt-4">
          Maryland Home Inspector License No.: {license}
        </p>
      )}
    </section>
  );
}
