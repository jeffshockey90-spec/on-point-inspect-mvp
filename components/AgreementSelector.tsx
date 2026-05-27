"use client";

import { useState } from "react";

const AGREEMENTS = [
  {
    value: "MD",
    label: "Maryland Agreement",
    description: "MD SOP Contract - V6",
  },
  {
    value: "WV",
    label: "West Virginia Agreement",
    description: "WV SOP Contract - V5",
  },
  {
    value: "PA",
    label: "Pennsylvania Agreement",
    description: "PA InterNACHI Contract - V5",
  },
];

export default function AgreementSelector({
  inspectionId,
  initialAgreementState,
  propertyState,
}: {
  inspectionId: string;
  initialAgreementState?: string | null;
  propertyState?: string | null;
}) {
  const defaultValue =
    initialAgreementState ||
    propertyState ||
    "MD";

  const [agreementState, setAgreementState] =
    useState(defaultValue.toUpperCase());

  const [saving, setSaving] = useState(false);

  async function saveAgreementState(nextState: string) {
    setAgreementState(nextState);
    setSaving(true);

    try {
      const res = await fetch("/api/update-agreement-state", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          agreementState: nextState,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ||
            "Failed to save agreement selection."
        );
      }
    } catch (error: any) {
      alert(
        error.message ||
          "Failed to save agreement selection."
      );
    } finally {
      setSaving(false);
    }
  }

  const selected = AGREEMENTS.find(
    (item) => item.value === agreementState
  );

  return (
    <section className="mb-8 rounded-2xl border border-slate-700 bg-[#071224] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-teal-300">
            Agreement Selection
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Select which state agreement applies to this inspection.
          </p>
        </div>

        {saving && (
          <span className="rounded-xl border border-teal-500 px-3 py-2 text-sm font-bold text-teal-300">
            Saving...
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {AGREEMENTS.map((agreement) => {
          const active =
            agreement.value === agreementState;

          return (
            <button
              key={agreement.value}
              type="button"
              onClick={() =>
                saveAgreementState(agreement.value)
              }
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-teal-400 bg-teal-500/15"
                  : "border-slate-700 bg-slate-950 hover:border-teal-500"
              }`}
            >
              <p
                className={`font-extrabold ${
                  active
                    ? "text-teal-300"
                    : "text-white"
                }`}
              >
                {agreement.label}
              </p>

              <p className="mt-1 text-sm text-slate-400">
                {agreement.description}
              </p>

              {active && (
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-teal-300">
                  Selected
                </p>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-sm text-slate-400">
        Current selection:{" "}
        <span className="font-bold text-teal-300">
          {selected?.description || agreementState}
        </span>
      </p>
    </section>
  );
}
