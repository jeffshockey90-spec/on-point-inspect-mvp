"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabaseClient";
import { CHECKLIST_LIBRARY, type ChecklistGroup } from "../lib/checklistLibrary";



type SelectionRow = {
  id: string;
  inspection_id: string;
  section: string;
  group_title: string;
  value: string;
  custom_text?: string | null;
};

type OptionOverride = {
  id: string;
  section: string;
  group_title: string;
  option_label: string;
  replacement_label?: string | null;
  hidden?: boolean | null;
};

// A checklist option as rendered. `custom` options are real rows in
// section_checklist_options (identified by overrideId/optionLabel) and can be
// hard-deleted; built-in options live in code and are hidden via an override
// row keyed by their original label (baseOriginal).
type RenderOption = {
  label: string;
  custom: boolean;
  baseOriginal?: string;
  overrideId?: string;
  optionLabel?: string;
};



// Approximate R-value per inch of attic insulation, by insulation type. Used to
// auto-estimate the attic R-value from Insulation Type x Insulation Depth. These
// are industry rule-of-thumb averages; the inspector can always edit the result.
function rValuePerInch(type: string): number {
  const t = String(type || "").toLowerCase();
  if (!t || t.includes("unknown") || t === "none") return 0;
  if (t.includes("spray foam")) return 6.0; // closed-cell avg
  if (t.includes("foam board")) return 5.0; // rigid (XPS/polyiso)
  if (t.includes("cellulose")) return 3.5;
  if (t.includes("mineral wool") || t.includes("rock wool")) return 3.1;
  if (t.includes("vermiculite")) return 2.4;
  if (t.includes("batt")) return 3.2; // fiberglass batt
  if (t.includes("blown") || t.includes("loose")) return 2.6; // blown/loose-fill
  if (t.includes("fiberglass")) return 3.2;
  return 0;
}

