"use client";

import { useEffect, useMemo, useState } from "react";
import { BASE_SECTION_ORDER } from "../../../lib/reportSections";

type Template = { id: string; name: string; sections: string[]; service_key: string | null; updated_at?: string };
type Service = { id: string; name: string };
type Draft = { id?: string; name: string; service_key: string; sections: string[] };

const EMPTY: Draft = { name: "", service_key: "", sections: [] };

export default function ReportTemplatesEditor() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newSection, setNewSection] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function loadTemplates() {
    const r = await fetch("/api/report-templates", { cache: "no-store" }).then((x) => x.json()).catch(() => ({}));
    setTemplates(Array.isArray(r?.templates) ? r.templates : []);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/report-templates", { cache: "no-store" }).then((x) => x.json()).catch(() => ({})),
      fetch("/api/pricing", { cache: "no-store" }).then((x) => x.json()).catch(() => ({})),
    ]).then(([t, p]) => {
      setTemplates(Array.isArray(t?.templates) ? t.templates : []);
      const svcs = p?.config?.services || p?.services || [];
      setServices(Array.isArray(svcs) ? svcs.filter((s: any) => s?.id && s?.name).map((s: any) => ({ id: String(s.id), name: String(s.name) })) : []);
      setLoading(false);
    });
  }, []);

  const serviceName = useMemo(() => {
    const m = new Map(services.map((s) => [s.id, s.name]));
    return (key: string | null) => (key ? m.get(key) || key : null);
  }, [services]);

  function startNew() { setDraft({ ...EMPTY, sections: [] }); setMsg(null); }
  function edit(t: Template) { setDraft({ id: t.id, name: t.name, service_key: t.service_key || "", sections: [...(t.sections || [])] }); setMsg(null); }

  function addSection(name: string) {
    const clean = name.trim();
    if (!clean || !draft) return;
    if (draft.sections.some((s) => s.toLowerCase() === clean.toLowerCase())) return;
    setDraft({ ...draft, sections: [...draft.sections, clean] });
    setNewSection("");
  }
  function moveSection(i: number, dir: -1 | 1) {
    if (!draft) return;
    const j = i + dir;
    if (j < 0 || j >= draft.sections.length) return;
    const next = [...draft.sections];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft({ ...draft, sections: next });
  }
  function removeSection(i: number) {
    if (!draft) return;
    setDraft({ ...draft, sections: draft.sections.filter((_, k) => k !== i) });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) { setMsg({ tone: "err", text: "Give the template a name." }); return; }
    if (draft.sections.length === 0) { setMsg({ tone: "err", text: "Add at least one section." }); return; }
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/report-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draft.id, name: draft.name.trim(), sections: draft.sections, service_key: draft.service_key || null }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (data?.ok) { setDraft(null); await loadTemplates(); setMsg({ tone: "ok", text: "Template saved." }); }
    else setMsg({ tone: "err", text: data?.error || "Couldn't save." });
  }

  async function remove(t: Template) {
    if (!window.confirm(`Delete the "${t.name}" template?`)) return;
    await fetch(`/api/report-templates?id=${encodeURIComponent(t.id)}`, { method: "DELETE" }).catch(() => {});
    await loadTemplates();
  }

  if (loading) return <div className="text-[var(--fl-muted)]">Loading…</div>;

  const input = "w-full rounded-lg border border-[var(--fl-line)] bg-[var(--fl-surface)] px-3 py-2.5 text-[var(--fl-text)] outline-none focus:border-teal-400";

  return (
    <section className="space-y-4">
      {/* Existing templates */}
      {!draft && (
        <>
          {templates.length === 0 ? (
            <div className="fl-card" style={{ padding: 20 }}>
              <p className="text-[var(--fl-muted)]">No templates yet. Build one for a specialty inspection — like a structural &amp; mechanical, a re-inspection, or a mold visit.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {templates.map((t) => (
                <li key={t.id} className="fl-card flex flex-wrap items-center gap-3" style={{ padding: 16 }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-[var(--fl-text)]">{t.name}</div>
                    <div className="mt-0.5 text-xs text-[var(--fl-muted)]">
                      {(t.sections || []).length} sections
                      {t.service_key && <> · auto-applies to <span className="text-[var(--fl-accent-text)] font-bold">{serviceName(t.service_key)}</span></>}
                    </div>
                  </div>
                  <button type="button" onClick={() => edit(t)} className="fl-btn fl-btn-ghost">Edit</button>
                  <button type="button" onClick={() => remove(t)} className="rounded-lg border border-[var(--fl-line)] px-3 py-2 text-xs font-bold text-[var(--fl-muted)] hover:border-red-500 hover:text-red-300">Delete</button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={startNew} className="fl-btn fl-btn-primary">+ New template</button>
          {msg && <span className={`ml-3 text-sm font-bold ${msg.tone === "ok" ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</span>}
        </>
      )}

      {/* Editor */}
      {draft && (
        <div className="fl-card space-y-5" style={{ padding: 20 }}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="fl-lbl">Template name</span>
              <input className={`${input} mt-1`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Structural & Mechanical" />
            </label>
            <label className="block">
              <span className="fl-lbl">Auto-apply to service</span>
              <select className={`${input} mt-1`} value={draft.service_key} onChange={(e) => setDraft({ ...draft, service_key: e.target.value })}>
                <option value="">No auto-apply (manual only)</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>

          <div>
            <span className="fl-lbl">Sections (in order)</span>
            {draft.sections.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--fl-faint)]">No sections yet — add them below.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {draft.sections.map((s, i) => (
                  <li key={`${s}-${i}`} className="flex items-center gap-2 rounded-lg border border-[var(--fl-raised)] bg-[var(--fl-surface)] px-3 py-2">
                    <span className="flex flex-col">
                      <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0} className="h-4 leading-none text-[var(--fl-muted)] hover:text-[var(--fl-text)] disabled:opacity-30">▲</button>
                      <button type="button" onClick={() => moveSection(i, 1)} disabled={i === draft.sections.length - 1} className="h-4 leading-none text-[var(--fl-muted)] hover:text-[var(--fl-text)] disabled:opacity-30">▼</button>
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-bold text-[var(--fl-text)]">{s}</span>
                    <button type="button" onClick={() => removeSection(i)} className="text-[var(--fl-faint)] hover:text-red-300">✕</button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex gap-2">
              <input className={input} value={newSection} onChange={(e) => setNewSection(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSection(newSection); } }} placeholder="Add a section name…" />
              <button type="button" onClick={() => addSection(newSection)} className="fl-btn fl-btn-ghost shrink-0">Add</button>
            </div>

            <div className="mt-3">
              <span className="fl-lbl">Quick add standard sections</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BASE_SECTION_ORDER.filter((b) => !draft.sections.some((s) => s.toLowerCase() === b.toLowerCase())).map((b) => (
                  <button key={b} type="button" onClick={() => addSection(b)} className="rounded-full border border-[var(--fl-line)] px-2.5 py-1 text-xs font-semibold text-[var(--fl-muted)] hover:border-teal-400 hover:text-[var(--fl-accent-text)]">+ {b}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--fl-raised)] pt-4">
            <button type="button" onClick={save} disabled={saving} className="fl-btn fl-btn-primary disabled:opacity-60">{saving ? "Saving…" : "Save template"}</button>
            <button type="button" onClick={() => { setDraft(null); setMsg(null); }} className="fl-btn fl-btn-ghost">Cancel</button>
            {msg && <span className={`text-sm font-bold ${msg.tone === "ok" ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
