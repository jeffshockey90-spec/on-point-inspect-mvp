export type CachedInspection = {
  id: string;
  label: string;
  client_name?: string;
  client_email?: string;
  address?: string;
  raw?: any;
  cachedAt: string;
};

export type CachedInspectionPreload = {
  inspectionId: string;
  inspection?: CachedInspection;
  reports: CachedInspection[];
  comments: any[];
  templates: any[];
  sections: string[];
  findings: any[];
  groupedFindings?: any[];
  clientInfo: Record<string, any>;
  reportSnapshot?: Record<string, any>;
  cachedAt: string;
};

const CACHE_PREFIX = "opi-offline-inspection-preload";
const INDEX_KEY = "opi-offline-inspection-preload-index";
const LAST_SYNC_NOTICE_KEY = "opi-last-sync-notice";

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

function keyForInspection(inspectionId: string) {
  return `${CACHE_PREFIX}-${inspectionId}`;
}

function cleanId(value: any) {
  return String(value || "").trim();
}

export function getInspectionLabel(inspection: any) {
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

export function getPreloadIndex(): CachedInspection[] {
  const win = safeWindow();
  if (!win) return [];

  try {
    const raw = win.localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePreloadIndex(reports: any[]) {
  const win = safeWindow();
  if (!win) return [];

  const normalized = (reports || [])
    .map(normalizeInspection)
    .filter((item) => item.id);

  try {
    win.localStorage.setItem(INDEX_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore cache write failures. The app should keep working online.
  }

  return normalized;
}

export function getCachedInspectionPreload(
  inspectionId: string,
): CachedInspectionPreload | null {
  const win = safeWindow();
  const id = cleanId(inspectionId);
  if (!win || !id) return null;

  try {
    const raw = win.localStorage.getItem(keyForInspection(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.inspectionId ? parsed : null;
  } catch {
    return null;
  }
}

export function saveInspectionPreload({
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
}) {
  const win = safeWindow();
  const id = cleanId(inspectionId);
  if (!win || !id) return null;

  const index = savePreloadIndex(reports || []);
  const cachedInspection =
    (inspection ? normalizeInspection(inspection) : index.find((item) => item.id === id)) ||
    undefined;

  const payload: CachedInspectionPreload = {
    inspectionId: id,
    inspection: cachedInspection,
    reports: index,
    comments: Array.isArray(comments) ? comments.slice(0, 500) : [],
    templates: Array.isArray(templates) ? templates.slice(0, 500) : [],
    sections: Array.isArray(sections) ? sections : [],
    findings: Array.isArray(findings) ? findings.slice(0, 500) : [],
    groupedFindings: Array.isArray(groupedFindings) ? groupedFindings : [],
    clientInfo: clientInfo || {},
    reportSnapshot: reportSnapshot || {},
    cachedAt: new Date().toISOString(),
  };

  try {
    win.localStorage.setItem(keyForInspection(id), JSON.stringify(payload));
    win.dispatchEvent(
      new CustomEvent("opi:inspection-preload-updated", {
        detail: { inspectionId: id, cachedAt: payload.cachedAt },
      }),
    );
  } catch {
    // If the browser storage is full, keep the smaller index at least.
  }

  return payload;
}

export function cacheReportsForOffline(reports: any[]) {
  return savePreloadIndex(reports || []);
}

export function getCachedReportsForOffline() {
  return getPreloadIndex();
}

export function getCachedReportById(inspectionId: string) {
  const id = cleanId(inspectionId);
  return getPreloadIndex().find((inspection) => inspection.id === id) || null;
}

export function saveSyncCompletionNotice(notice: {
  inspectionId?: string;
  label?: string;
  synced?: number;
  failed?: number;
  aiProcessed?: number;
}) {
  const win = safeWindow();
  if (!win) return;

  const payload = {
    ...notice,
    createdAt: new Date().toISOString(),
  };

  try {
    win.localStorage.setItem(LAST_SYNC_NOTICE_KEY, JSON.stringify(payload));
  } catch {}

  win.dispatchEvent(new CustomEvent("opi:sync-completion-notice", { detail: payload }));
}

export function getLastSyncCompletionNotice() {
  const win = safeWindow();
  if (!win) return null;

  try {
    const raw = win.localStorage.getItem(LAST_SYNC_NOTICE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
