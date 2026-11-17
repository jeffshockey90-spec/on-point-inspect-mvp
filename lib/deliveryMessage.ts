// What a locked report says, and to whom. One source for the share page, the
// mold/radon results page and the PDF download, so the client and the agent
// each get the right screen when a published report is still locked.

export type LockAudience = "client" | "agent";
export type LockReason = "agreement" | "payment" | "both" | "unpublished";

const AGENT_ROLE = /realtor|agent|broker|transaction|coordinator|tc\b/i;

/** Agent when the link/viewer says so (cosmetic: the report is locked either way). */
export function lockAudience(role: unknown): LockAudience {
  return AGENT_ROLE.test(String(role || "")) ? "agent" : "client";
}

export function lockReason(state: {
  published: boolean;
  agreementComplete: boolean;
  paymentComplete: boolean;
}): LockReason {
  if (!state.published) return "unpublished";
  if (!state.agreementComplete && !state.paymentComplete) return "both";
  if (!state.agreementComplete) return "agreement";
  return "payment";
}

export function lockedCopy(reason: LockReason, audience: LockAudience, what: "report" | "results" = "report") {
  const thing = what === "results" ? "lab results" : "inspection report";
  if (reason === "unpublished") {
    return {
      title: what === "results" ? "Results not available yet" : "Report not available yet",
      body: `This ${thing} hasn't been released yet. This link will show it once the inspector delivers it.`,
    };
  }
  if (audience === "agent") {
    const waitingOn =
      reason === "both"
        ? "the client signs the inspection agreement and pays for the inspection"
        : reason === "agreement"
          ? "the client signs the inspection agreement"
          : "the client pays for the inspection";
    return {
      title: what === "results" ? "Results locked" : "Report locked",
      body: `The ${thing} is complete. It unlocks for you as soon as ${waitingOn}. Check back on this same link.`,
    };
  }
  const steps =
    reason === "both"
      ? "your inspection agreement is signed and payment is received"
      : reason === "agreement"
        ? "your inspection agreement is signed"
        : "your payment is received";
  return {
    title: what === "results" ? "Your results are ready" : "Your report is ready",
    body: `Your ${thing} is complete. It unlocks for viewing and download as soon as ${steps}.`,
  };
}
