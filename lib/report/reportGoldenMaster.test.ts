// Report golden master (logic layer).
//
// Runs the synthetic fixture through EVERY shared report helper and snapshots
// the computed output. This is the safety net for the report-render
// unification: when a Tier-1/Tier-2 refactor moves rendering logic into
// lib/report/* or lib/environmental/*, any change to what a surface COMPUTES
// (severity bucket, section name, service detection, radon band, checklist
// custom-text handling, equipment notes) shows up here as a snapshot diff.
//
// If a diff is intentional, review it line-by-line, then `vitest -u` to accept.
// An UNEXPECTED diff means a refactor silently changed client-facing output.
//
// Scope: this nets the shared pure logic, which is where the "all N surfaces
// must match" bugs live. It does NOT net JSX/markup — for that, run the
// on-demand HTML harness (scripts/report-golden-master.mjs) on refactor day.

import { describe, it, expect } from "vitest";
import { normalizeSection } from "./normalizeSection";
import { severityBucket } from "./severityBucket";
import {
  isKnownEquipmentValue,
  getTypicalIndustryRange,
  getEquipmentConditionNote,
  getEquipmentInspectorNote,
  getEquipmentMaintenanceNote,
} from "./equipmentInfo";
import {
  hasRadonService,
  hasMoldService,
  getReportTitle,
} from "../environmental/service";
import { classifyRadon, radonSummary } from "../environmental/radon";
import {
  SAMPLE_INSPECTION,
  SERVICE_CASES,
  RADON_AVERAGES,
  SEVERITIES,
  SECTIONS,
  CHECKLIST_ROWS,
  EQUIPMENT_VALUES,
} from "./__fixtures__/sampleInspection";

// The canonical checklist custom-text contract, matching share / print /
// client-portal / PDF (case-insensitive sentinel, blank custom text dropped).
// Kept here as the pinned behavior; extract to a helper during Tier-2 and point
// both this harness and the surfaces at it.
function checklistDisplay(row: { value: string; custom_text: string }) {
  const isCustom =
    row.value === "__TEXT_VALUE__" ||
    String(row.value || "").toUpperCase() === "OTHER";
  const val = isCustom ? String(row.custom_text || "").trim() : String(row.value || "").trim();
  return val || null; // null = row is dropped from the rendered report
}

describe("report golden master (logic layer)", () => {
  it("computes a stable snapshot across all shared report helpers", () => {
    const snapshot = {
      sampleInspection: {
        reportTitle: getReportTitle(SAMPLE_INSPECTION),
        hasRadon: hasRadonService(SAMPLE_INSPECTION),
        hasMold: hasMoldService(SAMPLE_INSPECTION),
      },
      serviceDetection: SERVICE_CASES.map((c) => ({
        label: c.label,
        radon: hasRadonService(c.inspection),
        mold: hasMoldService(c.inspection),
        title: getReportTitle(c.inspection),
      })),
      radon: RADON_AVERAGES.map((avg) => ({
        avg,
        band: classifyRadon(avg),
        summary: radonSummary(avg),
      })),
      severityBuckets: SEVERITIES.map((s) => ({
        severity: s,
        bucket: severityBucket(s),
      })),
      sectionNames: SECTIONS.map((s) => ({
        raw: s,
        normalized: normalizeSection(s),
      })),
      checklist: CHECKLIST_ROWS.map((r) => ({
        value: r.value,
        custom_text: r.custom_text,
        display: checklistDisplay(r),
      })),
      equipment: EQUIPMENT_VALUES.map((v) => ({
        value: v,
        known: isKnownEquipmentValue(v),
        range: getTypicalIndustryRange(v),
        condition: getEquipmentConditionNote(v),
        inspectorNote: getEquipmentInspectorNote({ value: v }),
        maintenanceNote: getEquipmentMaintenanceNote({ value: v }),
      })),
    };

    expect(snapshot).toMatchSnapshot();
  });
});
