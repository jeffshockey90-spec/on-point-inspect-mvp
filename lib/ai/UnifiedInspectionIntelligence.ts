import { buildInspectionGraph, formatInspectionGraphForPrompt } from "./InspectionGraph";
import { houseMemory } from "./HouseMemory";
import { houseRelationshipEngine } from "./HouseRelationshipEngine";
import { inspectionCompleteness } from "./InspectionCompleteness";
import { inspectionCopilot } from "./InspectionCopilot";
import { learningEngine } from "./LearningEngine";

export type UnifiedInspectionInput = {
  inspection: any;
  findings?: any[];
  equipment?: any[];
  photos?: any[];
  limitations?: any[];
  referencePhotos?: any[];
  checklist?: any[];
  memoryEvents?: any[];
  question?: string;
};

export type UnifiedInspectionIntelligence = {
  generatedAt: string;
  graph: ReturnType<typeof buildInspectionGraph>;
  graphPrompt: string;
  memory: ReturnType<typeof houseMemory.buildFromInspection>;
  relationships: ReturnType<typeof houseRelationshipEngine.analyze>;
  completeness: ReturnType<typeof inspectionCompleteness.analyze>;
  copilot: ReturnType<typeof inspectionCopilot.analyze>;
  learningPatterns: Awaited<ReturnType<typeof learningEngine.getPatterns>>;
  priorities: Array<{
    id: string;
    title: string;
    section?: string;
    severity: "info" | "warning" | "critical";
    reason: string;
    recommendation: string;
    score: number;
  }>;
  publishConfidence: number;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function priorityScore(item: {
  severity?: string;
  confidence?: number;
  blocking?: boolean;
  sectionScore?: number;
}) {
  const severity = clean(item.severity).toLowerCase();
  let score = item.blocking ? 100 : 20;

  if (severity.includes("critical") || severity.includes("major") || severity.includes("safety")) {
    score += 55;
  } else if (severity.includes("warning") || severity.includes("repair")) {
    score += 35;
  } else {
    score += 15;
  }

  score += Math.round((Number(item.confidence) || 0.75) * 20);
  if (Number.isFinite(item.sectionScore) && Number(item.sectionScore) < 50) score += 15;

  return Math.min(100, score);
}

function dedupePriorities(
  priorities: UnifiedInspectionIntelligence["priorities"],
) {
  const seen = new Set<string>();

  return priorities
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      const key = `${clean(item.section).toLowerCase()}|${clean(item.title).toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

export async function buildUnifiedInspectionIntelligence(
  input: UnifiedInspectionInput,
): Promise<UnifiedInspectionIntelligence> {
  const findings = input.findings || [];
  const equipment = input.equipment || [];
  const photos = input.photos || [];
  const limitations = input.limitations || [];
  const checklist = input.checklist || [];
  const referencePhotos = input.referencePhotos || [];
  const memoryEvents = input.memoryEvents || [];

  const graph = buildInspectionGraph({
    inspection: input.inspection,
    findings,
    equipment,
    photos,
    limitations,
    checklist,
    referencePhotos,
    memoryEvents,
  });

  const memory = houseMemory.buildFromInspection({
    inspection: input.inspection,
    findings,
    equipment,
    memoryEvents,
  });

  const relationships = houseRelationshipEngine.analyze({
    findings,
    equipment,
  });

  const checklistEvidence = checklist.map((item: any) => ({
    id: `checklist-${item.id}`,
    section: item.section,
    title: item.group_title || "Checklist evidence",
    observation: [item.custom_text, item.value].map(clean).filter(Boolean).join(" "),
    severity: "Informational",
  }));

  const memoryEvidence = memoryEvents
    .filter((item: any) =>
      ["accepted", "checked", "completed", "saved", "confirmed"].includes(
        clean(item.status).toLowerCase(),
      ),
    )
    .map((item: any) => ({
      id: `memory-${item.id}`,
      section: item.section,
      title: item.title || item.event_type || "Inspector-confirmed evidence",
      observation: item.detail || "Inspector confirmed this item during the inspection.",
      severity: "Informational",
    }));

  const completeness = inspectionCompleteness.analyze({
    findings: [...findings, ...checklistEvidence, ...memoryEvidence],
    photos: [...photos, ...referencePhotos],
    equipment,
    limitations,
  });

  const copilot = inspectionCopilot.analyze({
    inspection: input.inspection,
    findings,
    equipment,
    photos,
    houseMemory: memory,
    question: input.question || "",
  });

  const learningPatterns = await learningEngine.getPatterns(240);

  const priorities = dedupePriorities([
    ...completeness.issues.map((issue: any) => {
      const sectionScore =
        completeness.sectionReviews.find((review: any) => review.section === issue.section)
          ?.score ?? 100;

      return {
        id: `completeness-${issue.id}`,
        title: issue.title,
        section: issue.section,
        severity: issue.severity,
        reason: issue.reason,
        recommendation: issue.recommendation,
        score: priorityScore({
          severity: issue.severity,
          blocking: issue.severity === "critical",
          sectionScore,
        }),
      };
    }),
    ...copilot.priorityIssues.map((issue: any) => ({
      id: `copilot-${issue.id}`,
      title: issue.title,
      section: issue.section,
      severity: issue.severity,
      reason: issue.reason,
      recommendation: issue.recommendation,
      score: priorityScore({ severity: issue.severity }),
    })),
    ...graph.relationships.map((relationship) => ({
      id: `relationship-${relationship.id}`,
      title: relationship.title,
      section: relationship.sections.join(" / "),
      severity: relationship.confidence >= 0.9 ? "warning" as const : "info" as const,
      reason: relationship.explanation,
      recommendation: relationship.recommendation,
      score: priorityScore({
        severity: relationship.confidence >= 0.9 ? "warning" : "info",
        confidence: relationship.confidence,
      }),
    })),
  ]);

  const relationshipPenalty = Math.min(15, graph.relationships.length * 3);
  const criticalPenalty = priorities.filter((item) => item.severity === "critical").length * 10;
  const publishConfidence = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        graph.score * 0.4 +
          completeness.score * 0.4 +
          copilot.confidence * 0.2 -
          relationshipPenalty -
          criticalPenalty,
      ),
    ),
  );

  return {
    generatedAt: new Date().toISOString(),
    graph,
    graphPrompt: formatInspectionGraphForPrompt(graph),
    memory,
    relationships,
    completeness,
    copilot,
    learningPatterns,
    priorities,
    publishConfidence,
  };
}
