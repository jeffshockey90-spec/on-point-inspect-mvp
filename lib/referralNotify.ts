import { sendPushNotification } from "./push";

// Alerts the owning inspector when a CLIENT requests a referral service (home
// security, insurance, or any future referral). Reusable — pass the inspection
// and a human label. Gated by a per-inspector toggle stored in
// profiles.notification_prefs.referral_requests (default ON; read fail-safe).
// Never throws — a notification problem must not break the client's opt-in.

async function referralAlertsOn(admin: any, inspectorId: string): Promise<boolean> {
  if (!inspectorId) return false;
  try {
    const { data } = await admin
      .from("profiles")
      .select("notification_prefs")
      .eq("id", inspectorId)
      .maybeSingle();
    const prefs = data?.notification_prefs;
    if (prefs && typeof prefs === "object" && typeof prefs.referral_requests === "boolean") {
      return prefs.referral_requests;
    }
    return true; // default ON
  } catch {
    return true;
  }
}

export async function notifyReferralRequested(
  admin: any,
  opts: { inspection: any; serviceLabel: string },
): Promise<void> {
  try {
    const insp = opts.inspection || {};
    const inspectorId = String(insp.inspector_id || "");
    if (!inspectorId) return;
    if (!(await referralAlertsOn(admin, inspectorId))) return;

    const client = insp.client_name ? ` for ${insp.client_name}` : "";
    const addr = [insp.property_address, insp.city].filter(Boolean).join(", ");
    await sendPushNotification({
      target: "user",
      targetUserId: inspectorId,
      title: `New ${opts.serviceLabel} referral request`,
      body: `A client requested ${opts.serviceLabel}${client}${addr ? ` — ${addr}` : ""}.`,
      url: insp.id ? `/reports/${insp.id}` : "/dashboard",
      eventType: "referral_request",
    }).catch(() => {});
  } catch {
    /* never block the opt-in */
  }
}
