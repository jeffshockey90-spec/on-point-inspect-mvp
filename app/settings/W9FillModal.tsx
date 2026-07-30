"use client";

import { useState } from "react";

type Classification = "individual" | "c_corp" | "s_corp" | "partnership" | "trust" | "llc" | "other";

const CLASSIFICATION_OPTIONS: { value: Classification; label: string }[] = [
  { value: "individual", label: "Individual / sole proprietor" },
  { value: "c_corp", label: "C Corporation" },
  { value: "s_corp", label: "S Corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "trust", label: "Trust / estate" },
  { value: "llc", label: "LLC" },
  { value: "other", label: "Other" },
];

function inputClass() {
  return "w-full rounded-xl border border-slate-700 bg-black px-4 py-2.5 text-sm text-white outline-none focus:border-teal-400";
}

export default function W9FillModal({ onSaved }: { onSaved: (result: { path: string; uploadedAt: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [viewUrl, setViewUrl] = useState("");

  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [classification, setClassification] = useState<Classification>("individual");
  const [llcTaxClass, setLlcTaxClass] = useState("");
  const [otherDescription, setOtherDescription] = useState("");
  const [address, setAddress] = useState("");
  const [cityStateZip, setCityStateZip] = useState("");
  const [accountNumbers, setAccountNumbers] = useState("");
  const [tinType, setTinType] = useState<"ssn" | "ein">("ein");
  const [ssn, setSsn] = useState("");
  const [ein, setEin] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [certifyAccuracy, setCertifyAccuracy] = useState(false);

  function reset() {
    setError("");
    setViewUrl("");
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    reset();
  }

  async function submit() {
    if (submitting) return;

    setSubmitting(true);
    setError("");
    setViewUrl("");

    try {
      const res = await fetch("/api/company/w9/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          businessName,
          classification,
          llcTaxClass,
          otherDescription,
          address,
          cityStateZip,
          accountNumbers,
          tinType,
          ssn,
          ein,
          signatureName,
          certifyAccuracy,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Could not generate W9.");

      setViewUrl(data.viewUrl || "");
      onSaved({ path: data.path, uploadedAt: data.uploadedAt });

      // Clear the sensitive fields immediately - no reason to keep a typed
      // SSN/EIN sitting in page memory once the PDF has been generated.
      setSsn("");
      setEin("");
    } catch (err: any) {
      setError(err?.message || "Could not generate W9.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-teal-500 px-5 py-3 text-sm font-black text-teal-300 transition hover:bg-teal-500/10"
      >
        Fill Out W9 In-App
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-teal-500/40 bg-[#0f172a] p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-white">Fill Out W9</h2>
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="rounded-lg border border-slate-700 px-3 py-1 text-sm font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-400">
              This fills the real IRS Form W-9. Your SSN/EIN is only used to generate the PDF -
              it is never stored anywhere else in the app.
            </p>

            {viewUrl ? (
              <div className="mt-5 rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4">
                <p className="text-sm font-bold text-emerald-200">W9 generated and saved.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <a
                    href={viewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-teal-400"
                  >
                    View / Download PDF
                  </a>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {error && (
                  <p className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-xs font-bold text-red-300">
                    {error}
                  </p>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                    Line 1 · Name (as shown on your tax return)
                  </span>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass()} />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                    Line 2 · Business name (if different, optional)
                  </span>
                  <input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className={inputClass()}
                  />
                </label>

                <div>
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                    Line 3a · Federal tax classification
                  </span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {CLASSIFICATION_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                          classification === option.value
                            ? "border-teal-400 bg-teal-500/15 text-teal-200"
                            : "border-slate-700 text-slate-400 hover:border-teal-500/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="classification"
                          checked={classification === option.value}
                          onChange={() => setClassification(option.value)}
                          className="accent-teal-400"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>

                {classification === "llc" && (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                      LLC tax classification (C, S, or P)
                    </span>
                    <input
                      value={llcTaxClass}
                      onChange={(e) => setLlcTaxClass(e.target.value.toUpperCase().slice(0, 1))}
                      maxLength={1}
                      placeholder="C, S, or P"
                      className={`${inputClass()} max-w-[100px]`}
                    />
                  </label>
                )}

                {classification === "other" && (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                      Describe entity type
                    </span>
                    <input
                      value={otherDescription}
                      onChange={(e) => setOtherDescription(e.target.value)}
                      className={inputClass()}
                    />
                  </label>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                    Line 5 · Address (number, street, apt/suite)
                  </span>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass()} />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                    Line 6 · City, state, ZIP
                  </span>
                  <input
                    value={cityStateZip}
                    onChange={(e) => setCityStateZip(e.target.value)}
                    className={inputClass()}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                    Line 7 · Account number(s) (optional)
                  </span>
                  <input
                    value={accountNumbers}
                    onChange={(e) => setAccountNumbers(e.target.value)}
                    className={inputClass()}
                  />
                </label>

                <div>
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                    Part I · Taxpayer Identification Number
                  </span>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
                      <input
                        type="radio"
                        checked={tinType === "ein"}
                        onChange={() => setTinType("ein")}
                        className="accent-teal-400"
                      />
                      EIN
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
                      <input
                        type="radio"
                        checked={tinType === "ssn"}
                        onChange={() => setTinType("ssn")}
                        className="accent-teal-400"
                      />
                      SSN
                    </label>
                  </div>

                  {tinType === "ein" ? (
                    <input
                      value={ein}
                      onChange={(e) => setEin(e.target.value.replace(/\D/g, "").slice(0, 9))}
                      placeholder="XX-XXXXXXX"
                      autoComplete="off"
                      className={`${inputClass()} mt-2 max-w-[220px]`}
                    />
                  ) : (
                    <input
                      value={ssn}
                      onChange={(e) => setSsn(e.target.value.replace(/\D/g, "").slice(0, 9))}
                      placeholder="XXX-XX-XXXX"
                      autoComplete="off"
                      type="password"
                      className={`${inputClass()} mt-2 max-w-[220px]`}
                    />
                  )}
                  <p className="mt-1.5 text-xs text-slate-500">Never stored - only used to generate this PDF.</p>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-400">
                    Part II · Type your full legal name to sign
                  </span>
                  <input
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    className={inputClass()}
                  />
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700 bg-black p-3">
                  <input
                    type="checkbox"
                    checked={certifyAccuracy}
                    onChange={(e) => setCertifyAccuracy(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-teal-400"
                  />
                  <span className="text-xs leading-5 text-slate-300">
                    Under penalties of perjury, I certify that the information above is correct, consistent
                    with the certification statements on Form W-9.
                  </span>
                </label>

                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="w-full rounded-xl bg-teal-500 px-5 py-3 font-black text-black hover:bg-teal-400 disabled:opacity-50"
                >
                  {submitting ? "Generating..." : "Generate & Save W9"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