function SectionInformationChecklist({
  inspectionId,
  section,
  weatherAddress,
  weatherDate,
  weatherHour,
}: {
  inspectionId: string;
  section: string;
  weatherAddress?: string;
  weatherDate?: string | null;
  weatherHour?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [selections, setSelections] = useState<SelectionRow[]>([]);
  // Bumped to force a reload of selections — e.g. after the live-camera voice
  // fill or photo autofill writes boxes for this section while the builder is
  // already open (those write from a separate view and don't refresh the page).
  const [reloadKey, setReloadKey] = useState(0);
  const [optionOverrides, setOptionOverrides] = useState<OptionOverride[]>([]);
  const [otherTextByGroup, setOtherTextByGroup] = useState<Record<string, string>>({});
  const [textValueByGroup, setTextValueByGroup] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editingOption, setEditingOption] = useState<{ groupTitle: string; optionLabel: string; nextLabel: string } | null>(null);
  const [addingOptionGroup, setAddingOptionGroup] = useState("");
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  // Attic only: auto-estimate the R-value from Insulation Type x Insulation
  // Depth whenever either changes. The inspector can still edit the result; it
  // only recomputes when the type or depth changes again.
  const insulationDepthValue = textValueByGroup["Insulation Depth"] || "";
  useEffect(() => {
    if (section !== "Attic, Insulation & Ventilation") return;
    const typeRow = selections.find(
      (item) =>
        item.group_title === "Insulation Type" &&
        item.value !== "__TEXT_VALUE__" &&
        item.value !== "OTHER",
    );
    const perInch = rValuePerInch(typeRow?.value || "");
    const depth = parseFloat(String(insulationDepthValue).replace(/[^0-9.]/g, ""));
    if (!perInch || !Number.isFinite(depth) || depth <= 0) return;

    const computed = `R-${Math.round(perInch * depth)}`;
    if ((textValueByGroup["R-value"] || "").trim() === computed) return;

    setTextValueByGroup((prev) => ({ ...prev, "R-value": computed }));
    void saveTextValue("R-value", computed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, selections, insulationDepthValue]);



  function showMessage(type: "success" | "error", text: string) {
    setMessageType(type);
    setMessage(text);
  }

  const baseGroups = useMemo(
    () => CHECKLIST_LIBRARY[section] || [{ title: "Custom Info", options: [] }],
    [section]
  );

  // Only sections that actually have Temperature / Weather Conditions groups
  // (i.e. Inspection Details) get the one-tap weather auto-fill.
  const supportsWeather = baseGroups.some(
    (group) => group.title === "Temperature" || group.title === "Weather Conditions"
  );

  // Fetch the actual weather for the property + inspection date/time and fill
  // the Temperature and Weather Conditions fields. Reuses the same save paths as
  // manual edits so the UI updates immediately and everything persists.
  async function autofillWeather() {
    if (weatherLoading || !supportsWeather) return;
    if (!weatherAddress) {
      showMessage("error", "No property address on file to look up weather.");
      return;
    }

    setWeatherLoading(true);
    try {
      // POST (not GET): some in-app WebViews (iOS/Capacitor) serve a cached
      // /api/weather GET for the same URL even with cache:"no-store" and a
      // cache-buster — which made the auto-fill show the SAME temp/conditions on
      // every property. A POST body is never cached, so the reading is always
      // fresh + property-specific (same fix that worked for the airspace check).
      const body: Record<string, any> = {
        mode: weatherDate ? "date" : "current",
        address: weatherAddress,
      };
      if (weatherDate) {
        // Normalize to YYYY-MM-DD (the column can come back as a full timestamp).
        body.date = String(weatherDate).slice(0, 10);
        if (weatherHour != null && Number.isFinite(weatherHour)) {
          body.hour = String(weatherHour);
        }
      }

      const res = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json?.weather) {
        throw new Error(json?.error || "Weather lookup failed.");
      }

      const w = json.weather;
      setOpen(true);

      if (w.temperatureF != null) {
        const tempStr = String(w.temperatureF);
        setTextValueByGroup((prev) => ({ ...prev, Temperature: tempStr }));
        await saveTextValue("Temperature", tempStr);
        if (!isSelected("Temperature", "Fahrenheit (F)")) {
          await toggleSelection("Temperature", "Fahrenheit (F)");
        }
      }

      // Set the matching Weather Conditions option. Use conditionSimple
      // ("Clear" | "Cloudy" | "Rain" | "Snow" | "Fog" | "Storm") because those
      // are the actual option labels — the detailed conditionText (e.g. "Partly
      // cloudy") never matches, which is why the condition wasn't auto-filling.
      //
      // Weather Conditions is single-select for auto-fill: FIRST clear any
      // previously-set condition, so re-running actually CORRECTS a stale value
      // (e.g. an old forecast's "Rain") instead of leaving it stuck alongside
      // the new one. Without this, a wrong condition never went away on re-run.
      const conditionBucket = w.conditionSimple || w.conditionText;
      if (conditionBucket) {
        const staleConditions = selections.filter(
          (item) =>
            item.group_title === "Weather Conditions" &&
            item.value !== "__TEXT_VALUE__" &&
            item.value !== conditionBucket,
        );
        if (staleConditions.length > 0) {
          const staleIds = staleConditions.map((s) => s.id);
          setSelections((prev) => prev.filter((item) => !staleIds.includes(item.id)));
          await supabase
            .from("section_checklist_selections")
            .delete()
            .in("id", staleIds);
        }
        if (!isSelected("Weather Conditions", conditionBucket)) {
          await toggleSelection("Weather Conditions", conditionBucket);
        }
      }

      const parts = [
        w.temperatureF != null ? `${w.temperatureF}°F` : "",
        w.conditionText || "",
      ].filter(Boolean);
      const setStr = `Weather set${parts.length ? `: ${parts.join(", ")}` : ""}.`;
      if (json.isForecast) {
        // A future date only has a forecast, which changes day to day. Warn so a
        // stale prediction isn't left in the report — re-run on inspection day.
        showMessage(
          "error",
          `${setStr} Note: this is a forecast for a future date — re-run Auto-fill Weather on the inspection day for actual conditions.`,
        );
      } else {
        showMessage("success", setStr);
      }
    } catch (error: any) {
      showMessage("error", error?.message || "Weather lookup failed.");
    } finally {
      setWeatherLoading(false);
    }
  }

  // The current inspector — checklist-option customizations are scoped to them,
  // so one inspector's renames/additions don't leak into or mutate another's.
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setInspectorId(data.user?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    async function load() {
      if (!inspectionId || !section) return;

      // Options: this inspector's own rows PLUS legacy rows that predate scoping
      // (inspector_id is null) so nothing an inspector already customized vanishes.
      let optionsQuery = supabase
        .from("section_checklist_options")
        .select("*")
        .eq("section", section);
      optionsQuery = inspectorId
        ? optionsQuery.or(`inspector_id.eq.${inspectorId},inspector_id.is.null`)
        : optionsQuery.is("inspector_id", null);

      const [selectedResult, overrideResult] = await Promise.all([
        supabase
          .from("section_checklist_selections")
          .select("*")
          .eq("inspection_id", inspectionId)
          .eq("section", section)
          .order("created_at", { ascending: true }),

        optionsQuery.order("created_at", { ascending: true }),
      ]);

      if (!selectedResult.error) {
        const rows = selectedResult.data || [];
        setSelections(rows);

        const textValues: Record<string, string> = {};
        rows.forEach((row: SelectionRow) => {
          if (row.value === "__TEXT_VALUE__") textValues[row.group_title] = row.custom_text || "";
        });
        setTextValueByGroup(textValues);
      }

      if (!overrideResult.error) setOptionOverrides(overrideResult.data || []);
    }

    load();
  }, [inspectionId, section, inspectorId, reloadKey]);

  // Reload when voice fill / photo autofill writes checklist boxes for THIS
  // inspection (and this section, when the event names sections) from the live
  // camera — otherwise the already-open builder keeps showing them unchecked
  // until a manual reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onChecklistUpdated(event: Event) {
      const detail = (event as CustomEvent)?.detail || {};
      if (String(detail.inspectionId || "") !== String(inspectionId)) return;
      const secs = Array.isArray(detail.sections) ? detail.sections : null;
      if (secs && !secs.includes(section)) return;
      setReloadKey((k) => k + 1);
    }
    window.addEventListener(
      "opi:checklist-updated",
      onChecklistUpdated as EventListener,
    );
    return () =>
      window.removeEventListener(
        "opi:checklist-updated",
        onChecklistUpdated as EventListener,
      );
  }, [inspectionId, section]);

  function getGroupOptions(group: ChecklistGroup): RenderOption[] {
    const overridesForGroup = optionOverrides.filter((item) => item.group_title === group.title);
    const hidden = new Set(
      overridesForGroup.filter((item) => item.hidden).map((item) => item.option_label)
    );
    const renamed = new Map(
      overridesForGroup
        .filter((item) => item.replacement_label && !item.hidden)
        .map((item) => [item.option_label, item.replacement_label as string])
    );

    const base: RenderOption[] = group.options
      .filter((option) => !hidden.has(option))
      .map((option) => ({
        label: renamed.get(option) || option,
        baseOriginal: option,
        custom: false,
      }));

    const customAdded: RenderOption[] = overridesForGroup
      .filter((item) => !item.hidden && item.option_label.startsWith("__CUSTOM__:"))
      .map((item) => ({
        label: item.replacement_label || item.option_label.replace("__CUSTOM__:", ""),
        custom: true,
        overrideId: item.id,
        optionLabel: item.option_label,
      }));

    return [...base, ...customAdded];
  }

  // Unit options (e.g. Fahrenheit/Celsius, SEER, gallons) were rendered from the
  // raw list, so Edit/Delete wrote override rows that were never consulted —
  // a silent no-op. Run them through the same hide/rename override pipeline.
  function getGroupUnitOptions(group: ChecklistGroup): RenderOption[] {
    if (!group.unitOptions) return [];
    const overridesForGroup = optionOverrides.filter((item) => item.group_title === group.title);
    const hidden = new Set(
      overridesForGroup.filter((item) => item.hidden).map((item) => item.option_label),
    );
    const renamed = new Map(
      overridesForGroup
        .filter((item) => item.replacement_label && !item.hidden)
        .map((item) => [item.option_label, item.replacement_label as string]),
    );
    return group.unitOptions
      .filter((unit) => !hidden.has(unit))
      .map((unit) => ({ label: renamed.get(unit) || unit, baseOriginal: unit, custom: false }));
  }

  function isSelected(groupTitle: string, value: string) {
    return selections.some((item) => item.group_title === groupTitle && item.value === value);
  }

  async function toggleSelection(groupTitle: string, value: string) {
    if (!inspectionId || !section) return;

    const existing = selections.find(
      (item) => item.group_title === groupTitle && item.value === value
    );

    // Optimistic update: reflect the toggle in the UI immediately and persist in
    // the background. Previously every click awaited a network round-trip while a
    // single `saving` flag disabled the entire checklist, which made clicking
    // through options feel slow and laggy on large reports.
    if (existing) {
      setSelections((prev) => prev.filter((item) => item.id !== existing.id));
      const { error } = await supabase
        .from("section_checklist_selections")
        .delete()
        .eq("id", existing.id);
      if (error) {
        // Roll back on failure.
        setSelections((prev) => [...prev, existing]);
        showMessage("error", error?.message || "Failed to update checklist selection.");
      }
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const optimistic: SelectionRow = {
      id: tempId,
      inspection_id: inspectionId,
      section,
      group_title: groupTitle,
      value,
    };
    setSelections((prev) => [...prev, optimistic]);

    const { data, error } = await supabase
      .from("section_checklist_selections")
      .insert({ inspection_id: inspectionId, section, group_title: groupTitle, value })
      .select("*")
      .single();

    if (error || !data) {
      setSelections((prev) => prev.filter((item) => item.id !== tempId));
      showMessage("error", error?.message || "Failed to save checklist selection.");
      return;
    }

    // Swap the optimistic row for the real one from the database.
    setSelections((prev) => prev.map((item) => (item.id === tempId ? data : item)));
  }

  async function saveTextValue(groupTitle: string, value: string) {
    if (saving || !inspectionId || !section) return;
    setSaving(true);

    try {
      const existing = selections.find((item) => item.group_title === groupTitle && item.value === "__TEXT_VALUE__");

      if (existing) {
        const { data, error } = await supabase
          .from("section_checklist_selections")
          .update({ custom_text: value })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        setSelections((prev) => prev.map((item) => (item.id === existing.id ? data : item)));
      } else {
        const { data, error } = await supabase
          .from("section_checklist_selections")
          .insert({ inspection_id: inspectionId, section, group_title: groupTitle, value: "__TEXT_VALUE__", custom_text: value })
          .select("*")
          .single();
        if (error) throw error;
        if (data) setSelections((prev) => [...prev, data]);
      }
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to save checklist value.");
    } finally {
      setSaving(false);
    }
  }

  async function addOther(groupTitle: string) {
    const clean = (otherTextByGroup[groupTitle] || "").trim();
    if (!clean || saving) return;
    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("section_checklist_selections")
        .insert({ inspection_id: inspectionId, section, group_title: groupTitle, value: "OTHER", custom_text: clean })
        .select("*")
        .single();
      if (error) throw error;
      if (data) setSelections((prev) => [...prev, data]);
      setOtherTextByGroup((prev) => ({ ...prev, [groupTitle]: "" }));
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to add OTHER item.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelection(id: string) {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("section_checklist_selections").delete().eq("id", id);
      if (error) throw error;
      setSelections((prev) => prev.filter((item) => item.id !== id));
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to remove checklist item.");
    } finally {
      setSaving(false);
    }
  }

  async function addOption(groupTitle: string) {
    const clean = newOptionLabel.trim();
    if (!clean || saving) return;

    // Don't create an option that already exists (case-insensitive) — either a
    // built-in option for this group or a custom one already added. This is what
    // produced duplicate "Rain"/"Clear" chips. If it already exists, just close
    // the add box instead of inserting a duplicate row.
    const existingLabels = getGroupOptions(
      baseGroups.find((g) => g.title === groupTitle) || { title: groupTitle, options: [] },
    ).map((o) => o.label.trim().toLowerCase());
    if (existingLabels.includes(clean.toLowerCase())) {
      showMessage("error", `"${clean}" is already an option here.`);
      setNewOptionLabel("");
      setAddingOptionGroup("");
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("section_checklist_options")
        .insert({ section, group_title: groupTitle, option_label: `__CUSTOM__:${clean}`, replacement_label: clean, hidden: false, inspector_id: inspectorId })
        .select("*")
        .single();
      if (error) throw error;
      if (data) setOptionOverrides((prev) => [...prev, data]);
      setNewOptionLabel("");
      setAddingOptionGroup("");
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to add checklist option.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOptionEdit() {
    if (!editingOption || saving) return;
    const clean = editingOption.nextLabel.trim();
    if (!clean) return;
    setSaving(true);

    try {
      const existing = optionOverrides.find((item) => item.group_title === editingOption.groupTitle && item.option_label === editingOption.optionLabel);

      if (existing) {
        const { data, error } = await supabase
          .from("section_checklist_options")
          .update({ replacement_label: clean, hidden: false })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        setOptionOverrides((prev) => prev.map((item) => (item.id === existing.id ? data : item)));
      } else {
        const { data, error } = await supabase
          .from("section_checklist_options")
          .insert({ section, group_title: editingOption.groupTitle, option_label: editingOption.optionLabel, replacement_label: clean, hidden: false, inspector_id: inspectorId })
          .select("*")
          .single();
        if (error) throw error;
        if (data) setOptionOverrides((prev) => [...prev, data]);
      }

      // Migrate any already-saved selections from the OLD display label to the
      // new one. Selections are stored by the label shown at click time, so
      // without this a renamed-after-checked option would render unchecked and
      // re-clicking would insert a duplicate row. Only touches this rename.
      const oldDisplayLabel =
        existing?.replacement_label ||
        editingOption.optionLabel.replace(/^__CUSTOM__:/, "");
      if (oldDisplayLabel && oldDisplayLabel !== clean) {
        const { error: migrateError } = await supabase
          .from("section_checklist_selections")
          .update({ value: clean })
          .eq("inspection_id", inspectionId)
          .eq("section", section)
          .eq("group_title", editingOption.groupTitle)
          .eq("value", oldDisplayLabel);
        if (!migrateError) {
          setSelections((prev) =>
            prev.map((item) =>
              item.group_title === editingOption.groupTitle && item.value === oldDisplayLabel
                ? { ...item, value: clean }
                : item,
            ),
          );
        }
      }

      setEditingOption(null);
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to edit checklist option.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOption(groupTitle: string, option: RenderOption) {
    if (saving) return;
    if (!window.confirm(`Delete "${option.label}" from this checklist group?`)) return;
    setSaving(true);

    try {
      if (option.custom && option.overrideId) {
        // Custom options are real rows in section_checklist_options -- hard-delete
        // so they actually disappear. (The old code inserted a hidden row keyed by
        // the display label, which never matched the "__CUSTOM__:" row, so custom
        // options could never be deleted.)
        const { error } = await supabase
          .from("section_checklist_options")
          .delete()
          .eq("id", option.overrideId);
        if (error) throw error;
        setOptionOverrides((prev) => prev.filter((item) => item.id !== option.overrideId));
      } else {
        // Built-in options live in code, so hide them with an override row keyed by
        // their ORIGINAL label (what getGroupOptions filters on). Reuse an existing
        // override row for this option if one is already present (e.g. a rename).
        const originalLabel = option.baseOriginal || option.label;
        const existing = optionOverrides.find(
          (item) => item.group_title === groupTitle && item.option_label === originalLabel
        );

        if (existing) {
          const { data, error } = await supabase
            .from("section_checklist_options")
            .update({ hidden: true })
            .eq("id", existing.id)
            .select("*")
            .single();
          if (error) throw error;
          if (data) setOptionOverrides((prev) => prev.map((item) => (item.id === existing.id ? data : item)));
        } else {
          const { data, error } = await supabase
            .from("section_checklist_options")
            .insert({ section, group_title: groupTitle, option_label: originalLabel, hidden: true, inspector_id: inspectorId })
            .select("*")
            .single();
          if (error) throw error;
          if (data) setOptionOverrides((prev) => [...prev, data]);
        }
      }
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to delete checklist option.");
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = selections.filter((item) => item.value !== "__TEXT_VALUE__").length;

  return (
    // Layout containment: a checkbox toggle re-renders this checklist; contain
    // its layout so that re-render doesn't reflow the whole report list (the
    // "glitchy when clicking checkboxes" jank on big reports).
    <div className="rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface-2)] [contain:layout]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[var(--fl-raised)]"
      >
        <div>
          <h3 className="text-xl font-semibold text-[var(--fl-accent-text)]">Information</h3>
          <p className="mt-1 text-sm text-[var(--fl-muted)]">
            {selectedCount > 0 ? `${selectedCount} item${selectedCount === 1 ? "" : "s"} selected` : "No information selected"}
          </p>
        </div>
        <span className="rounded-xl border border-[var(--fl-line)] px-4 py-2 text-sm font-semibold text-[var(--fl-text)]">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {supportsWeather && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--fl-line)] px-5 py-3">
          <button
            type="button"
            onClick={autofillWeather}
            disabled={weatherLoading}
            aria-busy={weatherLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-500 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-[var(--fl-info-text)] transition hover:bg-sky-500/20 disabled:cursor-wait disabled:opacity-60"
          >
            {weatherLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Getting weather…
              </>
            ) : (
              <>🌤 Auto-fill Weather</>
            )}
          </button>
          <span className="text-xs text-[var(--fl-muted)]">
            Fills Temperature &amp; Weather Conditions from the inspection date &amp; property location.
          </span>
        </div>
      )}

      {message && (
        <div
          className={`border-t border-[var(--fl-line)] px-5 py-3 text-sm font-bold ${
            messageType === "success"
              ? "bg-emerald-500/10 text-[var(--fl-good-text)]"
              : "bg-red-500/10 text-[var(--fl-crit-text)]"
          }`}
        >
          {message}
        </div>
      )}

      {selectedCount > 0 && (
        <div className="border-t border-[var(--fl-line)] px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {selections.filter((item) => item.value !== "__TEXT_VALUE__").map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => removeSelection(item.id)}
                className="rounded-full border border-teal-500/60 bg-teal-500/10 px-3 py-1 text-sm font-bold text-[var(--fl-accent-text)] hover:bg-teal-500/20"
              >
                {item.group_title}: {item.custom_text || item.value} ×
              </button>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-5 border-t border-[var(--fl-line)] p-5">
          {baseGroups.map((group) => {
            const options = getGroupOptions(group);
            const textValue = textValueByGroup[group.title] || "";
            const otherRows = selections.filter((item) => item.group_title === group.title && item.value === "OTHER");

            return (
              <div key={group.title} className="rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold text-[var(--fl-text)]">{group.title}</h4>
                  <button
                    type="button"
                    onClick={() => { setAddingOptionGroup(group.title); setNewOptionLabel(""); }}
                    className="rounded-lg border border-teal-500 px-3 py-1 text-xs font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10"
                  >
                    + Add Option
                  </button>
                </div>

                {group.type === "text" && (
                  <div className="mb-4">
                    <input
                      value={textValue}
                      onChange={(event) => setTextValueByGroup((prev) => ({ ...prev, [group.title]: event.target.value }))}
                      onBlur={() => saveTextValue(group.title, textValueByGroup[group.title] || "")}
                      placeholder="#"
                      className="w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
                    />
                    {group.title === "R-value" && (
                      <p className="mt-2 text-xs text-[var(--fl-muted)]">
                        Auto-estimated from Insulation Type × Depth — edit if needed.
                      </p>
                    )}
                    {group.unitOptions && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {getGroupUnitOptions(group).map((u) => (
                          <ChecklistOptionButton
                            key={u.baseOriginal || u.label}
                            label={u.label}
                            selected={isSelected(group.title, u.label)}
                            saving={saving}
                            onClick={() => toggleSelection(group.title, u.label)}
                            onEdit={() =>
                              setEditingOption({
                                groupTitle: group.title,
                                optionLabel: u.baseOriginal || u.label,
                                nextLabel: u.label,
                              })
                            }
                            onDelete={() => deleteOption(group.title, u)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {options.map((option) => (
                    <ChecklistOptionButton
                      key={option.custom ? `custom-${option.overrideId}` : `base-${option.baseOriginal}`}
                      label={option.label}
                      selected={isSelected(group.title, option.label)}
                      saving={saving}
                      onClick={() => toggleSelection(group.title, option.label)}
                      onEdit={() =>
                        setEditingOption({
                          groupTitle: group.title,
                          optionLabel: option.custom
                            ? option.optionLabel || option.label
                            : option.baseOriginal || option.label,
                          nextLabel: option.label,
                        })
                      }
                      onDelete={() => deleteOption(group.title, option)}
                    />
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--fl-muted)]">+ OTHER</p>
                  <div className="flex flex-col gap-2 md:flex-row">
                    <input
                      value={otherTextByGroup[group.title] || ""}
                      onChange={(event) => setOtherTextByGroup((prev) => ({ ...prev, [group.title]: event.target.value }))}
                      placeholder="Add custom item..."
                      className="min-w-0 flex-1 rounded-lg border border-[var(--fl-line)] bg-[var(--fl-ground)] px-3 py-2 text-[var(--fl-text)] outline-none focus:border-teal-400"
                    />
                    <button
                      type="button"
                      onClick={() => addOther(group.title)}
                      disabled={saving || !(otherTextByGroup[group.title] || "").trim()}
                      className="rounded-lg border border-teal-500 px-4 py-2 text-sm font-semibold text-[var(--fl-accent-text)] hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  {otherRows.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {otherRows.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => removeSelection(item.id)}
                          className="rounded-full border border-yellow-500/60 bg-yellow-500/10 px-3 py-1 text-xs font-bold text-[var(--fl-warn-text)] hover:bg-yellow-500/20"
                        >
                          {item.custom_text} ×
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingOption && (
        <Modal title="Edit Checklist Option" subtitle={editingOption.groupTitle} onClose={() => setEditingOption(null)}>
          <input
            value={editingOption.nextLabel}
            onChange={(event) => setEditingOption((prev) => prev ? { ...prev, nextLabel: event.target.value } : prev)}
            className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
          />
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setEditingOption(null)} className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]">Cancel</button>
            <button type="button" onClick={saveOptionEdit} disabled={saving} className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50">Save Option</button>
          </div>
        </Modal>
      )}

      {addingOptionGroup && (
        <Modal title="Add Checklist Option" subtitle={addingOptionGroup} onClose={() => setAddingOptionGroup("")}>
          <input
            value={newOptionLabel}
            onChange={(event) => setNewOptionLabel(event.target.value)}
            placeholder="New option label..."
            className="mt-4 w-full rounded-xl border border-[var(--fl-line)] bg-[var(--fl-ground)] px-4 py-3 text-[var(--fl-text)] outline-none focus:border-teal-400"
          />
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setAddingOptionGroup("")} className="rounded-xl border border-[var(--fl-line)] px-5 py-3 font-bold text-[var(--fl-text)] hover:bg-[var(--fl-raised)]">Cancel</button>
            <button type="button" onClick={() => addOption(addingOptionGroup)} disabled={saving || !newOptionLabel.trim()} className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50">Add Option</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ChecklistOptionButton({
  label,
  selected,
  saving,
  onClick,
  onEdit,
  onDelete,
}: {
  label: string;
  selected: boolean;
  saving: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`rounded-xl border transition ${selected ? "border-teal-400 bg-teal-500/15 text-[var(--fl-accent-text)]" : "border-[var(--fl-line)] bg-[var(--fl-ground)] text-[var(--fl-text)] hover:border-teal-400"}`}>
      <button type="button" onClick={onClick} disabled={saving} className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${selected ? "border-teal-300 bg-teal-400 text-slate-950" : "border-white"}`}>
          {selected ? "✓" : ""}
        </span>
        <span className="min-w-0 flex-1 font-bold">{label}</span>
      </button>
      <div className="flex border-t border-[var(--fl-line)]">
        <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(); }} className="flex-1 px-3 py-2 text-xs font-bold text-[var(--fl-muted)] hover:bg-[var(--fl-raised)] hover:text-[var(--fl-accent-text)]">Edit</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(); }} className="flex-1 border-l border-[var(--fl-line)] px-3 py-2 text-xs font-bold text-[var(--fl-muted)] hover:bg-red-500/10 hover:text-[var(--fl-crit-text)]">Delete</button>
      </div>
    </div>
  );
}

function Modal({ title, subtitle, children, onClose }: any) {
  if (typeof document === "undefined") return null;

  // Portal to <body> so `position: fixed` centers to the viewport and can't be
  // thrown off (or hidden behind content) by a transformed ancestor in the
  // report editor. This is what makes it "pop up right on the screen".
  return createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/70 p-4 [touch-action:manipulation]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--fl-line)] bg-[var(--fl-surface)] p-5 text-[var(--fl-text)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-2xl font-semibold text-[var(--fl-accent-text)]">{title}</h3>
        {subtitle && <p className="mt-2 text-sm text-[var(--fl-muted)]">{subtitle}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default memo(SectionInformationChecklist);
