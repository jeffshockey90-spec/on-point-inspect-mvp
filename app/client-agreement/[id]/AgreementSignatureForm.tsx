"use client";

import { useState } from "react";

export default function AgreementSignatureForm({
  inspectionId,
  defaultClientName,
  defaultClientEmail,
}: {
  inspectionId: string;
  defaultClientName: string;
  defaultClientEmail: string;
}) {
  const [clientName, setClientName] = useState(defaultClientName);
  const [clientEmail, setClientEmail] = useState(defaultClientEmail);
  const [signature, setSignature] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function signAgreement() {
    if (!accepted) {
      alert("Please check the acceptance box.");
      return;
    }

    if (!clientName.trim() || !signature.trim()) {
      alert("Client name and signature are required.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/sign-agreement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          clientName,
          clientEmail,
          signature,
          accepted,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to sign agreement.");
      }

      window.location.reload();
    } catch (error: any) {
      alert(error.message || "Failed to sign agreement.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
      <h2 className="text-2xl font-extrabold text-teal-300">
        Sign Agreement
      </h2>

      <p className="mt-2 text-slate-300">
        By signing below, you confirm that you have read, understood, and accepted the Residential Inspection Agreement.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-bold text-slate-400">
            Client Name
          </span>

          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />
        </label>

        <label>
          <span className="mb-2 block text-sm font-bold text-slate-400">
            Client Email
          </span>

          <input
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
          />
        </label>
      </div>

      <label className="mt-5 block">
        <span className="mb-2 block text-sm font-bold text-slate-400">
          Electronic Signature
        </span>

        <input
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="Type full legal name"
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-teal-400"
        />
      </label>

      <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
        />

        <span className="text-sm leading-6 text-slate-300">
          I have read the full agreement above and agree to the terms. I understand this electronic signature is intended to represent my acceptance of the inspection agreement.
        </span>
      </label>

      <button
        type="button"
        onClick={signAgreement}
        disabled={loading}
        className="mt-5 w-full rounded-xl bg-teal-500 px-6 py-4 text-lg font-extrabold text-slate-950 hover:bg-teal-400 disabled:opacity-50"
      >
        {loading ? "Signing..." : "Sign Agreement"}
      </button>
    </div>
  );
}
