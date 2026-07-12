import { createClient } from "../../utils/supabase/server";

export type LearningEvent = {
  inspectionId?: number | string;
  tool: string;
  aiPrediction: Record<string, any>;
  inspectorResult: Record<string, any>;
  confidence?: number;
  accepted?: boolean | null;
  notes?: string;
};

export type InspectorLearningPatterns = {
  preferredPhrases: string[];
  avoidedPhrases: string[];
  recommendationStyle: string[];
  severityPreferences: string[];
  sectionPreferences: string[];
  acceptedSuggestionTypes: string[];
  ignoredSuggestionTypes: string[];
};

function cleanText(value: any) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(items: string[], limit: number) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of items) {
    const clean = cleanText(item);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }

  return output;
}

function firstWords(value: any, maxWords = 16) {
  return cleanText(value).split(" ").slice(0, maxWords).join(" ");
}

export class LearningEngine {
  async record(event: LearningEvent) {
    try {
      const supabase = await createClient();
      const changes: Record<string, { ai: any; inspector: any }> = {};

      const keys = new Set([
        ...Object.keys(event.aiPrediction || {}),
        ...Object.keys(event.inspectorResult || {}),
      ]);

      for (const key of keys) {
        const ai = event.aiPrediction?.[key];
        const human = event.inspectorResult?.[key];
        if (JSON.stringify(ai) !== JSON.stringify(human)) {
          changes[key] = { ai, inspector: human };
        }
      }

      const { error } = await supabase.from("ai_learning_events").insert({
        inspection_id: event.inspectionId ? Number(event.inspectionId) : null,
        tool: event.tool,
        ai_prediction: event.aiPrediction || {},
        inspector_result: event.inspectorResult || {},
        changed_fields: Object.keys(changes),
        changes,
        confidence: event.confidence ?? null,
        accepted: event.accepted ?? null,
        notes: event.notes ?? null,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error("LearningEngine", err);
      return { success: false, error: err };
    }
  }

  async getPatterns(limit = 180): Promise<InspectorLearningPatterns> {
    const empty: InspectorLearningPatterns = {
      preferredPhrases: [],
      avoidedPhrases: [],
      recommendationStyle: [],
      severityPreferences: [],
      sectionPreferences: [],
      acceptedSuggestionTypes: [],
      ignoredSuggestionTypes: [],
    };

    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("ai_learning_events")
        .select(
          "tool,ai_prediction,inspector_result,changed_fields,changes,accepted,confidence,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(Math.max(20, Math.min(500, limit)));

      if (error || !data?.length) return empty;

      const preferred: string[] = [];
      const avoided: string[] = [];
      const recommendationStyle: string[] = [];
      const severityPreferences: string[] = [];
      const sectionPreferences: string[] = [];
      const acceptedTypes: string[] = [];
      const ignoredTypes: string[] = [];

      for (const event of data as any[]) {
        const ai = event.ai_prediction || {};
        const inspector = event.inspector_result || {};
        const accepted = event.accepted;
        const suggestionType = cleanText(
          inspector.suggestionType || ai.suggestionType || inspector.type || ai.type,
        );

        if (accepted === true && suggestionType) acceptedTypes.push(suggestionType);
        if (accepted === false && suggestionType) ignoredTypes.push(suggestionType);

        for (const field of ["observation", "implication", "recommendation", "title"]) {
          const aiText = cleanText(ai[field]);
          const inspectorText = cleanText(inspector[field]);

          if (inspectorText && (accepted === true || inspectorText !== aiText)) {
            preferred.push(firstWords(inspectorText, 22));
          }

          if (aiText && inspectorText && aiText !== inspectorText) {
            avoided.push(firstWords(aiText, 18));
          }
        }

        if (inspector.recommendation) {
          recommendationStyle.push(firstWords(inspector.recommendation, 18));
        }

        if (ai.severity && inspector.severity && ai.severity !== inspector.severity) {
          severityPreferences.push(`${ai.severity} → ${inspector.severity}`);
        }

        if (ai.section && inspector.section && ai.section !== inspector.section) {
          sectionPreferences.push(`${ai.section} → ${inspector.section}`);
        }
      }

      return {
        preferredPhrases: unique(preferred, 16),
        avoidedPhrases: unique(avoided, 12),
        recommendationStyle: unique(recommendationStyle, 10),
        severityPreferences: unique(severityPreferences, 10),
        sectionPreferences: unique(sectionPreferences, 10),
        acceptedSuggestionTypes: unique(acceptedTypes, 8),
        ignoredSuggestionTypes: unique(ignoredTypes, 8),
      };
    } catch (error) {
      console.error("LearningEngine.getPatterns", error);
      return empty;
    }
  }

  formatPatternsForPrompt(patterns: InspectorLearningPatterns) {
    const lines: string[] = [];

    if (patterns.preferredPhrases.length) {
      lines.push("Preferred inspector wording:");
      lines.push(...patterns.preferredPhrases.map((item) => `- ${item}`));
    }

    if (patterns.avoidedPhrases.length) {
      lines.push("Wording the inspector commonly changes or avoids:");
      lines.push(...patterns.avoidedPhrases.map((item) => `- ${item}`));
    }

    if (patterns.recommendationStyle.length) {
      lines.push("Preferred recommendation style examples:");
      lines.push(...patterns.recommendationStyle.map((item) => `- ${item}`));
    }

    if (patterns.severityPreferences.length) {
      lines.push("Observed severity corrections:");
      lines.push(...patterns.severityPreferences.map((item) => `- ${item}`));
    }

    if (patterns.sectionPreferences.length) {
      lines.push("Observed section-routing corrections:");
      lines.push(...patterns.sectionPreferences.map((item) => `- ${item}`));
    }

    if (patterns.acceptedSuggestionTypes.length) {
      lines.push(
        `Suggestion types often accepted: ${patterns.acceptedSuggestionTypes.join(", ")}`,
      );
    }

    if (patterns.ignoredSuggestionTypes.length) {
      lines.push(
        `Suggestion types often ignored: ${patterns.ignoredSuggestionTypes.join(", ")}`,
      );
    }

    return lines.length
      ? lines.join("\n")
      : "No established inspector-specific learning patterns yet.";
  }
}

export const learningEngine = new LearningEngine();
