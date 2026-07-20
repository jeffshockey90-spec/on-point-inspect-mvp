"use client";


import { formatAppValue } from "../../../../../lib/app-time";
import { useMemo, useState } from "react";

type SignedAgreement = {
  id: string | number;
  client_name?: string | null;
  client_email?: string | null;
  client_signature?: string | null;
  signed_at?: string | null;
  signature_role?: string | null;
  signer_ip?: string | null;
};

function formatSignedDate(value: any) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return formatAppValue(date, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isImageSignature(value: any) {
  return String(value || "").startsWith("data:image");
}

function renderSignature(signature: string) {
  if (!signature) {
    return (
      <p className="text-sm font-bold text-slate-500">
        Signature not available
      </p>
    );
  }

  if (isImageSignature(signature)) {
    return (
      <img
        src={signature}
        alt="Client signature"
        className="max-h-24 max-w-full object-contain"
      />
    );
  }

  return (
    <p className="text-3xl font-semibold italic text-slate-950">
      {signature}
    </p>
  );
}

export default function SignedAgreementEditor({
  agreementId,
  inspectionId,
  initialBody,
  signedAgreements,
}: {
  agreementId: string;
  inspectionId: string;
  initialBody: string;
  signedAgreements: SignedAgreement[];
}) {
  const [body, setBody] = useState(initialBody || "");
  const [draftBody, setDraftBody] = useState(initialBody || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasChanges = useMemo(() => draftBody !== body, [draftBody, body]);

  function startEditing() {
    setDraftBody(body);
    setEditing(true);
  }

  function cancelEditing() {
    setDraftBody(body);
    setEditing(false);
  }

  async function saveChanges() {
    if (!draftBody.trim()) {
      alert("Agreement body cannot be blank.");
      return;
    }

    const confirmed = window.confirm(
      "Save changes to this signed agreement snapshot?\n\nOnly edit this for corrections/filled blanks. The client signature record will remain attached."
    );

    if (!confirmed) return;

    setSaving(true);

    try {
      const res = await fetch("/api/signed-agreements", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agreementId,
          inspectionId,
          agreement_body: draftBody,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Failed to save signed agreement.");
        return;
      }

      const updatedBody = data.agreement?.agreement_body || draftBody;

      setBody(updatedBody);
      setDraftBody(updatedBody);
      setEditing(false);
      alert("Signed agreement updated.");
    } catch (error: any) {
      alert(error?.message || "Failed to save signed agreement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-yellow-400 bg-yellow-100 p-5 text-slate-950 shadow-xl print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-900">
              Edit Controls
            </p>
            <h2 className="mt-2 text-2xl font-black">
              Agreement Body Editor
            </h2>
            <p className="mt-1 text-sm text-yellow-900">
              This toolbar is intentionally bright so it is easy to find.
            </p>
          </div>

          {!editing ? (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
            >
              Edit Signed Agreement
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveChanges}
                disabled={saving || !hasChanges}
                className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-black text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-black text-slate-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-white p-6 text-slate-950 print:border-black">
        {editing ? (
          <div className="print:hidden">
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={34}
              className="w-full rounded-xl border border-slate-300 bg-white p-4 font-mono text-sm leading-7 text-slate-950 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />

            <p className="mt-3 rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
              This edits the already-signed agreement text only. The saved client
              signature, signed date, email, and audit details below are not changed.
            </p>
          </div>
        ) : (
          <div className="whitespace-pre-wrap">
            {body || "No agreement body saved."}
          </div>
        )}

        <div className={editing ? "hidden print:block" : ""}>
          <div className="mt-10 border-t border-slate-300 pt-6">
            <p className="text-lg font-bold uppercase">
              Electronic Signature Acknowledgement
            </p>

            <p className="mt-4">
              By signing electronically, the Client confirms that they have read,
              understood, and accepted this Residential Inspection Agreement.
            </p>

            <div className="mt-6 space-y-6">
              {(signedAgreements || []).map((signedAgreement) => {
                const signedSignature = String(
                  signedAgreement.client_signature || ""
                ).trim();

                return (
                  <div
                    key={signedAgreement.id}
                    className="grid gap-6 border-t border-slate-200 pt-5 md:grid-cols-2"
                  >
                    <div>
                      <p>
                        <strong>Client:</strong>{" "}
                        {signedAgreement.client_name || "N/A"}
                      </p>
                      <p>
                        <strong>Dated:</strong>{" "}
                        {formatSignedDate(signedAgreement.signed_at)}
                      </p>

                      <div className="mt-4 border-b border-slate-900 pb-2">
                        {renderSignature(signedSignature)}
                      </div>

                      <p className="mt-2 text-xs">
                        Electronically signed by{" "}
                        {signedAgreement.client_name || "Client"}
                      </p>
                    </div>

                    <div>
                      <p>
                        <strong>Email:</strong>{" "}
                        {signedAgreement.client_email || "N/A"}
                      </p>
                      <p>
                        <strong>Role:</strong>{" "}
                        {signedAgreement.signature_role || "client"}
                      </p>
                      <p>
                        <strong>Status:</strong> Signed electronically
                      </p>

                      {signedAgreement.signer_ip && (
                        <p className="text-xs">
                          <strong>Signer IP:</strong>{" "}
                          {signedAgreement.signer_ip}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
