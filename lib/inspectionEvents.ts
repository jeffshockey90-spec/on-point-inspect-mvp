export const INSPECTION_DATA_CHANGED_EVENT = "opi:inspection-data-changed";
export const OFFLINE_SYNC_COMPLETE_EVENT = "opi:offline-sync-complete";

export type InspectionDataChangeDetail = {
  inspectionId?: string;
  section?: string;
  source?: string;
  types?: string[];
  synced?: number;
  failed?: number;
  remaining?: number;
};

export function dispatchInspectionDataChanged(detail: InspectionDataChangeDetail = {}) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<InspectionDataChangeDetail>(INSPECTION_DATA_CHANGED_EVENT, {
      detail,
    }),
  );
}

export function matchesInspectionEvent(
  event: Event,
  inspectionId: string,
  section?: string,
) {
  const detail = (event as CustomEvent<InspectionDataChangeDetail>)?.detail || {};
  const eventInspectionId = String(detail.inspectionId || "");
  const eventSection = String(detail.section || "");

  if (eventInspectionId && eventInspectionId !== String(inspectionId)) return false;
  if (section && eventSection && eventSection !== String(section)) return false;

  return true;
}
