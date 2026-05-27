"use client";

import { useEffect, useMemo, useState } from "react";

export default function AgreementSelector({
  inspectionId,
  initialAgreementState,
  initialAgreementTemplateId,
  initialAgreementTemplateIds,
  propertyState,
}: {
  inspectionId: string;
  initialAgreementState?: string | null;
  initialAgreementTemplateId?: string | null;
  initialAgreementTemplateIds?: string[] | null;
  propertyState?: string | null;
}) {
  const defaultState =
    (initialAgreementState || propertyState || "MD").toUpperCase();

  const startingTemplateIds =
    initialAgreementTemplateIds && initialAgreementTemplateIds.length > 0
      ? initialAgreementTemplateIds
      : initialAgreementTemplateId
        ? [initialAgreementTemplateId]
        : [];

  const [agreementState, setAgreementState] = useState(defaultState);
  const [selectedTemplateIds, setSelectedTemplateIds] =
    useState<string[]>(startingTemplateIds);
  const [templates, setTemplates] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTemplates(agreementState);
  }, [agreementState]);

  async function loadTemplates(state: string) {
    const res = await fetch(
      `/api/agreement-templates?state=${state}&activeOnly=true`
    );

    const data = await res.json();
    const loadedTemplates = data.templates || [];

    setTemplates(loadedTemplates);

    if (selectedTemplateIds.length === 0) {
      const defaultTemplates = loadedTemplates.filter(
        (template: any) => template.is_default
      );

      if (defaultTemplates.length > 0) {
        setSelectedTemplateIds(defaultTemplates.map((template: any) => template.id));
      } else if (loadedTemplates[0]?.id) {
        setSelectedTemplateIds([loadedTemplates[0].id]);
      }
    }
  }

  async function saveAgreementSelection(
    nextState = agreementState,
    nextTemplateIds = selectedTemplateIds
  ) {
    if (nextTemplateIds.length === 0) {
      alert("Please select at least one agreement.");
      return;
    }

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
          agreementTemplateIds: nextTemplateIds,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ||
            "Failed to save agreement selection."
        );
      }

      setAgreementState(data.agreement_state);
      setSelectedTemplateIds(data.agreement_template_ids || []);
    } catch (error: any) {
      alert(
        error.message ||
          "Failed to save agreement selection."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleStateChange(nextState: string) {
    setAgreementState(nextState);
    setSelectedTemplateIds([]);
  }

  function toggleTemplate(templateId: string) {
    setSelectedTemplateIds((current) => {
      if (current.includes(templateId)) {
        return current.filter((id) => id !== templateId);
      }

      return [...current, templateId];
    });
  }

  const selectedTemplates = useMemo(
    () =>
      templates.filter((template) =>
        selectedTemplateIds.includes(template.id)
      ),
    [templates, selectedTemplateIds]
  );

  const templatesByServiceType = useMemo(() => {
    return templates.reduce((acc: Record<string, any[]>, template) => {
      const key = template.service_type || "home_inspection";

      if (!acc[key]) {
        acc[key] = [];
      }

      acc[key].push(template);

      return acc;
    }, {});
  }, [templates]);

  return (
    <section className="mb-8 rounded-2xl border border-slate-700 bg-[#071224] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-teal-300">
            Agreement Selection
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Select one or more agreements for this inspection. Use this for home inspection plus radon, mold, or future add-ons.
          </p>
        </div>

        <a
          href="/agreements"
          className="rounded-xl border border-teal-500 px-4 py-2 font-bold text-teal-300 hover:bg-teal-500/10"
        >
          Manage Agreement Library
        </a>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {["MD", "WV", "PA"].map((state) => {
          const active = state === agreementState;

          return (
            <button
              key={state}
              type="button"
              onClick={() => handleStateChange(state)}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-teal-400 bg-teal-500/15"
                  : "border-slate-700 bg-slate-950 hover:border-teal-500"
              }`}
            >
              <p
                className={`font-extrabold ${
                  active ? "text-teal-300" : "text-white"
                }`}
              >
                {state} Agreements
              </p>

              {active && (
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-teal-300">
                  State Selected
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-5">
        {Object.entries(templatesByServiceType).map(
          ([serviceType, serviceTemplates]) => (
            <div
              key={serviceType}
              className="rounded-2xl border border-slate-700 bg-slate-950 p-4"
            >
              <h3 className="text-lg font-extrabold text-teal-300">
                {serviceType
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (letter) => letter.toUpperCase())}
              </h3>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {serviceTemplates.map((template: any) => {
                  const checked = selectedTemplateIds.includes(template.id);

                  return (
                    <label
                      key={template.id}
                      className={`cursor-pointer rounded-xl border p-4 transition ${
                        checked
                          ? "border-teal-400 bg-teal-500/10"
                          : "border-slate-700 bg-[#071224] hover:border-teal-500"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTemplate(template.id)}
                          className="mt-1"
                        />

                        <div>
                          <p className="font-bold text-white">
                            {template.title}
                          </p>

                          <p className="mt-1 text-sm text-slate-400">
                            {template.version}
                            {template.is_default ? " • Default" : ""}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>

      {selectedTemplates.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4">
          <p className="font-bold text-white">
            Selected Agreements:
          </p>

          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {selectedTemplates.map((template) => (
              <li key={template.id}>
                {template.title} — {template.version}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => saveAgreementSelection()}
        disabled={saving || selectedTemplateIds.length === 0}
        className="mt-4 rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Agreement Selection"}
      </button>
    </section>
  );
}
