import crypto from "crypto";

// Outbound webhook delivery. Given an event, find the owner's enabled endpoints
// subscribed to it and POST a signed payload. Fire-and-forget: callers should
// `void emitWebhook(...)` so a slow/broken subscriber never blocks the app.
//
// Signature (subscriber verifies): X-Flow-Signature: sha256=<hex> where
//   hex = HMAC_SHA256(endpoint.secret, `${timestamp}.${body}`)
// plus X-Flow-Timestamp (unix seconds) and X-Flow-Event headers.

type EmitOptions = {
  ownerUserId: string;
  event: string;
  data: Record<string, any>;
};

export async function emitWebhook(
  admin: { from: (t: string) => any },
  { ownerUserId, event, data }: EmitOptions,
): Promise<void> {
  try {
    if (!ownerUserId || !event) return;

    const { data: endpoints } = await admin
      .from("webhook_endpoints")
      .select("id, url, secret, events, enabled")
      .eq("user_id", ownerUserId)
      .eq("enabled", true);

    const targets = (endpoints || []).filter(
      (e: any) => !Array.isArray(e.events) || e.events.length === 0 || e.events.includes(event),
    );
    if (targets.length === 0) return;

    const timestamp = Math.floor(new Date().getTime() / 1000).toString();
    const body = JSON.stringify({
      id: crypto.randomUUID(),
      event,
      created_at: new Date().toISOString(),
      data,
    });

    await Promise.allSettled(
      targets.map((endpoint: any) => {
        const signature = crypto
          .createHmac("sha256", String(endpoint.secret))
          .update(`${timestamp}.${body}`, "utf8")
          .digest("hex");
        return fetch(String(endpoint.url), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Flow-Event": event,
            "X-Flow-Timestamp": timestamp,
            "X-Flow-Signature": `sha256=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(8000),
        }).catch(() => undefined);
      }),
    );
  } catch {
    // Webhook delivery must never break the originating request.
  }
}

export function generateWebhookSecret() {
  return "whsec_" + crypto.randomBytes(24).toString("base64url");
}
