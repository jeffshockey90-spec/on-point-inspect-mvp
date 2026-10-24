import { sendPushNotification } from "./push";

// Alerts the owning inspector when a CLIENT agrees to the optional social-media /
// content-use release — so they know that inspection's photos/video are cleared
// to post. Gated by a per-inspector toggle stored in
// profiles.notification_prefs.social_media_consent (default ON; read fail-safe).
// Never throws — a notification problem must not break the client's opt-in.

async function consentAlertsOn(admin: any, inspectorId: string): Promise<boolean> {
  if (!inspectorId) return false;
  try {
    const { data } = await admin
      .from("profiles")
      .select("notification_prefs")
      .eq("id", inspectorId)
      .maybeSingle();
    const prefs = data?.notification_prefs;
    if (prefs && typeof prefs === "object" && typeof prefs.social_media_consent === "boolean") {
      return prefs.social_media_consent;
    }
    return true; // default ON
  } catch {
    return true;
  }
}

export async function notifySocialMediaConsent(
  admin: any,
  opts: { inspection: any },
): Promise<void> {
  try {
    const insp = opts.inspection || {};
    const inspectorId = String(insp.inspector_id || "");
    if (!inspectorId) return;
    if (!(await consentAlertsOn(admin, inspectorId))) return;

    const client = insp.client_name ? ` ${insp.client_name}` : " A client";
    const addr = [insp.property_address, insp.city].filter(Boolean).join(", ");
    await sendPushNotification({
      target: "user",
      targetUserId: inspectorId,
      title: "Social-media release accepted 🎬",
      body: `${client} agreed to let you share photos/video from this inspection${addr ? ` — ${addr}` : ""}.`,
      url: insp.id ? `/reports/${insp.id}` : "/dashboard",
      eventType: "social_media_consent",
    }).catch(() => {});
  } catch {
    /* never block the opt-in */
  }
}
