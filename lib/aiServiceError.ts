export type AIServiceErrorInfo = {
  status: number;
  code: "quota_exceeded" | "rate_limited" | "timeout" | "network_error" | "service_unavailable" | "unknown";
  title: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  technicalMessage?: string;
};

export function classifyAIServiceError(error: any): AIServiceErrorInfo {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 500);
  const raw = String(error?.message || error?.error?.message || "AI request failed.");
  const lower = raw.toLowerCase();
  const apiCode = String(error?.code || error?.error?.code || error?.type || error?.error?.type || "").toLowerCase();

  if (
    status === 429 &&
    (apiCode.includes("insufficient_quota") ||
      lower.includes("exceeded your current quota") ||
      lower.includes("billing details") ||
      lower.includes("usage limit"))
  ) {
    return {
      status: 429,
      code: "quota_exceeded",
      title: "AI review temporarily unavailable",
      message: "The OpenAI API account has no available quota. Add billing or increase the API usage budget, then retry.",
      retryable: false,
      technicalMessage: raw,
    };
  }

  if (status === 429 || apiCode.includes("rate_limit") || lower.includes("rate limit")) {
    const retryAfterSeconds = Number(error?.headers?.["retry-after"] || error?.response?.headers?.["retry-after"] || 15);
    return {
      status: 429,
      code: "rate_limited",
      title: "AI is busy",
      message: "The AI service is receiving too many requests. Wait briefly and retry.",
      retryable: true,
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 15,
      technicalMessage: raw,
    };
  }

  if (status === 408 || apiCode.includes("timeout") || lower.includes("timeout") || lower.includes("timed out")) {
    return {
      status: 504,
      code: "timeout",
      title: "AI review timed out",
      message: "The review took too long. Your report is safe; retry the review.",
      retryable: true,
      technicalMessage: raw,
    };
  }

  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econnreset")) {
    return {
      status: 503,
      code: "network_error",
      title: "AI connection unavailable",
      message: "The app could not reach the AI service. Check the connection and retry.",
      retryable: true,
      technicalMessage: raw,
    };
  }

  if (status >= 500) {
    return {
      status: 503,
      code: "service_unavailable",
      title: "AI service unavailable",
      message: "The AI service is temporarily unavailable. Your inspection data is safe.",
      retryable: true,
      technicalMessage: raw,
    };
  }

  return {
    status: status >= 400 && status < 600 ? status : 500,
    code: "unknown",
    title: "AI review could not run",
    message: "The report review could not be completed. Your report is safe and Publish Guard remains available.",
    retryable: true,
    technicalMessage: raw,
  };
}
