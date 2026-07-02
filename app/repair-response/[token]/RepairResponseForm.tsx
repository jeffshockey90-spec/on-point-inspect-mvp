"use client";

import { useMemo, useState } from "react";

type Finding = Record<string, any>;

type ExistingResponse = {
  finding_id: string;
  response_status: string;
  notes?: string | null;
  credit_amount?: number | string | null;
  seller_credit_amount?: number | string | null;
};

type ResponseState = {
  responseStatus: string;
  notes: string;
  creditAmount: string;
};

const RESPONSE_OPTIONS = [
  { value: "agree_to_repair", label: "Agree to Repair", icon: "✅" },
  { value: "already_repaired", label: "Already Repaired", icon: "🔧" },
  { value: "credit_buyer", label: "Credit Buyer", icon: "💲" },
  { value: "decline", label: "Decline", icon: "❌" },
  { value: "needs_discussion", label: "Needs Discussion", icon: "💬" },
];

function parseMoneyValue(value: any) {
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value: any) {
  const number = parseMoneyValue(value);
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getItemNumber(finding: Finding, fallbackIndex = 0) {
  return String(
    finding?.item_number ||
      finding?.finding_number ||
      finding?.repair_item_number ||
      finding?.report_item_number ||
      finding?.reference_number ||
      `Item ${fallbackIndex + 1}`,
  ).trim();
}

function getFindingText(finding: Finding) {
  return (
    finding.recommendation ||
    finding.observation ||
    finding.comment ||
    finding.description ||
    "Repair, correction, further evaluation, or negotiation requested."
  );
}

function getFirstPhotoUrl(finding: Finding) {
  const photoCandidates = Array.isArray(finding.photos) ? finding.photos : [];

  for (const photo of photoCandidates) {
    const url =
      photo?.signed_url ||
      photo?.signedUrl ||
      photo?.public_url ||
      photo?.publicUrl ||
      photo?.url ||
      "";

    if (String(url || "").trim()) return String(url).trim();
  }

  return String(
    finding.photo_url ||
      finding.photoUrl ||
      finding.image_url ||
      finding.imageUrl ||
      finding.photo ||
      ""
  ).trim();
}

function responseLabel(value: string) {
  return RESPONSE_OPTIONS.find((option) => option.value === value)?.label || "Not answered";
}

function responseIcon(value: string) {
  return RESPONSE_OPTIONS.find((option) => option.value === value)?.icon || "○";
}

function getResponseStyle(value: string) {
  if (value === "agree_to_repair" || value === "already_repaired") {
    return "border-emerald-500/60 bg-emerald-500/10";
  }

  if (value === "credit_buyer") {
    return "border-blue-500/60 bg-blue-500/10";
  }

  if (value === "decline") {
    return "border-red-500/60 bg-red-500/10";
  }

  if (value === "needs_discussion") {
    return "border-yellow-500/60 bg-yellow-500/10";
  }

  return "border-slate-700 bg-[#0f172a]";
}

function getResponseBadgeStyle(value: string) {
  if (value === "agree_to_repair" || value === "already_repaired") {
    return "border-emerald-400/60 bg-emerald-500/15 text-emerald-200";
  }

  if (value === "credit_buyer") {
    return "border-blue-400/60 bg-blue-500/15 text-blue-200";
  }

  if (value === "decline") {
    return "border-red-400/60 bg-red-500/15 text-red-200";
  }

  if (value === "needs_discussion") {
    return "border-yellow-400/60 bg-yellow-500/15 text-yellow-100";
  }

  return "border-slate-600 bg-slate-900 text-slate-300";
}

function getRequestedCredit(finding: Finding) {
  return (
    finding?.requested_credit_amount ||
    finding?.requestedCreditAmount ||
    finding?.requested_credit ||
    finding?.requestedCredit ||
    ""
  );
}

export default function RepairResponseForm({
  token,
  findings,
  existingResponses = [],
  alreadySubmitted = false,
}: {
  token: string;
  findings: Finding[];
  existingResponses?: ExistingResponse[];
  alreadySubmitted?: boolean;
}) {
  const initialItems = useMemo(() => {
    const responseMap = new Map(
      existingResponses.map((item) => [
        String(item.finding_id),
        {
          responseStatus: item.response_status || "",
          notes: item.notes || "",
          creditAmount: String(item.seller_credit_amount || item.credit_amount || ""),
        },
      ])
    );

    return findings.reduce((acc: Record<string, ResponseState>, finding) => {
      const id = String(finding.id);
      acc[id] = responseMap.get(id) || {
        responseStatus: "",
        notes: "",
        creditAmount: "",
      };
      return acc;
    }, {});
  }, [existingResponses, findings]);

  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState(
    alreadySubmitted ? "Response submitted. This secure response is now locked." : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(alreadySubmitted);
  const [hiddenPhotos, setHiddenPhotos] = useState<Record<string, boolean>>({});
  const [emailingAddendum, setEmailingAddendum] = useState(false);
  const [addendumMessage, setAddendumMessage] = useState("");
  const [buyerPrintedName, setBuyerPrintedName] = useState("");
  const [buyerSignature, setBuyerSignature] = useState("");
  const [sellerPrintedName, setSellerPrintedName] = useState("");
  const [sellerSignature, setSellerSignature] = useState("");

  const answeredCount = findings.filter((finding) => {
    const id = String(finding.id);
    return Boolean(items[id]?.responseStatus);
  }).length;

  const requestedCreditTotal = findings.reduce(
    (sum, finding) => sum + parseMoneyValue(getRequestedCredit(finding)),
    0
  );

  const sellerCreditTotal = findings.reduce((sum, finding) => {
    const id = String(finding.id);
    return sum + parseMoneyValue(items[id]?.creditAmount);
  }, 0);

  const progressPercent = findings.length
    ? Math.round((answeredCount / findings.length) * 100)
    : 0;

  const allAnswered = answeredCount === findings.length;
  const canSubmit = allAnswered && !submitting && !locked;

  function updateItem(
    findingId: string,
    field: "responseStatus" | "notes" | "creditAmount",
    value: string
  ) {
    if (locked) return;

    setItems((prev) => ({
      ...prev,
      [findingId]: {
        responseStatus: prev[findingId]?.responseStatus || "",
        notes: prev[findingId]?.notes || "",
        creditAmount: prev[findingId]?.creditAmount || "",
        [field]: value,
      },
    }));
  }

  async function submitResponse() {
    if (submitting || locked) return;

    const responses = findings.map((finding) => {
      const id = String(finding.id);
      return {
        findingId: id,
        itemNumber: getItemNumber(finding),
        responseStatus: items[id]?.responseStatus || "",
        notes: items[id]?.notes || "",
        creditAmount: parseMoneyValue(items[id]?.creditAmount),
      };
    });

    const missing = responses.filter((item) => !item.responseStatus);

    if (missing.length) {
      setMessage("Choose a response for every repair request item before submitting.");
      return;
    }

    if (!sellerPrintedName.trim() || !sellerSignature.trim()) {
      setMessage("Add the seller printed name and electronic signature before submitting.");
      return;
    }

    try {
      setSubmitting(true);
      setMessage("Submitting repair response...");

      const response = await fetch("/api/repair-response/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          responses,
          sellerCreditTotal,
          signatures: {
            buyer: {
              printedName: buyerPrintedName.trim(),
              signature: buyerSignature.trim(),
            },
            seller: {
              printedName: sellerPrintedName.trim(),
              signature: sellerSignature.trim(),
            },
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Could not submit repair response.");
      }

      setLocked(true);
      setMessage("Repair response submitted. Thank you.");
    } catch (error: any) {
      setMessage(error?.message || "Could not submit repair response.");
    } finally {
      setSubmitting(false);
    }
  }

  async function emailAddendum() {
    if (emailingAddendum) return;

    try {
      setEmailingAddendum(true);
      setAddendumMessage("Emailing addendum...");

      const response = await fetch(`/api/repair-request-addendum/${encodeURIComponent(token)}`, {
        method: "POST",
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Could not email addendum.");
      }

      setAddendumMessage(payload?.message || "Addendum emailed.");
    } catch (error: any) {
      setAddendumMessage(error?.message || "Could not email addendum.");
    } finally {
      setEmailingAddendum(false);
    }
  }

  if (!findings.length) {
    return (
      <section className="rounded-2xl border border-yellow-400/30 bg-yellow-500/10 p-5 text-yellow-100">
        No repair request items were found for this secure link.
      </section>
    );
  }

  return (
    <section className="space-y-5 pb-28 md:pb-0">
      <div className="sticky top-0 z-40 -mx-4 rounded-b-2xl border-b border-slate-700 bg-[#020617]/95 p-3 shadow-xl backdrop-blur md:static md:mx-0 md:rounded-2xl md:border md:border-slate-700 md:bg-[#0f172a] md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-teal-300">
              Response Progress
            </p>
            <p className="mt-1 text-sm font-black text-white">
              {answeredCount} of {findings.length} answered
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-cyan-100">
              Requested {formatMoney(requestedCreditTotal)}
            </span>
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-100">
              Seller {formatMoney(sellerCreditTotal)}
            </span>
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-900 ring-1 ring-slate-700">
          <div
            className="h-full rounded-full bg-teal-400 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {!locked && !allAnswered ? (
          <p className="mt-2 text-xs font-bold text-yellow-100">
            Answer every item before submitting.
          </p>
        ) : null}
      </div>

      <section className="rounded-2xl border border-slate-700 bg-[#0f172a] p-5 shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-300">
              Response Progress
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              {answeredCount} / {findings.length} Answered
            </h2>
          </div>
          {locked ? (
            <span className="w-fit rounded-full border border-emerald-400/60 bg-emerald-500/15 px-4 py-2 text-sm font-black text-emerald-200">
              Response Submitted
            </span>
          ) : (
            <span className="w-fit rounded-full border border-yellow-400/60 bg-yellow-500/15 px-4 py-2 text-sm font-black text-yellow-100">
              Waiting for Submission
            </span>
          )}
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#020617] ring-1 ring-slate-700">
          <div
            className="h-full rounded-full bg-teal-400 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-cyan-200">
              Requested Credit
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {formatMoney(requestedCreditTotal)}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-200">
              Seller Credit Offered
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              {formatMoney(sellerCreditTotal)}
            </p>
          </div>
        </div>
      </section>

      {message ? (
        <p className="rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm font-bold text-teal-100">
          {message}
        </p>
      ) : null}

      {locked ? (
        <section className="rounded-2xl border border-purple-500/40 bg-purple-500/10 p-5 shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-purple-200">
                Addendum Ready
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Repair Request Addendum
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                Includes seller responses, requested credits, offered credits, and totals.
              </p>
            </div>

            <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3">
              <a
                href={`/api/repair-request-addendum/${encodeURIComponent(token)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-purple-400 bg-[#020617] px-4 py-3 text-sm font-black text-purple-200 transition hover:bg-purple-500/10 active:scale-[0.98]"
              >
                Open
              </a>

              <a
                href={`/api/repair-request-addendum/${encodeURIComponent(token)}?download=1`}
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-teal-400 bg-[#020617] px-4 py-3 text-sm font-black text-teal-200 transition hover:bg-teal-500/10 active:scale-[0.98]"
              >
                Download
              </a>

              <button
                type="button"
                onClick={emailAddendum}
                disabled={emailingAddendum}
                data-fast-click="true"
                className="min-h-[48px] rounded-xl border border-cyan-400 bg-[#020617] px-4 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-500/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {emailingAddendum ? "Emailing..." : "Email"}
              </button>
            </div>
          </div>

          {addendumMessage ? (
            <p className="mt-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-100">
              {addendumMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {findings.map((finding, index) => {
        const id = String(finding.id);
        const photoUrl = getFirstPhotoUrl(finding);
        const currentStatus = items[id]?.responseStatus || "";
        const hidePhoto = hiddenPhotos[id] || !photoUrl;
        const itemNumber = getItemNumber(finding, index);
        const requestedCredit = getRequestedCredit(finding);
        const showCreditField = currentStatus === "credit_buyer";

        return (
          <article
            key={id}
            className={`overflow-hidden rounded-2xl border p-5 shadow-xl transition ${getResponseStyle(currentStatus)}`}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-300">
                  Item #{itemNumber}
                </p>
                <h2 className="mt-2 break-words text-2xl font-black text-white">
                  {finding.title || "Untitled Finding"}
                </h2>
                <p className="mt-1 break-words text-sm font-bold text-slate-400">
                  {finding.section || "Other"} · {finding.severity || "Recommended Repair"}
                </p>

                {parseMoneyValue(requestedCredit) > 0 ? (
                  <p className="mt-3 w-fit rounded-full border border-cyan-400/60 bg-cyan-500/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-cyan-200">
                    Requested Credit: {formatMoney(requestedCredit)}
                  </p>
                ) : null}
              </div>

              <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black uppercase ${getResponseBadgeStyle(currentStatus)}`}>
                {responseIcon(currentStatus)} {responseLabel(currentStatus)}
              </span>
            </div>

            {!hidePhoto ? (
              <img
                src={photoUrl}
                alt="Repair request item"
                onError={() =>
                  setHiddenPhotos((prev) => ({
                    ...prev,
                    [id]: true,
                  }))
                }
                className="mb-4 max-h-[360px] w-full rounded-xl border border-slate-700 object-contain"
              />
            ) : null}

            <div className="rounded-xl border border-slate-700 bg-[#020617] p-4 text-slate-200">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Requested Action
              </p>
              <p className="mt-2 whitespace-pre-line break-words leading-7">
                {getFindingText(finding)}
              </p>
            </div>

            <div className="mt-4">
              <p className="mb-3 text-sm font-black text-white">Response</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {RESPONSE_OPTIONS.map((option) => {
                  const active = currentStatus === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateItem(id, "responseStatus", option.value)}
                      disabled={locked}
                      data-fast-click="true"
                      className={`min-h-[74px] rounded-xl border px-3 py-3 text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${
                        active
                          ? "border-teal-300 bg-teal-500/20 text-white shadow-[0_0_20px_rgba(20,184,166,0.18)]"
                          : "border-slate-700 bg-[#020617] text-slate-300 hover:border-teal-500 hover:bg-teal-500/10"
                      }`}
                    >
                      <span className="block text-xl">{option.icon}</span>
                      <span className="mt-1 block text-xs font-black uppercase leading-4">
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {showCreditField ? (
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-black text-white">
                  Seller Credit Amount
                </span>
                <input
                  value={items[id]?.creditAmount || ""}
                  onChange={(event) => updateItem(id, "creditAmount", event.target.value)}
                  disabled={locked}
                  placeholder="$0"
                  inputMode="decimal"
                  className="h-[52px] w-full rounded-xl border border-blue-500/60 bg-[#020617] px-3 text-lg font-black text-white outline-none focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-70"
                />
              </label>
            ) : null}

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-black text-white">
                Notes
              </span>
              <textarea
                value={items[id]?.notes || ""}
                onChange={(event) => updateItem(id, "notes", event.target.value)}
                rows={3}
                disabled={locked}
                placeholder="Add repair notes, credit details, timing, or explanation..."
                className="w-full rounded-xl border border-slate-700 bg-[#020617] p-3 text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>
          </article>
        );
      })}

      <section className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-5 shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
              Electronic Signatures
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Sign Repair Request Response
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Seller signature is required to submit. Buyer signature can be added here if available, or added later on the final addendum.
            </p>
          </div>

          <span className={`w-fit rounded-full border px-4 py-2 text-sm font-black ${
            sellerPrintedName.trim() && sellerSignature.trim()
              ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
              : "border-yellow-400/60 bg-yellow-500/15 text-yellow-100"
          }`}>
            {sellerPrintedName.trim() && sellerSignature.trim() ? "Seller Signed" : "Seller Signature Needed"}
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-[#020617] p-4">
            <p className="text-sm font-black uppercase tracking-wide text-slate-300">
              Buyer Signature
            </p>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">
                Buyer Printed Name
              </span>
              <input
                value={buyerPrintedName}
                onChange={(event) => {
                  setBuyerPrintedName(event.target.value);
                  if (!buyerSignature.trim()) setBuyerSignature(event.target.value);
                }}
                disabled={locked}
                placeholder="Buyer name"
                className="h-[52px] w-full rounded-xl border border-slate-700 bg-[#071224] px-3 font-bold text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">
                Type Buyer Signature
              </span>
              <input
                value={buyerSignature}
                onChange={(event) => setBuyerSignature(event.target.value)}
                disabled={locked}
                placeholder="Type full legal signature"
                className="h-[64px] w-full rounded-xl border border-slate-700 bg-[#071224] px-4 text-2xl font-black italic text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>
            {buyerSignature.trim() ? (
              <p className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-100">
                Buyer signature will be dated automatically when submitted.
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-teal-500/50 bg-[#020617] p-4">
            <p className="text-sm font-black uppercase tracking-wide text-teal-200">
              Seller Signature Required
            </p>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">
                Seller Printed Name
              </span>
              <input
                value={sellerPrintedName}
                onChange={(event) => {
                  setSellerPrintedName(event.target.value);
                  if (!sellerSignature.trim()) setSellerSignature(event.target.value);
                }}
                disabled={locked}
                placeholder="Seller name"
                className="h-[52px] w-full rounded-xl border border-slate-700 bg-[#071224] px-3 font-bold text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">
                Type Seller Signature
              </span>
              <input
                value={sellerSignature}
                onChange={(event) => setSellerSignature(event.target.value)}
                disabled={locked}
                placeholder="Type full legal signature"
                className="h-[64px] w-full rounded-xl border border-teal-500/60 bg-[#071224] px-4 text-2xl font-black italic text-white outline-none focus:border-teal-300 disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>
            <p className="mt-3 rounded-xl border border-slate-700 bg-[#071224] px-3 py-2 text-xs leading-5 text-slate-300">
              By submitting, the signer confirms this electronic signature is intended to be used for this repair request response.
            </p>
          </div>
        </div>
      </section>

      <div className="sticky bottom-[72px] z-50 -mx-5 mt-6 border-t border-slate-700 bg-[#020617]/95 p-4 backdrop-blur md:static md:bottom-auto md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <button
          type="button"
          onClick={submitResponse}
          disabled={!canSubmit}
          data-fast-click="true"
          className="min-h-[60px] w-full rounded-xl border border-teal-500 bg-teal-500 px-5 py-4 text-lg font-black text-slate-950 shadow-xl transition hover:bg-teal-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {locked
            ? "Response Submitted"
            : submitting
            ? "Submitting..."
            : allAnswered
            ? "Submit Repair Request Response"
            : `Answer ${findings.length - answeredCount} More Item${findings.length - answeredCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </section>
  );
}
