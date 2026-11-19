// Renaming an agreement service type (Agreements page): a custom type has no
// table of its own — it exists because templates carry it — so renaming means
// moving every template with the old type to the new one. Renaming onto an
// existing type merges the two. Pure helpers.

export function slugServiceType(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "")
    .slice(0, 40);
}

/** Templates whose service type is `type` (compared by slug, like the filter). */
export function templatesUsingServiceType<T extends { service_type?: string | null; template_type?: string | null }>(
  templates: T[],
  type: string,
): T[] {
  const target = slugServiceType(type);
  if (!target) return [];
  return templates.filter((t) => slugServiceType(String(t?.service_type || t?.template_type || "")) === target);
}

/** The new slug for a rename, or "" when it's blank or unchanged. */
export function renameTarget(from: string, typedName: string): string {
  const next = slugServiceType(typedName);
  return next && next !== slugServiceType(from) ? next : "";
}
