/**
 * IndexedDB-backed read cache (preload) for offline inspection viewing.
 *
 * Mirrors `lib/offlineInspectionPreload.ts` but stores data in IndexedDB:
 *  - per-inspection preload records in the `preload` object store, and
 *  - the reports index + sync-completion notice in the small `meta` store.
 *
 * All functions are async and SSR/build safe (no IndexedDB access at import
 * time; every function no-ops when there is no browser database).
 */

import {
  getDb,
  PRELOAD_STORE,
  META_STORE,
  META_REPORTS_INDEX_KEY,
  META_LAST_SYNC_NOTICE_KEY,
  type CachedInspection,
  type CachedInspectionPreload,
} from "./db";

export type {
  CachedInspection,
  CachedInspectionPreload,
} from "./db";

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

function cleanId(value: any) {
  return String(value || "").trim();
}

// ---------------------------------------------------------------------------
// Normalization (identical logic to the old module)
// ---------------------------------------------------------------------------

export function getInspectionLabel(inspection: any): string {
  return (
    inspection?.address ||
    inspection?.property_address ||
    inspection?.inspection_address ||
    inspection?.client_name ||
    inspection?.name ||
    `Inspection ${inspection?.id || ""}`
  )
    .toString()
    .trim();
}

function normalizeInspection(inspection: any): CachedInspection {
  const id = cleanId(inspection?.id);
  return {
    id,
    label: getInspectionLabel(inspection),
    client_name: inspection?.client_name || inspection?.client || "",
    client_email: inspection?.client_email || inspection?.email || "",
    address:
      inspection?.address ||
      inspection?.property_address ||
      inspection?.inspection_address ||
      "",
    raw: inspection,
    cachedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Reports index (stored in the `meta` store under META_REPORTS_INDEX_KEY)
// ---------------------------------------------------------------------------

export async function getPreloadIndex(): Promise<CachedInspection[]> {
  const db = await getDb();
  if (!db) return [];
  const value = await db.get(META_STORE, META_REPORTS_INDEX_KEY);
  return Array.isArray(value) ? value : [];
}

export async function savePreloadIndex(
  reports: any[],
): Promise<CachedInspection[]> {
  const normalized = (reports || [])
    .map(normalizeInspection)
    .filter((item) => item.id);

  const db = await getDb();
  if (!db) return normalized;

  await db.put(META_STORE, normalized, META_REPORTS_INDEX_KEY);
  return normalized;
}

// ---------------------------------------------------------------------------
// Per-inspection preload record
// ---------------------------------------------------------------------------

export async function getCachedInspectionPreload(
  inspectionId: string,
): Promise<CachedInspectionPreload | null> {
  const id = cleanId(inspectionId);
  if (!id) return null;
  const db = await getDb();
  if (!db) return null;
  const value = await db.get(PRELOAD_STORE, id);
  return value?.inspectionId ? value : null;
}

export async function saveInspectionPreload({
  inspectionId,
  inspection,
  reports,
  comments = [],
  templates = [],
  sections = [],
  findings = [],
  groupedFindings = [],
  clientInfo = {},
  reportSnapshot = {},
}: {
  inspectionId: string;
  inspection?: any;
  reports: any[];
  comments?: any[];
  templates?: any[];
  sections?: string[];
  findings?: any[];
  groupedFindings?: any[];
  clientInfo?: Record<string, any>;
  reportSnapshot?: Record<string, any>;
}): Promise<CachedInspectionPreload | null> {
  const id = cleanId(inspectionId);
  if (!id) return null;

  const index = await savePreloadIndex(reports || []);
  const cachedInspection =
    (inspection
      ? normalizeInspection(inspection)
      : index.find((item) => item.id === id)) || undefined;

  const payload: CachedInspectionPreload = {
    inspectionId: id,
    inspection: cachedInspection,
    reports: index,
    // IndexedDB has far more room than localStorage, but keep the same generous
    // caps as the old module so a single record can't grow unbounded.
    comments: Array.isArray(comments) ? comments.slice(0, 500) : [],
    templates: Array.isArray(templates) ? templates.slice(0, 500) : [],
    sections: Array.isArray(sections) ? sections : [],
    findings: Array.isArray(findings) ? findings.slice(0, 500) : [],
    groupedFindings: Array.isArray(groupedFindings) ? groupedFindings : [],
    clientInfo: clientInfo || {},
    reportSnapshot: reportSnapshot || {},
    cachedAt: new Date().toISOString(),
  };

  const db = await getDb();
  if (!db) return payload;

  await db.put(PRELOAD_STORE, payload);

  const win = safeWindow();
  win?.dispatchEvent(
    new CustomEvent("opi:inspection-preload-updated", {
      detail: { inspectionId: id, cachedAt: payload.cachedAt },
    }),
  );

  return payload;
}

/** Remove a single inspection's preload record. */
export async function removeInspectionPreload(
  inspectionId: string,
): Promise<void> {
  const id = cleanId(inspectionId);
  if (!id) return;
  const db = await getDb();
  if (!db) return;
  await db.delete(PRELOAD_STORE, id);
}

// ---------------------------------------------------------------------------
// Reports-index convenience wrappers (mirror old names)
// ---------------------------------------------------------------------------

export async function cacheReportsForOffline(reports: any[]) {
  return savePreloadIndex(reports || []);
}

export async function getCachedReportsForOffline() {
  return getPreloadIndex();
}

export async function getCachedReportById(inspectionId: string) {
  const id = cleanId(inspectionId);
  const index = await getPreloadIndex();
  return index.find((inspection) => inspection.id === id) || null;
}

// ---------------------------------------------------------------------------
// Sync-completion notice (stored in `meta`)
// ---------------------------------------------------------------------------

export async function saveSyncCompletionNotice(notice: {
  inspectionId?: string;
  label?: string;
  synced?: number;
  failed?: number;
  aiProcessed?: number;
}): Promise<void> {
  const payload = { ...notice, createdAt: new Date().toISOString() };

  const db = await getDb();
  if (db) {
    await db.put(META_STORE, payload, META_LAST_SYNC_NOTICE_KEY);
  }

  const win = safeWindow();
  win?.dispatchEvent(
    new CustomEvent("opi:sync-completion-notice", { detail: payload }),
  );
}

export async function getLastSyncCompletionNotice(): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;
  const value = await db.get(META_STORE, META_LAST_SYNC_NOTICE_KEY);
  return value ?? null;
}
