export type TimelineEventTone =
  | "info"
  | "success"
  | "warning"
  | "critical"
  | "ai";

export type InspectionTimelineEvent = {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  system?: string;
  tone: TimelineEventTone;
  source:
    | "inspection"
    | "finding"
    | "equipment"
    | "photo"
    | "view"
    | "ai";
  metadata?: Record<string, any>;
};

export type InspectionTimelineResult = {
  events: InspectionTimelineEvent[];
  highlights: string[];
  nextActions: string[];
  findingCount: number;
  equipmentCount: number;
  photoCount: number;
};

function cleanText(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lowerText(value: any) {
  return cleanText(value).toLowerCase();
}

function normalizeSection(value: any) {
  const clean = cleanText(value);
  if (!clean) return "General";

  const aliases: Record<string, string> = {
    General: "Inspection Details",
    Safety: "Inspection Details",
    "Basement/Foundation/Crawlspace & Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Basement, Foundation, Crawlspace and Structure":
      "Basement, Foundation, Crawlspace & Structure",
    "Attic/Insulation & Ventilation": "Attic, Insulation & Ventilation",
    "Attic, Insulation and Ventilation": "Attic, Insulation & Ventilation",
    "Doors/Windows & Interior": "Doors, Windows & Interior",
    "Doors, Windows and Interior": "Doors, Windows & Interior",
    Appliances: "Built-in Appliances",
    "Built In Appliances": "Built-in Appliances",
  };

  return aliases[clean] || clean;
}

function getTimestamp(...values: any[]) {
  for (const value of values) {
    const clean = cleanText(value);
    if (!clean) continue;

    const date = new Date(clean);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return new Date().toISOString();
}

function findingTone(finding: any): TimelineEventTone {
  const severity = lowerText(finding?.severity);

  if (severity.includes("safety") || severity.includes("major")) return "critical";
  if (severity.includes("repair")) return "warning";
  if (severity.includes("maintenance") || severity.includes("monitor")) return "info";
  return "success";
}

function equipmentTone(item: any): TimelineEventTone {
  const text = lowerText([
    item?.condition,
    item?.equipment_status,
    item?.equipmentStatus,
    item?.severity,
  ].join(" "));

  if (text.includes("failed") || text.includes("unsafe") || text.includes("not operating")) {
    return "critical";
  }

  if (
    text.includes("service") ||
    text.includes("repair") ||
    text.includes("near end") ||
    text.includes("older") ||
    text.includes("monitor")
  ) {
    return "warning";
  }

  return "success";
}

function event(
  id: string,
  timestamp: string,
  title: string,
  description: string,
  source: InspectionTimelineEvent["source"],
  tone: TimelineEventTone,
  system?: string,
  metadata?: Record<string, any>
): InspectionTimelineEvent {
  return {
    id,
    timestamp,
    title,
    description,
    source,
    tone,
    system,
    metadata,
  };
}

function hasFindingText(findings: any[], terms: string[]) {
  const text = findings
    .map((finding) =>
      [
        finding?.title,
        finding?.section,
        finding?.severity,
        finding?.observation,
        finding?.implication,
        finding?.recommendation,
      ]
        .map(cleanText)
        .join(" ")
    )
    .join(" ")
    .toLowerCase();

  return terms.some((term) => text.includes(term));
}

export class InspectionTimelineEngine {
  build({
    inspection,
    findings = [],
    equipment = [],
    photos = [],
    viewEvents = [],
  }: {
    inspection?: any;
    findings?: any[];
    equipment?: any[];
    photos?: any[];
    viewEvents?: any[];
  }): InspectionTimelineResult {
    const events: InspectionTimelineEvent[] = [];
    const highlights: string[] = [];
    const nextActions: string[] = [];

    if (inspection) {
      events.push(
        event(
          `inspection-created-${inspection.id || "current"}`,
          getTimestamp(inspection.created_at, inspection.inspection_date, inspection.updated_at),
          "Inspection started",
          cleanText(inspection.address || inspection.property_address || "Inspection record created."),
          "inspection",
          "info",
          "General",
          { inspectionId: inspection.id }
        )
      );
    }

    (findings || []).forEach((finding, index) => {
      const title = cleanText(finding?.title || finding?.observation || "Finding added");
      const section = normalizeSection(finding?.section || finding?.section_name);
      const severity = cleanText(finding?.severity || "Finding");

      events.push(
        event(
          `finding-${finding?.id || index}`,
          getTimestamp(finding?.created_at, finding?.updated_at, inspection?.created_at),
          title,
          `${severity}${section ? ` • ${section}` : ""}`,
          "finding",
          findingTone(finding),
          section,
          {
            findingId: finding?.id,
            severity,
          }
        )
      );
    });

    (equipment || []).forEach((item, index) => {
      const name =
        cleanText([item?.manufacturer, item?.equipment_type || item?.equipmentType, item?.model].filter(Boolean).join(" ")) ||
        cleanText(item?.equipment_type || item?.equipmentType) ||
        "Equipment documented";

      const section = normalizeSection(item?.section);

      events.push(
        event(
          `equipment-${item?.id || index}`,
          getTimestamp(item?.created_at, item?.updated_at, inspection?.created_at),
          "Equipment documented",
          name,
          "equipment",
          equipmentTone(item),
          section === "General" ? undefined : section,
          {
            equipmentId: item?.id,
            type: item?.equipment_type || item?.equipmentType,
          }
        )
      );
    });

    (photos || []).forEach((photo, index) => {
      events.push(
        event(
          `photo-${photo?.id || index}`,
          getTimestamp(photo?.created_at, photo?.updated_at, inspection?.created_at),
          "Media attached",
          "Photo/video was added to a finding.",
          "photo",
          "success",
          undefined,
          {
            findingId: photo?.finding_id,
          }
        )
      );
    });

    (viewEvents || []).forEach((row, index) => {
      const type = cleanText(row?.view_type || "view_event");
      const title =
        type === "client_portal"
          ? "Client portal opened"
          : type === "report_share"
            ? "Shared report opened"
            : type === "environmental_share"
              ? "Environmental report opened"
              : type === "email_open"
                ? "Email opened"
                : "Report activity tracked";

      events.push(
        event(
          `view-${row?.id || index}`,
          getTimestamp(row?.created_at),
          title,
          cleanText(row?.viewer_email || row?.viewer_role || type),
          "view",
          "info",
          undefined,
          {
            viewType: type,
            viewerEmail: row?.viewer_email || null,
          }
        )
      );
    });

    if (hasFindingText(findings, ["roof", "leak", "stain", "attic", "ceiling", "moisture"])) {
      events.push(
        event(
          "ai-roof-moisture-follow-up",
          new Date().toISOString(),
          "AI follow-up suggested",
          "Roof, attic, ceiling, or moisture language detected. Review whether these findings are related.",
          "ai",
          "ai",
          "Roof"
        )
      );
      nextActions.push("Review roof/attic/interior moisture findings for a common source.");
    }

    if (hasFindingText(findings, ["negative grade", "grading", "foundation", "basement", "efflorescence", "water intrusion"])) {
      events.push(
        event(
          "ai-foundation-drainage-follow-up",
          new Date().toISOString(),
          "AI relationship suggested",
          "Exterior drainage and foundation/basement moisture language may be connected.",
          "ai",
          "ai",
          "Basement, Foundation, Crawlspace & Structure"
        )
      );
      nextActions.push("Review drainage and basement/foundation moisture comments for consistency.");
    }

    if (hasFindingText(findings, ["garage"]) && !hasFindingText(findings, ["auto reverse", "auto-reverse", "photo eye", "sensor", "resistance"])) {
      events.push(
        event(
          "ai-garage-auto-reverse-reminder",
          new Date().toISOString(),
          "AI reminder",
          "Garage appears documented, but auto-reverse language was not detected.",
          "ai",
          "warning",
          "Garage"
        )
      );
      nextActions.push("Confirm garage auto-reverse / sensor testing or add a limitation.");
    }

    const sortedEvents = events
      .filter((item) => item.timestamp)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      .slice(-80)
      .reverse();

    if ((findings || []).length > 0) {
      highlights.push(`${findings.length} finding${findings.length === 1 ? "" : "s"} saved.`);
    }

    if ((equipment || []).length > 0) {
      highlights.push(`${equipment.length} equipment record${equipment.length === 1 ? "" : "s"} documented.`);
    }

    if ((photos || []).length > 0) {
      highlights.push(`${photos.length} media item${photos.length === 1 ? "" : "s"} attached.`);
    }

    if (nextActions.length === 0) {
      nextActions.push("Continue inspecting and saving findings. AI will surface follow-up items as data is added.");
    }

    return {
      events: sortedEvents,
      highlights,
      nextActions: Array.from(new Set(nextActions)).slice(0, 8),
      findingCount: (findings || []).length,
      equipmentCount: (equipment || []).length,
      photoCount: (photos || []).length,
    };
  }
}

export const inspectionTimelineEngine = new InspectionTimelineEngine();
