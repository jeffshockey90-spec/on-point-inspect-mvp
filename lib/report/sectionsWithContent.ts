// Sections to render for a per-section map (limitations, reference photos,
// checklists): the report's active sections that have content, in order, PLUS
// any other section that still holds content (e.g. one hidden by service mode,
// deleted after capture, or an offline item filed under a default section).
// Rendering only the active list silently dropped those items from the client
// report and print/PDF, while findings already had an "Other" fallback.
export function sectionsWithContent(
  activeOrder: string[],
  bySection: Record<string, unknown> | null | undefined,
): string[] {
  const map = bySection || {};
  const has = (section: string) => {
    const value = (map as any)[section];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return Boolean(value);
  };
  const active = activeOrder.filter(has);
  const extra = Object.keys(map).filter((section) => !activeOrder.includes(section) && has(section));
  return [...active, ...extra];
}
