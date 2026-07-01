"use client";

import { useMemo, useState } from "react";

type Finding = Record<string, any>;
type ExistingResponse = {
  finding_id: string;
  response_status: string;
  notes?: string | null;
};

const RESPONSE_OPTIONS = [
  { value: "agree_to_repair", label: "Agree to Repair" },
  { value: "already_repaired", label: "Already Repaired" },
  { value: "credit_buyer", label: "Credit Buyer" },
  { value: "decline", label: "Decline" },
  { value: "needs_discussion", label: "Needs Discussion" },
];

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
        },
      ])
    );

    return findings.reduce(
      (acc: Record<string, { responseStatus: string; notes: string }>, finding) => {
        const id = String(finding.id);
        acc[id] = responseMap.get(id) || { responseStatus: "", notes: "" };
        return acc;
      },
      {}
    );
  }, [existingResponses, findings]);

  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState(
    alreadySubmitted ? "Response submitted. This secure response is now locked." : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(alreadySubmitted);
  const [hiddenPhotos, setHiddenPhotos] = useState<Record<string, boolean>>({});

  const answeredCount = findings.filter((finding) => {
    const id = String(finding.id);
    return Boolean(items[id]?.responseStatus);
  }).length;

  const progressPercent = findings.length
    ? Math.round((answeredCount / findings.length) * 100)
    : 0;

  function updateItem(
    findingId: string,
    field: "responseStatus" | "notes",
    value: string
  ) {
    if (locked) return;

    setItems((prev) => ({
      ...prev,
      [findingId]: {
        responseStatus: prev[findingId]?.responseStatus || "",
        notes: prev[findingId]?.notes || "",
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
        responseStatus: items[id]?.responseStatus || "",
        notes: items[id]?.notes || "",
      };
    });

    const missing = responses.filter((item) => !item.responseStatus);

    if (missing.length) {
      setMessage("Choose a response for every repair request item before submitting.");
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

  if (!findings.length) {
    return (
      <section className="rounded-2xl border border-yellow-400/30 bg-yellow-500/10 p-5 text-yellow-100">
        No repair request items were found for this secure link.
      </section>
    );
  }

  return (
    <section className="space-y-5">
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
      </section>

      {message ? (
        <p className="rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm font-bold text-teal-100">
          {message}
        </p>
      ) : null}

      {findings.map((finding, index) => {
        const id = String(finding.id);
        const photoUrl = getFirstPhotoUrl(finding);
        const currentStatus = items[id]?.responseStatus || "";
        const hidePhoto = hiddenPhotos[id] || !photoUrl;

        return (
          <article
            key={id}
            className={`overflow-hidden rounded-2xl border p-5 shadow-xl transition ${getResponseStyle(currentStatus)}`}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-300">
                  Item {index + 1}
                </p>
                <h2 className="mt-2 break-words text-2xl font-black text-white">
                  {finding.title || "Untitled Finding"}
                </h2>
                <p className="mt-1 break-words text-sm font-bold text-slate-400">
                  {finding.section || "Other"} · {finding.severity || "Recommended Repair"}
                </p>
              </div>

              <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black uppercase ${getResponseBadgeStyle(currentStatus)}`}>
                {responseLabel(currentStatus)}
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

            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label>
                <span className="mb-2 block text-sm font-black text-white">
                  Response
                </span>
                <select
                  value={items[id]?.responseStatus || ""}
                  onChange={(event) =>
                    updateItem(id, "responseStatus", event.target.value)
                  }
                  disabled={locked}
                  className="h-[52px] w-full rounded-xl border border-slate-700 bg-[#020617] px-3 font-bold text-white outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="">Select response...</option>
                  {RESPONSE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
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
            </div>
          </article>
        );
      })}

      <button
        type="button"
        onClick={submitResponse}
        disabled={submitting || locked}
        className="min-h-[58px] w-full rounded-xl border border-teal-500 bg-teal-500 px-5 py-4 text-lg font-black text-slate-950 transition hover:bg-teal-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {locked ? "Response Submitted" : submitting ? "Submitting..." : "Submit Repair Request Response"}
      </button>
    </section>
  );
}
