"use client";

import { useEffect, useMemo, useState } from "react";
import { US_STATES } from "../lib/usStates";

type AgreementTemplate = Record<string, any>;

function formatServiceType(value: string) {
  return String(value || "home_inspection")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "teal" | "green" | "yellow" | "slate" }) {
  const classes =
    tone === "teal"
      ? "border-teal-500/40 bg-teal-500/10 text-[var(--fl-accent-text)]"
      : tone === "green"
        ? "border-green-500/40 bg-green-500/10 text-[var(--fl-good-text)]"
        : tone === "yellow"
          ? "border-yellow-500/40 bg-yellow-500/10 text-[var(--fl-warn-text)]"
          : "border-[var(--fl-line)] bg-[var(--fl-raised)] text-[var(--fl-muted)]";

  return (
    <span className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${classes}`}>
      {children}
    </span>
  );
}

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
  const defaultState = (initialAgreementState || propertyState || "MD").toUpperCase();

  const startingTemplateIds =
    initialAgreementTemplateIds && initialAgreementTemplateIds.length > 0
      ? initialAgreementTemplateIds
      : initialAgreementTemplateId
        ? [initialAgreementTemplateId]
        : [];

  const [agreementState, setAgreementState] = useState(defaultState);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(startingTemplateIds);
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [savedLabel, setSavedLabel] = useState("Save Agreement Selection");

  useEffect(() => {
    loadTemplates(agreementState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementState]);

  async function loadTemplates(state: string) {
    const res = await fetch(`/api/agreement-templates?state=${state}&activeOnly=true`);
    const data = await res.json();
    const loadedTemplates = data.templates || [];

    setTemplates(loadedTemplates);

    if (selectedTemplateIds.length === 0) {
      const defaultTemplates = loadedTemplates.filter((template: any) => template.is_default);

      if (defaultTemplates.length > 0) {
        setSelectedTemplateIds(defaultTemplates.map((template: any) => template.id));
      } else if (loadedTemplates[0]?.id) {
        setSelectedTemplateIds([loadedTemplates[0].id]);
      }
    }
  }

  async function saveAgreementSelection(nextState = agreementState, nextTemplateIds = selectedTemplateIds) {
    if (nextTemplateIds.length === 0) {
      alert("Please select at least one agreement.");
      return;
    }

    setSaving(true);
    setSavedLabel("Saving...");

    try {
      const res = await fetch("/api/update-agreement-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          agreementState: nextState,
          agreementTemplateIds: nextTemplateIds,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to save agreement selection.");

      setAgreementState(data.agreement_state);
      setSelectedTemplateIds(data.agreement_template_ids || []);
      setSavedLabel("Saved!");
      window.setTimeout(() => setSavedLabel("Save Agreement Selection"), 1200);
    } catch (error: any) {
      setSavedLabel("Failed");
      alert(error.message || "Failed to save agreement selection.");
      window.setTimeout(() => setSavedLabel("Save Agreement Selection"), 1200);
    } finally {
      setSaving(false);
    }
  }

  function handleStateChange(nextState: string) {
    setAgreementState(nextState);
    setSelectedTemplateIds([]);
    setExpanded(true);
  }

  function toggleTemplate(templateId: string) {
    setSelectedTemplateIds((current) =>
      current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId]
    );
  }

  const selectedTemplates = useMemo(
    () => templates.filter((template) => selectedTemplateIds.includes(template.id)),
    [templates, selectedTemplateIds]
  );

  const templatesByServiceType = useMemo(() => {
    return templates.reduce((acc: Record<string, AgreementTemplate[]>, template) => {
      const key = template.service_type || "home_inspection";
      if (!acc[key]) acc[key] = [];
      acc[key].push(template);
      return acc;
    }, {});
  }, [templates]);

  return (
    <section className="mb-6 w-full max-w-full overflow-hidden rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] shadow-2xl shadow-black/20">
      <div className="border-b border-[var(--fl-raised)] bg-gradient-to-r from-[var(--fl-surface)] via-[var(--fl-surface-2)] to-[var(--fl-surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fl-accent-text)]">Agreements</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--fl-text)]">Selected Agreements</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
              See exactly which agreements are selected without the large empty agreement preview blocks.
            </p>
          </div>

          <a
            href="/agreements"
            className="inline-flex w-full items-center justify-center rounded-2xl border border-teal-500/70 bg-teal-500/10 px-5 py-3 text-sm font-semibold text-[var(--fl-accent-text)] transition hover:bg-teal-500 hover:text-slate-950 sm:w-auto"
          >
            Agreement Library
          </a>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <Badge tone="teal">{agreementState}</Badge>
                <Badge tone={selectedTemplateIds.length > 0 ? "green" : "yellow"}>
                  {selectedTemplateIds.length} Selected
                </Badge>
              </div>

              <div className="mt-3 space-y-2">
                {selectedTemplates.length > 0 ? (
                  selectedTemplates.map((template) => (
                    <div key={template.id} className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] px-4 py-3">
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="min-w-0 break-words text-sm font-semibold text-[var(--fl-text)]">{template.title}</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge tone="green">Selected</Badge>
                          {template.is_default && <Badge tone="teal">Default</Badge>}
                        </div>
                      </div>
                      {template.version && <p className="mt-1 text-xs text-[var(--fl-muted)]">{template.version}</p>}
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-[var(--fl-warn-text)]">
                    No agreement selected yet.
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="w-full shrink-0 rounded-2xl border border-[var(--fl-line)] px-5 py-3 text-sm font-semibold text-[var(--fl-text)] transition hover:bg-[var(--fl-raised)] sm:w-auto"
            >
              {expanded ? "Hide Options" : "Manage Agreements"}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--fl-faint)]">
                Agreement State
              </span>
              <select
                value={agreementState}
                onChange={(e) => handleStateChange(e.target.value)}
                className="w-full rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-3 text-sm font-bold text-[var(--fl-text)] outline-none focus:border-teal-400"
              >
                {US_STATES.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.code} — {state.name}
                  </option>
                ))}
              </select>
            </label>

            {Object.entries(templatesByServiceType).map(([serviceType, serviceTemplates]) => (
              <div key={serviceType} className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
                <h3 className="text-base font-semibold text-[var(--fl-accent-text)]">{formatServiceType(serviceType)}</h3>

                <div className="mt-3 grid w-full grid-cols-1 gap-3 md:grid-cols-2">
                  {serviceTemplates.map((template: any) => {
                    const checked = selectedTemplateIds.includes(template.id);
                    return (
                      <label
                        key={template.id}
                        className={`block w-full min-w-0 cursor-pointer rounded-xl border p-4 transition ${
                          checked
                            ? "border-teal-400 bg-teal-500/10"
                            : "border-[var(--fl-line)] bg-[var(--fl-surface-2)] hover:border-teal-500"
                        }`}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTemplate(template.id)}
                            className="mt-1 h-5 w-5 shrink-0 accent-teal-400"
                          />
                          <div className="min-w-0">
                            <p className="break-words font-bold text-[var(--fl-text)]">{template.title}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {template.version && <Badge>{template.version}</Badge>}
                              {template.is_default && <Badge tone="teal">Default</Badge>}
                              {checked && <Badge tone="green">Selected</Badge>}
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => saveAgreementSelection()}
          disabled={saving || selectedTemplateIds.length === 0}
          className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 transition active:scale-[0.98] hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto [touch-action:manipulation]"
        >
          {savedLabel}
        </button>
      </div>
    </section>
  );
}
