"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

const STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  { code: "GENERAL", name: "General / Any State" },
];

const SERVICE_TYPES = [
  "home_inspection",
  "pre_listing",
  "new_construction",
  "commercial",
  "maintenance",
  "radon",
  "mold",
  "radon_mold",
  "sewer_scope",
  "water_quality",
  "termite_wdo",
  "pool_spa",
  "ancillary",
  "other",
];

const PLACEHOLDERS = [
  "{{CLIENT_NAME}}",
  "{{PROPERTY_ADDRESS}}",
  "{{INSPECTION_FEE}}",
  "{{INSPECTION_DATE}}",
  "{{INSPECTOR_NAME}}",
  "{{INSPECTOR_COMPANY}}",
  "{{INSPECTOR_OWNER}}",
  "{{INSPECTOR_TITLE}}",
  "{{INSPECTOR_LICENSE}}",
  "{{AGREEMENT_STATE}}",
  "{{AGREEMENT_VERSION}}",
];

function serviceLabel(value: string) {
  return String(value || "home_inspection")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStateLabel(code: string) {
  const found = STATES.find((state) => state.code === code);
  return found ? `${found.code} - ${found.name}` : code || "General";
}

function safeFileName(value: string) {
  return String(value || "agreement")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function normalizeImportedTemplate(raw: any) {
  return {
    state: String(raw?.state || raw?.state_code || "GENERAL").toUpperCase(),
    title: String(raw?.title || "Imported Agreement").trim(),
    version: String(raw?.version || "v1").trim(),
    service_type: String(raw?.service_type || raw?.template_type || "home_inspection").trim(),
    display_order: Number(raw?.display_order || 0),
    body: String(raw?.body || raw?.agreement_body || "").trim(),
    is_active: raw?.is_active === undefined ? true : Boolean(raw.is_active),
    is_default: false,
  };
}

export default function AgreementLibraryManager() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const [state, setState] = useState("MD");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [serviceType, setServiceType] = useState("home_inspection");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);

  const [stateFilter, setStateFilter] = useState("ALL");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const [selectedPlaceholder, setSelectedPlaceholder] = useState("");
  const [copied, setCopied] = useState("");

  const [aiBusy, setAiBusy] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiClause, setAiClause] = useState("arbitration");

  async function runAgreementAi(
    mode: "draft" | "improve" | "clause",
    clauseKey?: string,
  ) {
    if (aiBusy) return;
    if (
      mode === "draft" &&
      body.trim() &&
      !window.confirm("Replace the current agreement body with an AI-drafted one?")
    ) {
      return;
    }

    setAiBusy(mode);
    setAiError("");

    try {
      const res = await fetch("/api/ai/draft-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          serviceType,
          state,
          title,
          instruction: aiInstruction,
          existingBody: body,
          clause: clauseKey,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.body) throw new Error(data.error || "AI request failed.");

      const text = String(data.body).trim();
      if (mode === "clause") {
        setBody((current) => (current.trim() ? `${current.trim()}\n\n${text}\n` : `${text}\n`));
      } else {
        setBody(text);
      }
    } catch (error: any) {
      setAiError(error?.message || "AI request failed.");
    } finally {
      setAiBusy("");
    }
  }

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const filteredTemplates = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    return templates.filter((template) => {
      const templateState = template.state || template.state_code || "GENERAL";
      const templateService = template.service_type || template.template_type || "home_inspection";

      if (stateFilter !== "ALL" && templateState !== stateFilter) return false;
      if (serviceFilter !== "ALL" && templateService !== serviceFilter) return false;

      if (!cleanSearch) return true;

      const haystack = [
        template.title,
        template.version,
        templateState,
        templateService,
        template.body,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(cleanSearch);
    });
  }, [templates, stateFilter, serviceFilter, search]);

  async function loadTemplates() {
    setLoading(true);
    setLoadError("");

    try {
      const res = await fetch("/api/agreement-templates?activeOnly=false");
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to load agreements.");

      setTemplates(data.templates || []);
    } catch (error: any) {
      console.error("Failed to load agreement templates:", error);
      setLoadError(error?.message || "Failed to load agreements.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setSelected(null);
    setState("MD");
    setTitle("");
    setVersion("");
    setServiceType("home_inspection");
    setDisplayOrder(0);
    setBody("");
    setIsActive(true);
    setIsDefault(false);
    setSelectedPlaceholder("");
    setCopied("");
  }

  function editTemplate(template: any) {
    setSelected(template);
    setState(template.state || template.state_code || "MD");
    setTitle(template.title || "");
    setVersion(template.version || "");
    setServiceType(template.service_type || template.template_type || "home_inspection");
    setDisplayOrder(Number(template.display_order || 0));
    setBody(template.body || "");
    setIsActive(template.is_active !== false);
    setIsDefault(Boolean(template.is_default));
    setSelectedPlaceholder("");
    setCopied("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveTemplate() {
    if (!title.trim() || !body.trim()) {
      alert("Title and agreement body are required.");
      return;
    }

    const payload = {
      id: selected?.id,
      state,
      state_code: state,
      title,
      version: version || "v1",
      service_type: serviceType,
      template_type: serviceType,
      display_order: displayOrder,
      body,
      is_active: isActive,
      is_default: isDefault,
    };

    setSaving(true);

    try {
      const res = await fetch("/api/agreement-templates", {
        method: selected ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to save agreement.");
        return;
      }

      alert("Agreement saved.");
      resetForm();
      await loadTemplates();
    } catch (error: any) {
      alert(error?.message || "Failed to save agreement.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(templateToDelete = selected) {
    if (!templateToDelete?.id) {
      alert("Select an agreement first.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${templateToDelete.title || "this agreement"}"?\n\nThis cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      const res = await fetch(
        `/api/agreement-templates?id=${encodeURIComponent(templateToDelete.id)}`,
        { method: "DELETE" }
      );

      let data: any = {};

      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        alert(data.error || "Failed to delete agreement.");
        return;
      }

      alert("Agreement deleted.");

      if (selected?.id === templateToDelete.id) {
        resetForm();
      }

      await loadTemplates();
    } catch (error: any) {
      alert(error?.message || "Failed to delete agreement.");
    } finally {
      setDeleting(false);
    }
  }

  async function duplicateTemplate(template: any) {
    if (!template?.id) return;

    const newTitle = `${template.title || "Agreement"} (Copy)`;

    const confirmed = window.confirm(`Duplicate "${template.title}" as "${newTitle}"?`);
    if (!confirmed) return;

    setDuplicatingId(template.id);

    try {
      const payload = {
        state: template.state || template.state_code || "GENERAL",
        state_code: template.state || template.state_code || "GENERAL",
        title: newTitle,
        version: template.version || "v1",
        service_type: template.service_type || template.template_type || "home_inspection",
        template_type: template.service_type || template.template_type || "home_inspection",
        display_order: Number(template.display_order || 0) + 1,
        body: template.body || "",
        is_active: true,
        is_default: false,
      };

      const res = await fetch("/api/agreement-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to duplicate agreement.");
        return;
      }

      alert("Agreement duplicated.");
      await loadTemplates();
      if (data.template) editTemplate(data.template);
    } catch (error: any) {
      alert(error?.message || "Failed to duplicate agreement.");
    } finally {
      setDuplicatingId(null);
    }
  }

  function exportTemplate(template = selected) {
    if (!template?.id) {
      alert("Select an agreement first.");
      return;
    }

    const exportData = {
      title: template.title || "",
      state: template.state || template.state_code || "GENERAL",
      version: template.version || "v1",
      service_type: template.service_type || template.template_type || "home_inspection",
      display_order: Number(template.display_order || 0),
      body: template.body || "",
      is_active: template.is_active !== false,
      exported_from: "FLOW",
      exported_at: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(exportData.title)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = normalizeImportedTemplate(parsed);

      if (!imported.title || !imported.body) {
        alert("Imported file must include a title and body.");
        return;
      }

      setSelected(null);
      setState(imported.state);
      setTitle(imported.title);
      setVersion(imported.version);
      setServiceType(imported.service_type);
      setDisplayOrder(imported.display_order);
      setBody(imported.body);
      setIsActive(imported.is_active);
      setIsDefault(false);

      alert("Agreement imported into the form. Review it, then click Save Agreement.");
    } catch (error: any) {
      alert(error?.message || "Could not import agreement JSON file.");
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  async function copyPlaceholder(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);

      window.setTimeout(() => {
        setCopied("");
      }, 1500);
    } catch {
      alert("Could not copy. You can manually highlight and copy the placeholder.");
    }
  }

  function insertAtCursor(value: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    const nextBody = `${body.slice(0, start)}${value}${body.slice(end)}`;

    setBody(nextBody);

    window.setTimeout(() => {
      textarea?.focus();
      const nextCursor = start + value.length;
      textarea?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  }

  function handleTextareaClick() {
    if (!selectedPlaceholder) return;

    insertAtCursor(selectedPlaceholder);
    setSelectedPlaceholder("");
  }

  function applyFormat(format: "bold" | "italic" | "underline" | "bullet" | "number") {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    const selectedText = body.slice(start, end);

    let replacement = selectedText;

    if (format === "bold") replacement = `**${selectedText || "bold text"}**`;
    if (format === "italic") replacement = `_${selectedText || "italic text"}_`;
    if (format === "underline") replacement = `<u>${selectedText || "underlined text"}</u>`;
    if (format === "bullet") replacement = selectedText ? selectedText.split("\n").map((line) => `• ${line}`).join("\n") : "• List item";
    if (format === "number") replacement = selectedText ? selectedText.split("\n").map((line, index) => `${index + 1}. ${line}`).join("\n") : "1. List item";

    setBody(`${body.slice(0, start)}${replacement}${body.slice(end)}`);

    window.setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + replacement.length, start + replacement.length);
    }, 0);
  }

  return (
    <div className="w-full max-w-full space-y-6 overflow-hidden">
      <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">Templates</h2>
            <p className="mt-1 text-sm text-[var(--fl-muted)]">
              Select, duplicate, export, delete, or create a custom agreement.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-bold text-[var(--fl-muted)] hover:bg-[var(--fl-raised)]"
            >
              Import JSON
            </button>

            <button
              type="button"
              onClick={() => exportTemplate()}
              disabled={!selected?.id}
              className="rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-bold text-[var(--fl-muted)] hover:bg-[var(--fl-raised)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export Selected
            </button>

            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-teal-500 px-4 py-2 text-sm font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
            >
              New Agreement
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agreements..."
            className="h-11 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 text-[var(--fl-text)] outline-none focus:border-teal-400"
          />

          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="h-11 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 text-[var(--fl-text)] outline-none focus:border-teal-400"
          >
            <option value="ALL">All States</option>
            {STATES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} - {item.name}
              </option>
            ))}
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="h-11 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 text-[var(--fl-text)] outline-none focus:border-teal-400"
          >
            <option value="ALL">All Service Types</option>
            {SERVICE_TYPES.map((item) => (
              <option key={item} value={item}>
                {serviceLabel(item)}
              </option>
            ))}
          </select>
        </div>

        {loading && <p className="text-sm text-[var(--fl-muted)]">Loading templates...</p>}

        {!loading && loadError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-[var(--fl-crit-text)]">
            {loadError}
            <button
              type="button"
              onClick={loadTemplates}
              className="rounded-lg border border-red-400/60 px-3 py-1.5 text-xs font-bold text-[var(--fl-crit-text)] hover:bg-red-500/20"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !loadError && filteredTemplates.length === 0 && (
          <div className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 text-sm text-[var(--fl-muted)]">
            No agreements found. Create a new agreement or clear your filters.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredTemplates.map((template) => {
            const templateState = template.state || template.state_code || "GENERAL";
            const templateService = template.service_type || template.template_type || "home_inspection";

            return (
              <div
                key={template.id}
                className={`rounded-xl border p-4 ${
                  selected?.id === template.id
                    ? "border-teal-400 bg-teal-500/10"
                    : "border-[var(--fl-line)] bg-[var(--fl-ground)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => editTemplate(template)}
                  className="block w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-bold text-[var(--fl-text)]">{template.title}</p>
                      <p className="mt-1 break-words text-sm text-[var(--fl-muted)]">
                        {getStateLabel(templateState)} • {template.version || "v1"}
                      </p>
                      <p className="mt-1 break-words text-xs font-bold uppercase tracking-wide text-[var(--fl-accent-text)]">
                        {serviceLabel(templateService)}
                      </p>
                    </div>

                    {template.is_default && (
                      <span className="shrink-0 rounded-lg bg-teal-500 px-2 py-1 text-xs font-bold text-slate-950">
                        Default
                      </span>
                    )}
                  </div>

                  {!template.is_active && (
                    <p className="mt-2 text-xs font-bold text-[var(--fl-crit-text)]">Inactive</p>
                  )}
                </button>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => editTemplate(template)}
                    className="rounded-lg border border-teal-500 px-3 py-2 text-xs font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => duplicateTemplate(template)}
                    disabled={duplicatingId === template.id}
                    className="rounded-lg border border-sky-500 px-3 py-2 text-xs font-bold text-[var(--fl-info-text)] hover:bg-sky-500/10 disabled:opacity-50"
                  >
                    {duplicatingId === template.id ? "Copying..." : "Duplicate"}
                  </button>

                  <button
                    type="button"
                    onClick={() => exportTemplate(template)}
                    className="rounded-lg border border-[var(--fl-faint)] px-3 py-2 text-xs font-bold text-[var(--fl-muted)] hover:bg-[var(--fl-raised)]"
                  >
                    Export
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteTemplate(template)}
                    disabled={deleting}
                    className="rounded-lg border border-red-500 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500 hover:text-white disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--fl-raised)] bg-[var(--fl-surface)] p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-[var(--fl-accent-text)]">
              {selected ? "Edit Agreement" : "Add Agreement"}
            </h2>
            <p className="mt-1 text-sm text-[var(--fl-muted)]">
              Save any title and agreement body, assign it to a state, and mark
              it as default when needed.
            </p>
          </div>

          {selected?.id && (
            <button
              type="button"
              onClick={() => deleteTemplate(selected)}
              disabled={deleting}
              className="rounded-xl border border-red-500 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "🗑 Delete Agreement"}
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">State</span>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="h-12 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 text-[var(--fl-text)] outline-none focus:border-teal-400"
            >
              {STATES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} - {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">Service Type</span>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="h-12 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 text-[var(--fl-text)] outline-none focus:border-teal-400"
            >
              {SERVICE_TYPES.map((item) => (
                <option key={item} value={item}>
                  {serviceLabel(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">Display Order</span>
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value || 0))}
              className="h-12 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 text-[var(--fl-text)] outline-none focus:border-teal-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">Version</span>
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="v1"
              className="h-12 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 text-[var(--fl-text)] outline-none focus:border-teal-400"
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">Custom Agreement Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Example: Florida Buyer Inspection Agreement"
            className="h-12 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 text-[var(--fl-text)] outline-none focus:border-teal-400"
          />
        </label>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-center gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-sm text-[var(--fl-muted)]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            <span className="min-w-0">Active</span>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-sm text-[var(--fl-muted)]">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            <span className="min-w-0">Default option for this service/state</span>
          </label>
        </div>

        <div className="mt-5 rounded-2xl border border-teal-700 bg-teal-500/10 p-4">
          <h3 className="text-lg font-extrabold text-[var(--fl-accent-text)]">Auto-Fill Placeholders</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--fl-muted)]">
            Click Select, then click inside the agreement body where you want
            the placeholder inserted.
          </p>

          {selectedPlaceholder && (
            <div className="mt-3 rounded-xl border border-yellow-500 bg-yellow-500/10 p-3 text-sm text-[var(--fl-warn-text)]">
              Selected: <span className="break-all font-mono font-bold">{selectedPlaceholder}</span>. Now click inside the agreement body.
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {PLACEHOLDERS.map((item) => (
              <div
                key={item}
                className={`min-w-0 rounded-xl border p-2 ${
                  selectedPlaceholder === item
                    ? "border-yellow-400 bg-yellow-500/10"
                    : "border-[var(--fl-line)] bg-[var(--fl-ground)]"
                }`}
              >
                <div className="break-all font-mono text-xs text-[var(--fl-accent-text)]">{item}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlaceholder(item)}
                    className="flex-1 rounded-lg bg-teal-500 px-2 py-1 text-xs font-bold text-slate-950 hover:bg-teal-400"
                  >
                    Select
                  </button>
                  <button
                    type="button"
                    onClick={() => copyPlaceholder(item)}
                    className="flex-1 rounded-lg border border-teal-500 px-2 py-1 text-xs font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
                  >
                    {copied === item ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyFormat("bold")}
              className="rounded-lg border border-[var(--fl-line)] px-3 py-2 text-xs font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
            >
              Bold
            </button>
            <button
              type="button"
              onClick={() => applyFormat("italic")}
              className="rounded-lg border border-[var(--fl-line)] px-3 py-2 text-xs font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
            >
              Italic
            </button>
            <button
              type="button"
              onClick={() => applyFormat("underline")}
              className="rounded-lg border border-[var(--fl-line)] px-3 py-2 text-xs font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
            >
              Underline
            </button>
            <button
              type="button"
              onClick={() => applyFormat("bullet")}
              className="rounded-lg border border-[var(--fl-line)] px-3 py-2 text-xs font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
            >
              Bullets
            </button>
            <button
              type="button"
              onClick={() => applyFormat("number")}
              className="rounded-lg border border-[var(--fl-line)] px-3 py-2 text-xs font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]"
            >
              Numbered
            </button>
          </div>

          <div className="mb-5 rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fl-purple-text)]">
              ✨ AI Assistant
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--fl-muted)]">
              Draft a full agreement for this service + state, improve the current text, or insert
              a standard clause. Always review AI output before saving.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => runAgreementAi("draft")}
                disabled={Boolean(aiBusy)}
                className="rounded-xl bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiBusy === "draft" ? "Drafting…" : "Draft full agreement"}
              </button>

              <select
                value={aiClause}
                onChange={(e) => setAiClause(e.target.value)}
                disabled={Boolean(aiBusy)}
                className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none focus:border-fuchsia-400 disabled:opacity-50"
              >
                <option value="arbitration">Arbitration</option>
                <option value="limitation_of_liability">Limitation of Liability</option>
                <option value="scope_and_exclusions">Scope &amp; Exclusions</option>
                <option value="mold_disclaimer">Mold Disclaimer</option>
                <option value="radon_disclosure">Radon Disclosure</option>
                <option value="payment_terms">Payment Terms</option>
                <option value="confidentiality">Confidentiality</option>
                <option value="standards_of_practice">Standards of Practice</option>
              </select>
              <button
                type="button"
                onClick={() => runAgreementAi("clause", aiClause)}
                disabled={Boolean(aiBusy)}
                className="rounded-xl border border-fuchsia-500/50 px-4 py-2 text-sm font-semibold text-[var(--fl-purple-text)] transition hover:bg-fuchsia-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiBusy === "clause" ? "Adding…" : "Insert clause"}
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder="How should AI improve it? (e.g. 'make section 4 clearer', 'less alarming')"
                className="min-w-0 flex-1 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none placeholder:text-[var(--fl-faint)] focus:border-fuchsia-400"
              />
              <button
                type="button"
                onClick={() => runAgreementAi("improve")}
                disabled={Boolean(aiBusy) || !body.trim()}
                className="rounded-xl border border-fuchsia-500/50 px-4 py-2 text-sm font-semibold text-[var(--fl-purple-text)] transition hover:bg-fuchsia-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiBusy === "improve" ? "Improving…" : "Improve"}
              </button>
            </div>

            {aiError && <p className="mt-2 text-xs font-bold text-[var(--fl-crit-text)]">{aiError}</p>}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[var(--fl-muted)]">Agreement Body</span>
            <textarea
              ref={textareaRef}
              value={body}
              onClick={handleTextareaClick}
              onChange={(e) => setBody(e.target.value)}
              rows={30}
              className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4 font-mono text-sm leading-7 text-[var(--fl-text)] outline-none focus:border-teal-400"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveTemplate}
            disabled={saving}
            className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Agreement"}
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-muted)] hover:bg-[var(--fl-raised)]"
          >
            Clear
          </button>
        </div>
      </section>
    </div>
  );
}