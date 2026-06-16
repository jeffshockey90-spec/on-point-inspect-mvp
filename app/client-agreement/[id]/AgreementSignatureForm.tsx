"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function AgreementSignatureForm({
  inspectionId,
  contactId,
  defaultClientName,
  defaultClientEmail,
}: {
  inspectionId: string;
  contactId?: string;
  defaultClientName: string;
  defaultClientEmail: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [clientName, setClientName] = useState(defaultClientName);
  const [clientEmail, setClientEmail] = useState(defaultClientEmail);
  const [signature, setSignature] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signed, setSigned] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isBusy = loading || isPending;

  const canSubmit = useMemo(() => {
    return accepted && clientName.trim().length > 0 && signature.trim().length > 0;
  }, [accepted, clientName, signature]);

  useEffect(() => {
    async function trackAgreementView() {
      if (!inspectionId) return;

      try {
        await fetch("/api/track-inspection-view", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inspection_id: inspectionId,
            view_type: "agreement_viewed",
            contact_id: contactId || null,
            viewer_role: "client",
            viewer_email: defaultClientEmail || null,
            path: "/agreement",
          }),
        });
      } catch (error) {
        console.error("Agreement view tracking error:", error);
      }
    }

    trackAgreementView();
  }, [inspectionId, contactId, defaultClientEmail]);

  async function signAgreement() {
    if (isBusy || signed) return;

    setErrorMessage("");

    if (!accepted) {
      setErrorMessage("Please check the acceptance box.");
      return;
    }

    if (!clientName.trim() || !signature.trim()) {
      setErrorMessage("Client name and signature are required.");
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
          contactId,
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          signature: signature.trim(),
          accepted,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to sign agreement.");
      }

      setSigned(true);

      startTransition(() => {
        router.refresh();
      });
    } catch (error: any) {
      setSigned(false);
      setErrorMessage(error?.message || "Failed to sign agreement.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
      <h2 className="text-2xl font-extrabold text-teal-300">Sign Agreement</h2>

      <p className="mt-2 text-slate-300">
        By signing below, you confirm that you have read, understood, and accepted the Residential Inspection Agreement.
      </p>

      {signed ? (
        <div className="mt-5 rounded-xl border border-teal-500/40 bg-teal-500/10 p-4 text-sm font-bold text-teal-200">
          Agreement signed successfully. Updating the page...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm font-bold text-red-200">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-bold text-slate-400">Client Name</span>

          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            disabled={isBusy || signed}
            autoComplete="name"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none transition focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <label>
          <span className="mb-2 block text-sm font-bold text-slate-400">Client Email</span>

          <input
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            disabled={isBusy || signed}
            type="email"
            autoComplete="email"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none transition focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
      </div>

      <label className="mt-5 block">
        <span className="mb-2 block text-sm font-bold text-slate-400">Electronic Signature</span>

        <input
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          disabled={isBusy || signed}
          placeholder="Type full legal name"
          autoComplete="name"
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none transition focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <label className="mt-5 flex cursor-pointer touch-manipulation items-start gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 transition active:scale-[0.99] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          disabled={isBusy || signed}
          className="mt-1 h-4 w-4 cursor-pointer accent-teal-400 disabled:cursor-not-allowed"
        />

        <span className="text-sm leading-6 text-slate-300">
          I have read the full agreement above and agree to the terms. I understand this electronic signature is intended to represent my acceptance of the inspection agreement.
        </span>
      </label>

      <button
        type="button"
        onClick={signAgreement}
        disabled={isBusy || signed || !canSubmit}
        className="mt-5 flex w-full touch-manipulation items-center justify-center gap-3 rounded-xl bg-teal-500 px-6 py-4 text-lg font-extrabold text-slate-950 transition hover:bg-teal-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isBusy ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
        ) : null}
        {signed ? "Agreement Signed" : isBusy ? "Signing..." : "Sign Agreement"}
      </button>
    </div>
  );
}
