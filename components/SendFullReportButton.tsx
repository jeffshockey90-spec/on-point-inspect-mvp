"use client";

import { useState } from "react";

type Props = {
  inspectionId: string;
  clientEmail?: string | null;
  realtorEmail?: string | null;
};

type MessageType = "success" | "error" | "warning" | "";

type PublishGuardResult = {
  score?: number;
  blocked?: boolean;
  readyToPublish?: boolean;
  recommendation?: string;
  issues?: Array<{
    id?: string;
    title?: string;
    severity?: string;
    section?: string;
    reason?: string;
    blocking?: boolean;
  }>;
  criticalIssues?: any[];
  warnings?: any[];
};

export default function SendFullReportButton({ inspectionId }: Props) {
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("Send Report");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");
  const [guardResult, setGuardResult] = useState<PublishGuardResult | null>(null);
  const [guardOverrideReady, setGuardOverrideReady] = useState(false);

  function showMessage(type: MessageType, text: string) {
    setMessageType(type);
    setMessage(text);
  }

  function clearMessage() {
    setMessageType("");
    setMessage("");
  }

  async function checkDeliveryRequirements() {
    setStatusText("Checking Requirements...");

    const res = await fetch(
      `/api/report-delivery-status?inspection_id=${inspectionId}`
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Could not check delivery requirements.");
    }

    if (!data.canDeliver) {
      throw new Error(
        `Report delivery is blocked until requirements are complete:

${(
          data.blockers || []
        ).join("
")}`
      );
    }

    return data;
  }

  async function runPublishGuard() {
    setStatusText("Running AI Guard...");

    const res = await fetch("/api/ai/publish-guard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ inspectionId, inspection_id: inspectionId }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || "AI Publish Guard failed.");
    }

    setGuardResult(data);
    return data as PublishGuardResult;
  }

  function buildGuardWarning(result: PublishGuardResult) {
    const scoreText =
      typeof result?.score === "number" ? `Score: ${result.score}/100. ` : "";

    const issues = Array.isArray(result?.issues) ? result.issues : [];
    const blockingIssues = issues.filter(
      (issue) => issue?.blocking || issue?.severity === "critical",
    );

    const issueText = blockingIssues
      .slice(0, 4)
      .map((issue) => {
        const section = issue?.section ? `${issue.section}: ` : "";
        return `• ${section}${issue?.title || issue?.reason || "Publish concern"}`;
      })
      .join("
");

    return `${scoreText}AI Publish Guard recommends review before sending.

${
      issueText || "Review the Publish Guard panel for details."
    }

Click Send Anyway to override and deliver the report.`;
  }

  async function sendReport() {
    if (sending) return;

    clearMessage();

    if (!inspectionId) {
      showMessage("error", "Missing inspection ID.");
      return;
    }

    setSending(true);
    setStatusText("Starting...");

    try {
      await checkDeliveryRequirements();

      const publishGuard = guardOverrideReady ? guardResult : await runPublishGuard();

      if (publishGuard?.blocked && !guardOverrideReady) {
        setStatusText("Send Anyway");
        setGuardOverrideReady(true);
        showMessage("warning", buildGuardWarning(publishGuard));
        return;
      }

      setStatusText("Sending Everyone...");

      const res = await fetch("/api/send-report-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          recipientType: "all",
          publishGuardOverride: Boolean(guardOverrideReady),
          publishGuardScore: publishGuard?.score ?? null,
          publishGuardRecommendation: publishGuard?.recommendation || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        throw new Error(data.error || "Failed to send report.");
      }

      const sent = Array.isArray(data.sent) ? data.sent : [];
      const failed = Array.isArray(data.failed) ? data.failed : [];

      if (failed.length > 0) {
        setStatusText("Completed With Errors");
        showMessage(
          "error",
          `Report sent to ${sent.length} recipient${sent.length === 1 ? "" : "s"}, but ${failed.length} failed.`
        );
        return;
      }

      setStatusText("Sent!");
      setGuardOverrideReady(false);
      showMessage(
        "success",
        `Report sent successfully to ${sent.length} recipient${sent.length === 1 ? "" : "s"}.`
      );
    } catch (error: any) {
      setStatusText("Failed");
      showMessage("error", error?.message || "Failed to send report.");
    } finally {
      window.setTimeout(() => {
        setSending(false);
        setStatusText(guardOverrideReady ? "Send Anyway" : "Send Report");
      }, 900);
    }
  }

  return (
    <div className="w-full max-w-full space-y-2 sm:w-auto">
      <button
        type="button"
        onClick={sendReport}
        disabled={sending}
        aria-busy={sending}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-3 font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto [touch-action:manipulation] ${
          guardOverrideReady
            ? "border-yellow-500 bg-yellow-500/10 text-yellow-200 hover:bg-yellow-500/20"
            : "border-purple-500 text-purple-300 hover:bg-purple-500/10"
        }`}
      >
        {sending && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {statusText}
      </button>

      {guardOverrideReady && (
        <button
          type="button"
          onClick={() => {
            setGuardOverrideReady(false);
            setGuardResult(null);
            setStatusText("Send Report");
            clearMessage();
          }}
          disabled={sending}
          className="ml-0 inline-flex w-full items-center justify-center rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-300 hover:bg-slate-800 disabled:opacity-60 sm:ml-2 sm:w-auto"
        >
          Cancel Override
        </button>
      )}

      {message && (
        <div
          className={`whitespace-pre-line rounded-xl border px-4 py-3 text-sm font-bold ${
            messageType === "success"
              ? "border-emerald-500 bg-emerald-950/30 text-emerald-300"
              : messageType === "warning"
                ? "border-yellow-500 bg-yellow-950/30 text-yellow-300"
                : "border-red-500 bg-red-950/30 text-red-300"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
