// Custom checklist FIELDS for sections the inspector adds (e.g. "Shed"), plus
// the merged field vocabulary the AI reads so it recognizes them.
//
// Storage reuses section_checklist_options (no new table / migration):
//   - a custom OPTION is a row with option_label "__CUSTOM__:<label>" (existing
//     "+ Add Option" behavior),
//   - a custom FIELD is a marker row with option_label "__FIELD__" whose
//     group_title is the field name, scoped like options (by section name +
//     inspector), so a field defined once shows on every job with that section.
// Selections stay in section_checklist_selections keyed by group_title, so the
// report, share page, print page and PDF render custom fields with no changes.

import { CHECKLIST_LIBRARY, type ChecklistGroup } from "./checklistLibrary";
import { MATERIAL_FIELDS, type MaterialField } from "./ai/checklistAutofill";

export const CUSTOM_FIELD_MARKER = "__FIELD__";
export const CUSTOM_OPTION_PREFIX = "__CUSTOM__:";
// The single free group a custom section always had before fields existed.
// Kept so options already added to it never disappear.
export const LEGACY_CUSTOM_GROUP = "Custom Info";

export type ChecklistOptionRow = {
  section: string;
  group_title: string;
  option_label: string;
  replacement_label?: string | null;
  hidden?: boolean | null;
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** True for the built-in sections that have a preset checklist. */
export function hasBuiltInChecklist(section: string): boolean {
  return Boolean(CHECKLIST_LIBRARY[section]);
}

/** Display labels of the custom options added to one field, in row order. */
export function customOptionLabels(rows: ChecklistOptionRow[], section: string, groupTitle: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows || []) {
    if (r.section !== section || r.group_title !== groupTitle || r.hidden) continue;
    if (!String(r.option_label || "").startsWith(CUSTOM_OPTION_PREFIX)) continue;
    const label = String(r.replacement_label || r.option_label.slice(CUSTOM_OPTION_PREFIX.length)).trim();
    if (label && !seen.has(norm(label))) {
      seen.add(norm(label));
      out.push(label);
    }
  }
  return out;
}

/** The inspector-defined field names for a section, in creation (row) order. */
export function customFieldTitles(rows: ChecklistOptionRow[], section: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows || []) {
    if (r.section !== section || r.option_label !== CUSTOM_FIELD_MARKER || r.hidden) continue;
    const title = String(r.group_title || "").trim();
    if (title && !seen.has(norm(title))) {
      seen.add(norm(title));
      out.push(title);
    }
  }
  return out;
}

/**
 * Checklist groups for a section WITHOUT a preset checklist (a custom section):
 * the inspector's fields, then the legacy "Custom Info" group when it already
 * holds options (or when there are no fields yet, so the section is never
 * empty). Options are filled in for AI use; the builder UI renders custom
 * options from the rows itself.
 */
export function customSectionGroups(section: string, rows: ChecklistOptionRow[]): ChecklistGroup[] {
  const groups: ChecklistGroup[] = customFieldTitles(rows, section)
    .filter((title) => norm(title) !== norm(LEGACY_CUSTOM_GROUP))
    .map((title) => ({ title, options: customOptionLabels(rows, section, title) }));
  const legacyOptions = customOptionLabels(rows, section, LEGACY_CUSTOM_GROUP);
  if (legacyOptions.length || groups.length === 0) {
    groups.push({ title: LEGACY_CUSTOM_GROUP, options: legacyOptions });
  }
  return groups;
}

/** Adds the inspector's custom options to each field's option list (no dupes). */
function withCustomOptions<T extends { options: string[] }>(
  section: string,
  groups: T[],
  titleOf: (g: T) => string,
  rows: ChecklistOptionRow[],
): T[] {
  return groups.map((g) => {
    const extra = customOptionLabels(rows, section, titleOf(g)).filter(
      (label) => !g.options.some((o) => norm(o) === norm(label)),
    );
    return extra.length ? { ...g, options: [...g.options, ...extra] } : g;
  });
}

/**
 * The fields the photo AI may fill for a section: the built-in photo-readable
 * fields (plus the inspector's own added options), or — for a custom section —
 * every custom field the inspector defined. Empty when there's nothing to fill.
 */
export function materialFieldsFor(section: string, rows: ChecklistOptionRow[]): MaterialField[] {
  const builtIn = MATERIAL_FIELDS[section];
  if (builtIn) return withCustomOptions(section, builtIn, (g) => g.groupTitle, rows);
  if (hasBuiltInChecklist(section)) return [];
  return customSectionGroups(section, rows)
    // An empty legacy "Custom Info" box is a placeholder, not a real field.
    .filter((g) => !(g.title === LEGACY_CUSTOM_GROUP && g.options.length === 0))
    .map((g) => ({ groupTitle: g.title, options: g.options }));
}

/** Photo-fillable fields for several sections, keyed by section (empty ones omitted). */
export function materialFieldMap(sections: string[], rows: ChecklistOptionRow[]): Record<string, MaterialField[]> {
  const out: Record<string, MaterialField[]> = {};
  for (const s of sections || []) {
    const fields = materialFieldsFor(s, rows);
    if (fields.length) out[s] = fields;
  }
  return out;
}

/**
 * The full checklist vocabulary (every field, for voice fill): the built-in
 * library with the inspector's added options, plus each custom section in
 * `sections` with its custom fields.
 */
export function checklistLibraryWithCustom(
  sections: string[],
  rows: ChecklistOptionRow[],
): Record<string, ChecklistGroup[]> {
  const out: Record<string, ChecklistGroup[]> = {};
  for (const [section, groups] of Object.entries(CHECKLIST_LIBRARY)) {
    out[section] = withCustomOptions(
      section,
      groups.map((g) => ({ ...g, options: [...(g.options || [])] })),
      (g) => g.title,
      rows,
    );
  }
  for (const s of sections || []) {
    if (out[s]) continue;
    const groups = customSectionGroups(s, rows).filter(
      (g) => !(g.title === LEGACY_CUSTOM_GROUP && g.options.length === 0),
    );
    if (groups.length) out[s] = groups;
  }
  return out;
}

/**
 * Load the acting inspector's checklist option rows (their own + legacy
 * unscoped rows, same scope the builder reads). Tolerant: [] on any error.
 */
export async function loadChecklistOptionRows(
  db: { from: (t: string) => any },
  inspectorId: string | null | undefined,
): Promise<ChecklistOptionRow[]> {
  try {
    let q = db
      .from("section_checklist_options")
      .select("section, group_title, option_label, replacement_label, hidden");
    q = inspectorId ? q.or(`inspector_id.eq.${inspectorId},inspector_id.is.null`) : q.is("inspector_id", null);
    const { data } = await q.order("created_at", { ascending: true });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
