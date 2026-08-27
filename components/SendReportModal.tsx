"use client";

import { useState } from "react";

export default function SendReportModal({
  inspectionId,
  clientName,
  clientEmail,
  realtorName,
  realtorEmail,
  propertyAddress,
}: {
  inspectionId: string;
  clientName?: string;
  clientEmail?: string;
  realtorName?: string;
  realtorEmail?: string;
  propertyAddress?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");

  const shareLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${inspectionId}`
      : "";

  const summaryLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/reports/${inspectionId}/summary`
      : "";

  const clientSubject = `Home Inspection Report - ${
    propertyAddress || "Property"
  }`;

  const clientBody = `Hi ${clientName || ""},

Your home inspection report is ready for review.

You can view the full report here:
${shareLink}

Please review the full report in its entirety, including all photos, observations, implications, recommendations, and limitations.

Thank you,

Jeff Shockey
On Point Home Inspections LLC
240-527-7172`;

  const realtorSubject = `Inspection Summary - ${
    propertyAddress || "Property"
  }`;

  const realtorBody = `Hi ${realtorName || ""},

The inspection report is ready for review.

Full report:
${shareLink}

Realtor summary:
${summaryLink}

Please note the summary is only a quick-reference overview and does not replace reviewing the full inspection report.

Thank you,

Jeff Shockey
On Point Home Inspections LLC
240-527-7172`;

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  }

  function openMail(to: string | undefined, subject: string, body: string) {
    const mailto = `mailto:${to || ""}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-purple-500 px-5 py-3 font-bold text-purple-300 transition hover:bg-purple-500 hover:text-black print:hidden"
      >
        Send Report
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 print:hidden">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#232b38] bg-[#111827] p-6 shadow-2xl">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-teal-400">
                  Send Report
                </h2>

                <p className="mt-2 text-[#8a93a3]">
                  Copy or open pre-written delivery emails for the client and
                  realtor.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-[#232b38] px-4 py-2 font-bold text-white hover:bg-[#1a212c]"
              >
                Close
              </button>
            </div>

            <section className="rounded-2xl border border-[#232b38] bg-[#0f172a] p-5">
              <h3 className="text-xl font-bold text-white">Share Links</h3>

              <div className="mt-4 space-y-4">
                <LinkBox
                  label="Full Client Report"
                  value={shareLink}
                  copied={copied === "share"}
                  onCopy={() => copyText("share", shareLink)}
                />

                <LinkBox
                  label="Realtor Summary"
                  value={summaryLink}
                  copied={copied === "summary"}
                  onCopy={() => copyText("summary", summaryLink)}
                />
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-[#232b38] bg-[#0f172a] p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-white">
                  Client Email
                </h3>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      copyText(
                        "client",
                        `Subject: ${clientSubject}\n\n${clientBody}`
                      )
                    }
                    className="rounded-xl border border-blue-500 px-4 py-2 font-bold text-blue-300 hover:bg-blue-500 hover:text-black"
                  >
                    {copied === "client" ? "Copied!" : "Copy Email"}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      openMail(clientEmail, clientSubject, clientBody)
                    }
                    className="rounded-xl bg-teal-500 px-4 py-2 font-bold text-black hover:bg-teal-400"
                  >
                    Open Email
                  </button>
                </div>
              </div>

              <p className="mb-2 text-sm font-bold uppercase tracking-wide text-[#8a93a3]">
                To: {clientEmail || "No client email saved"}
              </p>

              <p className="mb-3 text-sm font-bold text-[#8a93a3]">
                Subject: {clientSubject}
              </p>

              <pre className="whitespace-pre-wrap rounded-xl border border-[#232b38] bg-black p-4 leading-7 text-[#8a93a3]">
                {clientBody}
              </pre>
            </section>

            <section className="mt-6 rounded-2xl border border-[#232b38] bg-[#0f172a] p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-white">
                  Realtor Email
                </h3>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      copyText(
                        "realtor",
                        `Subject: ${realtorSubject}\n\n${realtorBody}`
                      )
                    }
                    className="rounded-xl border border-blue-500 px-4 py-2 font-bold text-blue-300 hover:bg-blue-500 hover:text-black"
                  >
                    {copied === "realtor" ? "Copied!" : "Copy Email"}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      openMail(realtorEmail, realtorSubject, realtorBody)
                    }
                    className="rounded-xl bg-teal-500 px-4 py-2 font-bold text-black hover:bg-teal-400"
                  >
                    Open Email
                  </button>
                </div>
              </div>

              <p className="mb-2 text-sm font-bold uppercase tracking-wide text-[#8a93a3]">
                To: {realtorEmail || "No realtor email saved"}
              </p>

              <p className="mb-3 text-sm font-bold text-[#8a93a3]">
                Subject: {realtorSubject}
              </p>

              <pre className="whitespace-pre-wrap rounded-xl border border-[#232b38] bg-black p-4 leading-7 text-[#8a93a3]">
                {realtorBody}
              </pre>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function LinkBox({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#232b38] bg-black p-4">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-[#8a93a3]">
        {label}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <code className="flex-1 break-all text-sm text-[#8a93a3]">
          {value}
        </code>

        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg border border-blue-500 px-3 py-2 text-sm font-bold text-blue-300 hover:bg-blue-500 hover:text-black"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}