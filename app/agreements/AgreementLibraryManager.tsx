"use client";

import { useEffect, useRef, useState } from "react";

const STATES = ["MD", "WV", "PA"];

const SERVICE_TYPES = [
  "home_inspection",
  "radon",
  "mold",
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

export default function AgreementLibraryManager() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const [state, setState] = useState("MD");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [serviceType, setServiceType] = useState("home_inspection");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);

  const [selectedPlaceholder, setSelectedPlaceholder] = useState("");
  const [copied, setCopied] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);

    try {
      const res = await fetch("/api/agreement-templates?activeOnly=false");
      const data = await res.json();

      setTemplates(data.templates || []);
    } catch (error) {
      console.error("Failed to load agreement templates:", error);
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
    setState(template.state || "MD");
    setTitle(template.title || "");
    setVersion(template.version || "");
    setServiceType(template.service_type || "home_inspection");
    setDisplayOrder(Number(template.display_order || 0));
    setBody(template.body || "");
    setIsActive(Boolean(template.is_active));
    setIsDefault(Boolean(template.is_default));
    setSelectedPlaceholder("");
    setCopied("");
  }

  async function saveTemplate() {
    if (!title.trim() || !body.trim()) {
      alert("Title and agreement body are required.");
      return;
    }

    const payload = {
      id: selected?.id,
      state,
      title,
      version: version || "v1",
      service_type: serviceType,
      display_order: displayOrder,
      body,
      is_active: isActive,
      is_default: isDefault,
    };

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

  return (
    <div className="w-full max-w-full space-y-6 overflow-hidden">
      <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-teal-300">
              Templates
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Select an agreement to edit, or create a new one.
            </p>
          </div>

          <button
            type="button"
            onClick={resetForm}
            className="rounded-xl border border-teal-500 px-4 py-2 text-sm font-bold text-teal-300 hover:bg-teal-500/10"
          >
            New Agreement
          </button>
        </div>

        {loading && (
          <p className="text-sm text-slate-400">
            Loading templates...
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => editTemplate(template)}
              className={`rounded-xl border p-4 text-left ${
                selected?.id === template.id
                  ? "border-teal-400 bg-teal-500/10"
                  : "border-slate-700 bg-slate-950 hover:border-teal-500"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-bold text-white">
                    {template.title}
                  </p>

                  <p className="mt-1 break-words text-sm text-slate-400">
                    {template.state} • {template.version}
                  </p>

                  <p className="mt-1 break-words text-xs font-bold uppercase tracking-wide text-teal-300">
                    {(template.service_type || "home_inspection").replace(
                      /_/g,
                      " "
                    )}
                  </p>
                </div>

                {template.is_default && (
                  <span className="shrink-0 rounded-lg bg-teal-500 px-2 py-1 text-xs font-bold text-slate-950">
                    Default
                  </span>
                )}
              </div>

              {!template.is_active && (
                <p className="mt-2 text-xs font-bold text-red-300">
                  Inactive
                </p>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-teal-300">
              {selected ? "Edit Agreement" : "Add Agreement"}
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Manage the agreement text, state, service type, and default status.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-400">
              State
            </span>

            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-white outline-none focus:border-teal-400"
            >
              {STATES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-400">
              Service Type
            </span>

            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-white outline-none focus:border-teal-400"
            >
              {SERVICE_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-400">
              Display Order
            </span>

            <input
              type="number"
              value={displayOrder}
              onChange={(e) =>
                setDisplayOrder(Number(e.target.value || 0))
              }
              className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-white outline-none focus:border-teal-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-400">
              Version
            </span>

            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="v1"
              className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-white outline-none focus:border-teal-400"
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-bold text-slate-400">
            Title
          </span>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-white outline-none focus:border-teal-400"
          />
        </label>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />

            <span>Active</span>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4"
            />

            <span>Default option for this service/state</span>
          </label>
        </div>

        <div className="mt-5 rounded-2xl border border-teal-700 bg-teal-950/20 p-4">
          <h3 className="text-lg font-extrabold text-teal-300">
            Auto-Fill Placeholders
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-300">
            Click Select, then click inside the agreement body where you want
            the placeholder inserted. Existing labels like Client:, Inspector:,
            Common Street Address:, and Fee: are also auto-filled.
          </p>

          {selectedPlaceholder && (
            <div className="mt-3 rounded-xl border border-yellow-500 bg-yellow-950/20 p-3 text-sm text-yellow-200">
              Selected:{" "}
              <span className="break-all font-mono font-bold">
                {selectedPlaceholder}
              </span>
              . Now click inside the agreement body.
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {PLACEHOLDERS.map((item) => (
              <div
                key={item}
                className={`min-w-0 rounded-xl border p-2 ${
                  selectedPlaceholder === item
                    ? "border-yellow-400 bg-yellow-950/20"
                    : "border-slate-700 bg-slate-950"
                }`}
              >
                <div className="break-all font-mono text-xs text-teal-200">
                  {item}
                </div>

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
                    className="flex-1 rounded-lg border border-teal-500 px-2 py-1 text-xs font-bold text-teal-300 hover:bg-teal-500/10"
                  >
                    {copied === item ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-bold text-slate-400">
            Agreement Body
          </span>

          <textarea
            ref={textareaRef}
            value={body}
            onClick={handleTextareaClick}
            onChange={(e) => setBody(e.target.value)}
            rows={30}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm leading-7 text-white outline-none focus:border-teal-400"
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveTemplate}
            className="rounded-xl bg-teal-500 px-5 py-3 font-bold text-slate-950 hover:bg-teal-400"
          >
            Save Agreement
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="rounded-xl border border-slate-600 px-5 py-3 font-bold text-slate-300 hover:bg-slate-800"
          >
            Clear
          </button>
        </div>
      </section>
    </div>
  );
}
