import crypto from "crypto";

// Public-API access keys. We store only a SHA-256 hash; the plaintext key is
// shown to the user exactly once at creation. Format: flow_<43 base64url chars>.

export function generateApiKey() {
  const raw = "flow_" + crypto.randomBytes(32).toString("base64url");
  return {
    key: raw,
    prefix: raw.slice(0, 12), // e.g. "flow_ab12cd" — safe to display
    hash: hashApiKey(raw),
  };
}

export function hashApiKey(key: string) {
  return crypto.createHash("sha256").update(key.trim(), "utf8").digest("hex");
}

/**
 * Authenticate a request by its `Authorization: Bearer <key>` header against
 * api_keys. Returns the owning user id (and key id) or null. Updates
 * last_used_at best-effort. `admin` must be a service-role client.
 */
export async function authenticateApiKey(
  request: Request,
  admin: { from: (t: string) => any },
): Promise<{ userId: string; keyId: string } | null> {
  const header = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const key = match?.[1]?.trim();
  if (!key) return null;

  const { data } = await admin
    .from("api_keys")
    .select("id, user_id, revoked")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();

  if (!data?.id || data.revoked) return null;

  // Best-effort usage stamp; never block the request on it.
  admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {}, () => {});

  return { userId: String(data.user_id), keyId: String(data.id) };
}
