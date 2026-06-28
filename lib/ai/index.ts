export { inspectionBrain, InspectionBrain } from "./InspectionBrain";
export { promptEngine, PromptEngine } from "./PromptEngine";
export { confidenceEngine, ConfidenceEngine } from "./ConfidenceEngine";
export { aiContext, AIContext } from "./AIContext";
export { learningEngine, LearningEngine } from "./LearningEngine";
export { qualityControl, QualityControl } from "./QualityControl";
export { visionBrain, VisionBrain } from "./VisionBrain";
export { equipmentBrain, EquipmentBrain } from "./EquipmentBrain";
export { houseMemory, HouseMemory } from "./HouseMemory";
export { inspectionCompleteness, InspectionCompleteness } from "./InspectionCompleteness";
export { inspectionCopilot, InspectionCopilot } from "./InspectionCopilot";
export { houseRelationshipEngine, HouseRelationshipEngine } from "./HouseRelationshipEngine";
export { inspectionTimelineEngine, InspectionTimelineEngine } from "./InspectionTimelineEngine";
export { aiPublishGuard, AIPublishGuard } from "./AIPublishGuard";

// Knowledge Layer
export { materialDatabase, MaterialDatabase } from "./knowledge/MaterialDatabase";
export { defectDatabase, DefectDatabase } from "./knowledge/DefectDatabase";

export type { InspectionAIRequest } from "./InspectionBrain";
export type { PromptContext } from "./PromptEngine";
export type { ConfidenceInput, ConfidenceResult } from "./ConfidenceEngine";
export type { AIInspectionContext } from "./AIContext";
export type { LearningEvent } from "./LearningEngine";
export type { ReportQualityInput, QualityIssue } from "./QualityControl";
export type {
  VisionImageInput,
  VisionObservation,
  VisionAnalysisResult,
} from "./VisionBrain";
export type {
  HouseMemoryFact,
  HouseMemorySnapshot,
  HouseMemorySystem,
} from "./HouseMemory";
export type {
  InspectionCompletenessResult,
  InspectionIssue,
} from "./InspectionCompleteness";
export type {
  InspectionCopilotResult,
  CopilotIssue,
  RelatedFindingCluster,
} from "./InspectionCopilot";
export type {
  HouseRelationship,
  HouseRelationshipFinding,
  HouseRelationshipResult,
  RelationshipSeverity,
} from "./HouseRelationshipEngine";
export type {
  InspectionTimelineEvent,
  InspectionTimelineResult,
  TimelineEventTone,
} from "./InspectionTimelineEngine";
export type {
  AIPublishGuardResult,
  PublishGuardIssue,
  PublishGuardSeverity,
} from "./AIPublishGuard";
