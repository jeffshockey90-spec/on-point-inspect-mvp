import { createClient } from "../../utils/supabase/server";

export type LearningEvent = {
  inspectionId?: number | string;
  tool: string;
  aiPrediction: Record<string, any>;
  inspectorResult: Record<string, any>;
  confidence?: number;
  accepted?: boolean;
  notes?: string;
};

export class LearningEngine {
  async record(event: LearningEvent) {
    try {
      const supabase = await createClient();

      const changes: Record<string,{ai:any;inspector:any}> = {};

      for (const key of Object.keys(event.inspectorResult || {})) {
        const ai = event.aiPrediction?.[key];
        const human = event.inspectorResult?.[key];
        if (JSON.stringify(ai) !== JSON.stringify(human)) {
          changes[key] = { ai, inspector: human };
        }
      }

      await supabase.from("ai_learning_events").insert({
        inspection_id: event.inspectionId ? Number(event.inspectionId) : null,
        tool: event.tool,
        ai_prediction: event.aiPrediction,
        inspector_result: event.inspectorResult,
        changed_fields: Object.keys(changes),
        changes,
        confidence: event.confidence ?? null,
        accepted: event.accepted ?? null,
        notes: event.notes ?? null,
        created_at: new Date().toISOString(),
      });

      return { success: true }
    } catch (err) {
      console.error("LearningEngine", err);
      return { success: false, error: err };
    }
  }
}

export const learningEngine = new LearningEngine();
