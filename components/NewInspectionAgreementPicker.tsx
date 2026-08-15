"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { US_STATES } from "../lib/usStates";

type AgreementTemplate = Record<string, any>;

function formatServiceType(value: string) {
  return String(value || "home_inspection")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Does a template's service type belong to a requested service category?
// service_type is free-form text the inspector sets on each template, so we
// match by keyword: "home" -> anything with "home" (default is home_inspection),
// "radon"/"mold" -> anything containing that word.
function templateMatchesService(template: AgreementTemplate, category: string) {
  const serviceType = String(template.service_type || "home_inspection").toLowerCase();
  if (category === "home") return serviceType.includes("home");
  return serviceType.includes(category);
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "teal" | "green" | "yellow" | "slate" }) {
  const classes =
    tone === "teal"
      ? "border-teal-500/40 bg-teal-500/10 text-teal-300"
      : tone === "green"
        ? "border-green-500/40 bg-green-500/10 text-green-300"
        : tone === "yellow"
          ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
          : "border-slate-600 bg-slate-800/60 text-slate-300";

  return (
    <span className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide ${classes}`}>
      {children}
    </span>
  );
}

// Picks the agreement(s) for a not-yet-created inspection. Unlike
// AgreementSelector (report builder), there's no inspectionId to save
// against yet - the selection just lives here and is lifted to the parent
// via onChange, then submitted together with the rest of the New Inspection
// form when the inspection is actually created.
export default function NewInspectionAgreementPicker({
  propertyState,
  services,
  onChange,
}: {
  propertyState?: string | null;
  /**
   * Service categories on the inspection (e.g. ["home","radon","mold"]), derived
   * from the selected Service. When provided, the picker auto-selects every
   * agreement whose service type matches one of these, so choosing "Home + Radon
   * + Mold" attaches all three agreements automatically.
   */
  services?: string[];
  onChange: (state: string, templateIds: string[]) => void;
}) {
  const defaultState = (propertyState || "MD").toUpperCase();
  const hasServices = Array.isArray(services) && services.length > 0;
  const servicesKey = (services || []).slice().sort().join(",");

  const [agreementState, setAgreementState] = useState(defaultState);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [expanded, setExpanded] = useState(false);
  // The last service set we auto-applied. null forces a re-apply (e.g. after the
  // state changes and a fresh template list loads).
  const lastAppliedServicesKey = useRef<string | null>(null);

  useEffect(() => {
    loadTemplates(agreementState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementState]);

  useEffect(() => {
    onChange(agreementState, selectedTemplateIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementState, selectedTemplateIds]);

  // Auto-select the agreements matching the inspection's services. Re-applies
  // when the service set changes or a new state's templates load; leaves manual
  // check/uncheck edits alone until then.
  useEffect(() => {
    if (!hasServices || templates.length === 0) return;
    if (lastAppliedServicesKey.current === servicesKey) return;

    const matched = templates
      .filter((template) =>
        (services || []).some((category) => templateMatchesService(template, category)),
      )
      .map((template) => template.id);

    // If no per-service template exists yet (e.g. no radon agreement created),
    // fall back to the state default so at least the primary agreement applies.
    let nextIds = matched;
    if (nextIds.length === 0) {
      const defaults = templates
        .filter((template) => template.is_default)
        .map((template) => template.id);
      nextIds = defaults.length > 0 ? defaults : templates[0]?.id ? [templates[0].id] : [];
    }

    lastAppliedServicesKey.current = servicesKey;
    setSelectedTemplateIds(nextIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, servicesKey]);

  async function loadTemplates(state: string) {
    const res = await fetch(`/api/agreement-templates?state=${state}&activeOnly=true`);
    const data = await res.json();
    const loadedTemplates = data.templates || [];

    setTemplates(loadedTemplates);

    // When services drive the selection, let the auto-select effect handle it.
    if (hasServices) return;

    setSelectedTemplateIds((current) => {
      if (current.length > 0) return current;

      const defaultTemplates = loadedTemplates.filter((template: any) => template.is_default);

      if (defaultTemplates.length > 0) {
        return defaultTemplates.map((template: any) => template.id);
      }

      return loadedTemplates[0]?.id ? [loadedTemplates[0].id] : [];
    });
  }

  function handleStateChange(nextState: string) {
    setAgreementState(nextState);
    setSelectedTemplateIds([]);
    // Force the service auto-select to re-run against the new state's templates.
    lastAppliedServicesKey.current = null;
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
    <div className="rounded-2xl border border-slate-700 bg-[#020817]/80 p-4">
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
                <div key={template.id} className="rounded-xl border border-slate-700 bg-[#071224] px-4 py-3">
                  <p className="min-w-0 break-words text-sm font-black text-white">{template.title}</p>
                  {template.version && <p className="mt-1 text-xs text-slate-400">{template.version}</p>}
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-300">
                No agreement selected. The client won&apos;t be sent one to sign.
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="w-full shrink-0 rounded-2xl border border-slate-600 px-5 py-3 text-sm font-black text-slate-200 transition hover:bg-slate-800 sm:w-auto"
        >
          {expanded ? "Hide Options" : "Change Agreement"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
              Agreement State
            </span>
            <select
              value={agreementState}
              onChange={(e) => handleStateChange(e.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-teal-400"
            >
              {US_STATES.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.code} — {state.name}
                </option>
              ))}
            </select>
          </label>

          {Object.entries(templatesByServiceType).map(([serviceType, serviceTemplates]) => (
            <div key={serviceType} className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
              <h3 className="text-base font-black text-teal-300">{formatServiceType(serviceType)}</h3>

              <div className="mt-3 grid w-full grid-cols-1 gap-3 md:grid-cols-2">
                {serviceTemplates.map((template: any) => {
                  const checked = selectedTemplateIds.includes(template.id);
                  return (
                    <label
                      key={template.id}
                      className={`block w-full min-w-0 cursor-pointer rounded-xl border p-4 transition ${
                        checked
                          ? "border-teal-400 bg-teal-500/10"
                          : "border-slate-700 bg-[#071224] hover:border-teal-500"
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
                          <p className="break-words font-bold text-white">{template.title}</p>
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
    </div>
  );
}
