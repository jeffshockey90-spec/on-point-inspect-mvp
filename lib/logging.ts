import { createClient } from "../utils/supabase/server";

type LogLevel = "info" | "warning" | "error" | "success";

type AIStatus = "success" | "failed";

type AIReviewFlag = {
  code?: string;
  message?: string;
  severity?: "info" | "warning" | "error";
  field?: string;
};

type AIConfidence = {
  overall?: number | null;
  ocrQuality?: "excellent" | "good" | "fair" | "poor" | "unknown" | string | null;
  fieldConfidence?: Record<string, number | null>;
  evidence?: string[];
  reasoning?: string[];
  reviewFlags?: AIReviewFlag[];
};

type AILearningMetadata = {
  aiVersion?: string;
  model?: string;
  route?: string;
  inputType?: string;
  photoCount?: number;
  correctionEligible?: boolean;
  inspectorOverride?: boolean;
  correctionFields?: string[];
  source?: string;
  [key: string]: any;
};

function safeNumber(value: any) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function cleanMetadata(metadata: Record<string, any> = {}) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );
}

export async function logAppEvent({
  userId,
  level = "info",
  source,
  message,
  metadata = {},
}: {
  userId?: string | null;
  level?: LogLevel;
  source: string;
  message: string;
  metadata?: Record<string, any>;
}) {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from("app_logs").insert({
      user_id: userId ?? null,
      level,
      source,
      message,
      metadata: cleanMetadata(metadata),
    });

    if (error) {
      console.error("APP LOG INSERT ERROR:", error);
    } else {
      console.log("APP LOG INSERT SUCCESS");
    }
  } catch (error) {
    console.error("App logging failed:", error);
  }
}

export async function logAuditEvent({
  userId,
  action,
  resourceType,
  resourceId,
  metadata = {},
}: {
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string | number | null;
  metadata?: Record<string, any>;
}) {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from("audit_logs").insert({
      user_id: userId ?? null,
      action,
      resource_type: resourceType ?? null,
      resource_id: resourceId ? String(resourceId) : null,
      metadata: cleanMetadata(metadata),
    });

    if (error) {
      console.error("AUDIT LOG INSERT ERROR:", error);
    } else {
      console.log("AUDIT LOG INSERT SUCCESS");
    }
  } catch (error) {
    console.error("Audit logging failed:", error);
  }
}

export async function logEmailEvent({
  inspectionId,
  recipient,
  subject,
  status,
  resendId,
  metadata = {},
}: {
  inspectionId?: number | string | null;
  recipient?: string | null;
  subject?: string | null;
  status: "sent" | "failed" | "pending";
  resendId?: string | null;
  metadata?: Record<string, any>;
}) {
  try {
    console.log("EMAIL LOGGING CALLED");

    const supabase = await createClient();

    const { error } = await supabase.from("email_logs").insert({
      inspection_id_bigint: inspectionId ? Number(inspectionId) : null,
      recipient: recipient ?? null,
      subject: subject ?? null,
      status,
      resend_id: resendId ?? null,
      metadata: cleanMetadata(metadata),
    });

    if (error) {
      console.error("EMAIL LOG INSERT ERROR:", error);
    } else {
      console.log("EMAIL LOG INSERT SUCCESS");
    }
  } catch (error) {
    console.error("Email logging failed:", error);
  }
}

export async function logStripeEvent({
  inspectionId,
  paymentIntentId,
  amount,
  status,
  metadata = {},
}: {
  inspectionId?: number | string | null;
  paymentIntentId?: string | null;
  amount?: number | null;
  status: string;
  metadata?: Record<string, any>;
}) {
  try {
    console.log("STRIPE LOGGING CALLED");

    const supabase = await createClient();

    const { error } = await supabase.from("stripe_logs").insert({
      inspection_id: inspectionId ? Number(inspectionId) : null,
      payment_intent_id: paymentIntentId ?? null,
      amount: amount ?? null,
      status,
      metadata: cleanMetadata(metadata),
    });

    if (error) {
      console.error("STRIPE LOG INSERT ERROR:", error);
    } else {
      console.log("STRIPE LOG INSERT SUCCESS");
    }
  } catch (error) {
    console.error("Stripe logging failed:", error);
  }
}

export async function logAIEvent({
  userId,
  inspectionId,
  tool,
  prompt,
  response,
  tokensUsed,
  status,
  model,
  aiVersion,
  confidence,
  ocrQuality,
  reasoning,
  evidence,
  reviewFlags,
  fieldConfidence,
  processingMs,
  metadata = {},
}: {
  userId?: string | null;
  inspectionId?: number | string | null;
  tool: string;
  prompt?: string | null;
  response?: Record<string, any> | null;
  tokensUsed?: number | null;
  status: AIStatus;
  model?: string | null;
  aiVersion?: string | null;
  confidence?: number | AIConfidence | null;
  ocrQuality?: AIConfidence["ocrQuality"];
  reasoning?: string[] | null;
  evidence?: string[] | null;
  reviewFlags?: AIReviewFlag[] | null;
  fieldConfidence?: Record<string, number | null> | null;
  processingMs?: number | null;
  metadata?: AILearningMetadata;
}) {
  try {
    console.log("AI LOGGING CALLED");

    const supabase = await createClient();

    const confidenceObject: AIConfidence =
      typeof confidence === "object" && confidence !== null
        ? confidence
        : {
            overall: confidence ?? null,
            ocrQuality: ocrQuality ?? null,
            fieldConfidence: fieldConfidence ?? undefined,
            evidence: evidence ?? undefined,
            reasoning: reasoning ?? undefined,
            reviewFlags: reviewFlags ?? undefined,
          };

    const mergedResponse = cleanMetadata({
      ...(response ?? {}),
      aiIntelligence: cleanMetadata({
        model: model ?? metadata.model ?? null,
        aiVersion: aiVersion ?? metadata.aiVersion ?? null,
        confidence: confidenceObject.overall ?? null,
        ocrQuality: confidenceObject.ocrQuality ?? null,
        fieldConfidence: confidenceObject.fieldConfidence ?? null,
        evidence: confidenceObject.evidence ?? null,
        reasoning: confidenceObject.reasoning ?? null,
        reviewFlags: confidenceObject.reviewFlags ?? null,
        processingMs: processingMs ?? null,
        correctionEligible: metadata.correctionEligible ?? null,
        inspectorOverride: metadata.inspectorOverride ?? null,
        correctionFields: metadata.correctionFields ?? null,
      }),
    });

    const { error } = await supabase.from("ai_logs").insert({
      user_id: userId ?? null,
      inspection_id: inspectionId ? Number(inspectionId) : null,
      tool,
      prompt: prompt ?? null,
      response: mergedResponse,
      tokens_used: tokensUsed ?? null,
      status,
    });

    if (error) {
      console.error("AI LOG INSERT ERROR:", error);
    } else {
      console.log("AI LOG INSERT SUCCESS");
    }
  } catch (error) {
    console.error("AI logging failed:", error);
  }
}
