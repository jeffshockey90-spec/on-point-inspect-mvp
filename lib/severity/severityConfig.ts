// Per-company custom severity levels. The AI still works in the 6 canonical
// severities internally; this config is the DISPLAY + PICKER layer on top —
// inspectors rename them, recolor them, reorder them, and add their own, with a
// one-click revert to defaults. Stored server-side (company_severity_settings)
// so it follows the user across every device.
//
// Findings keep storing the severity LABEL string (no data migration). The
// resolver maps any stored value -> its level by label, then by id, then by a
// substring fallback to one of the 6 canonical bases — so AI output and legacy
// findings always resolve to a sane color/rank/critical flag even after renames.

export type SeverityLevel = {
  id: string;        // stable slug; the 6 defaults use the canonical base ids
  label: string;     // display name (editable)
  color: string;     // hex, e.g. "#dc2626"
  critical: boolean; // counts as a safety/major concern (summary + publish gating)
};

export type SeverityConfig = { levels: SeverityLevel[] };

// Ordered least -> most serious. `id` values double as the canonical "base" a
// renamed/legacy value falls back to, so they must stay stable.
export const DEFAULT_SEVERITY_LEVELS: SeverityLevel[] = [
  { id: "informational", label: "Informational", color: "#2563eb", critical: false },
  { id: "monitor", label: "Monitor", color: "#0d9488", critical: false },
  { id: "maintenance", label: "Maintenance", color: "#ca8a04", critical: false },
  { id: "recommended-repair", label: "Recommended Repair", color: "#ea580c", critical: false },
  { id: "safety-concern", label: "Safety Concern", color: "#dc2626", critical: true },
  { id: "major-concern", label: "Major Concern", color: "#b91c1c", critical: true },
];

export const DEFAULT_SEVERITY_CONFIG: SeverityConfig = { levels: DEFAULT_SEVERITY_LEVELS };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "level";
}

// Maps any severity string to one of the 6 canonical base ids via substring —
// mirrors the historic normalizeSeverity() so AI output and legacy values land
// on the right default level even when labels were renamed.
export function baseSeverityId(value: unknown): string {
  const v = clean(value).toLowerCase();
  if (!v) return "recommended-repair";
  if (v.includes("major")) return "major-concern";
  if (v.includes("safety") || v.includes("hazard") || v.includes("danger")) return "safety-concern";
  if (v.includes("monitor")) return "monitor";
  if (v.includes("maintenance") || v.includes("service") || v.includes("upkeep")) return "maintenance";
  if (v.includes("info")) return "informational";
  if (v.includes("repair") || v.includes("defic") || v.includes("concern")) return "recommended-repair";
  return "recommended-repair";
}

// Defensively coerce a stored/blob config into a valid one, always non-empty.
export function normalizeSeverityConfig(raw: any): SeverityConfig {
  const levels = Array.isArray(raw?.levels) ? raw.levels : [];
  const seen = new Set<string>();
  const out: SeverityLevel[] = [];

  for (const item of levels) {
    const label = clean(item?.label);
    if (!label) continue;
    let id = clean(item?.id) || slugify(label);
    while (seen.has(id)) id = `${id}-x`;
    seen.add(id);
    const color = HEX_RE.test(clean(item?.color)) ? clean(item.color) : "#ea580c";
    out.push({ id, label, color, critical: Boolean(item?.critical) });
  }

  if (out.length === 0) return { levels: DEFAULT_SEVERITY_LEVELS.map((l) => ({ ...l })) };
  return { levels: out };
}

// The heart: resolve any stored severity value to its configured level.
export function resolveSeverity(config: SeverityConfig | null | undefined, value: unknown): SeverityLevel {
  const levels = config?.levels?.length ? config.levels : DEFAULT_SEVERITY_LEVELS;
  const v = clean(value);
  const vl = v.toLowerCase();

  // 1) exact label match (case-insensitive)
  const byLabel = levels.find((l) => l.label.toLowerCase() === vl);
  if (byLabel) return byLabel;

  // 2) exact id match
  const byId = levels.find((l) => l.id.toLowerCase() === vl);
  if (byId) return byId;

  // 3) fall back to the canonical base id (handles AI output + renamed defaults)
  const baseId = baseSeverityId(v);
  const byBase = levels.find((l) => l.id === baseId);
  if (byBase) return byBase;

  // 4) last resort: nearest default definition
  return DEFAULT_SEVERITY_LEVELS.find((l) => l.id === baseId) || DEFAULT_SEVERITY_LEVELS[3];
}

export function severityLabel(config: SeverityConfig, value: unknown): string {
  return resolveSeverity(config, value).label;
}
export function severityColor(config: SeverityConfig, value: unknown): string {
  return resolveSeverity(config, value).color;
}
export function severityIsCritical(config: SeverityConfig, value: unknown): boolean {
  return resolveSeverity(config, value).critical;
}
// Rank = position in the ordered list (higher index = more serious). Unknown -> -1.
export function severityRank(config: SeverityConfig, value: unknown): number {
  const levels = config?.levels?.length ? config.levels : DEFAULT_SEVERITY_LEVELS;
  const level = resolveSeverity(config, value);
  return levels.findIndex((l) => l.id === level.id);
}
// Ordered labels for a severity <select>.
export function severityOptions(config: SeverityConfig): string[] {
  return (config?.levels?.length ? config.levels : DEFAULT_SEVERITY_LEVELS).map((l) => l.label);
}

// Inline badge styling from the level's hex (works for custom colors; the tint
// is the color at low alpha so one hex drives text + soft background + border).
export function severityBadgeStyle(config: SeverityConfig, value: unknown): { color: string; background: string; border: string } {
  const hex = severityColor(config, value);
  return { color: hex, background: `${hex}1f`, border: `${hex}66` };
}
