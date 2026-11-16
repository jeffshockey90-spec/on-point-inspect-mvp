// Gate for routes that spend money per call (OpenAI, RentCast, Google, ffmpeg)
// and/or load an inspection's data into an AI prompt. Several of these took
// requests with NO login (a script could drain the API budgets) and passed any
// body `inspectionId` straight to service-role loaders (pulling another
// company's report text into the prompt).
//
//   - A signed-in user passes. A requested inspection id is kept ONLY if they
//     can access it; otherwise it's dropped (null), never an error.
//   - With no session, a share token (`lookup`) for the inspection passes — for
//     the no-login client pages that legitimately use AI (repair estimate).
//   - Anyone else gets 401.
import { NextResponse } from "next/server";
import { authorizeInspection, getAdminClient, getSessionUser } from "./apiAuth";
import { resolveCardInspection } from "./portalViewer";

export type AiGuardResult =
  | { ok: true; userId: string | null; inspectionId: string | null }
  | { ok: false; response: NextResponse };

export async function guardAiRequest(
  opts: { inspectionId?: unknown; lookup?: unknown } = {},
): Promise<AiGuardResult> {
  const requested = String(opts.inspectionId ?? "").trim() || null;
  const user = await getSessionUser().catch(() => null);

  if (user) {
    if (!requested) return { ok: true, userId: user.id, inspectionId: null };
    const owned = await authorizeInspection(getAdminClient(), user.id, requested).catch(() => null);
    return { ok: true, userId: user.id, inspectionId: owned ? requested : null };
  }

  const lookup = String(opts.lookup ?? "").trim();
  if (lookup) {
    const resolved = await resolveCardInspection(getAdminClient(), lookup).catch(() => null);
    if (resolved?.inspection?.id) {
      return { ok: true, userId: null, inspectionId: String(resolved.inspection.id) };
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
  };
}
